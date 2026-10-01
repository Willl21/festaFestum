// Uji revisi PM 26 Sep 2026: florist tanpa jam (018), lonceng notifikasi
// (019), dan refund/laporan vendor (020). Jalankan dengan server hidup:
//   node test-revisi-pm2.js
//
// Yang paling mahal kalau bocor ada di bagian refund: uang yang disetujui
// dikembalikan HARUS keluar dari saldo/escrow vendor, dan tidak boleh bisa
// disetujui dua kali.
require('dotenv').config();
const assert = require('assert');
const pool = require('./src/config/db');
const { masukDenganKode } = require('./test-masuk');

const BASE = process.env.BASE_URL || 'http://localhost:4000/api/v1';

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const uniq = () => Math.random().toString(36).slice(2, 10);
const emails = [];
let lolos = 0;
const ok = (pesan) => { lolos++; console.log(`  OK  ${pesan}`); };

async function daftar(role) {
  const tag = uniq();
  const email = `t${tag}@mail.com`;
  const r = await api('/auth/register', {
    method: 'POST',
    body: { name: `T ${tag}`, email, phone: `0812${tag}`, password: 'password123', role },
  });
  assert.strictEqual(r.status, 201, `register gagal: ${JSON.stringify(r.body)}`);
  emails.push(email);
  return { token: r.body.token, email, user_id: r.body.user.user_id };
}

function tanggal(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function vendorDenganLayanan(category) {
  const vendor = await daftar('vendor_owner');
  const v = await api('/vendors', {
    method: 'POST', token: vendor.token,
    body: { business_name: `Uji PM2 ${uniq()}`, city: 'jakarta_selatan', description: 'uji' },
  });
  assert.strictEqual(v.status, 201, `buat vendor gagal: ${JSON.stringify(v.body)}`);
  const s = await api(`/vendors/${v.body.vendor.vendor_id}/services`, {
    method: 'POST', token: vendor.token,
    body: { service_name: `Paket ${category}`, category, price: 1000000, minimum_notice_days: 0 },
  });
  assert.strictEqual(s.status, 201, `buat layanan gagal: ${JSON.stringify(s.body)}`);
  return { ...vendor, vendor_id: v.body.vendor.vendor_id, service_id: s.body.service.service_id };
}

const notif = async (token) => (await api('/notifikasi', { token })).body;

(async () => {
  const customer = await daftar();

  // --- 018: florist memesan tanpa jam ---
  const florist = await vendorDenganLayanan('florist');
  const b = await api('/bookings', {
    method: 'POST', token: customer.token,
    body: {
      service_id: florist.service_id, event_date: tanggal(20),
      event_type: 'graduation', event_location_detail: 'Buket wisuda',
    },
  });
  assert.strictEqual(b.status, 201, `florist tanpa jam ditolak: ${JSON.stringify(b.body)}`);
  assert.strictEqual(b.body.booking.start_time, null);
  ok('florist memesan tanpa start_time, tersimpan NULL');

  const mua = await vendorDenganLayanan('makeup_artist');
  const tanpaJam = await api('/bookings', {
    method: 'POST', token: customer.token,
    body: {
      service_id: mua.service_id, event_date: tanggal(20),
      event_type: 'wedding', event_location_detail: 'Uji',
    },
  });
  assert.strictEqual(tanpaJam.status, 400, 'MUA tanpa jam harus ditolak');
  ok('kategori lain tetap wajib start_time (400)');

  // --- 019: notifikasi ---
  let n = await notif(florist.token);
  assert.strictEqual(n.belum_dibaca, 1);
  assert.match(n.data[0].judul, /Pesanan baru/);
  assert.strictEqual(n.data[0].tautan, '/vendor/pemesanan');
  ok('vendor dapat notifikasi pesanan baru');

  const bookingId = b.body.booking.booking_id;
  const terima = await api(`/bookings/${bookingId}/konfirmasi`, {
    method: 'PATCH', token: florist.token, body: { action: 'terima' },
  });
  assert.strictEqual(terima.status, 200);
  n = await notif(customer.token);
  assert.ok(n.data.some((x) => /diterima/.test(x.judul)), 'klien harus diberi tahu pesanannya diterima');
  ok('klien dapat notifikasi pesanan diterima');

  // Orang lain tidak melihat notifikasi ini.
  assert.strictEqual((await notif(mua.token)).belum_dibaca, 0);
  await api('/notifikasi/baca', { method: 'POST', token: florist.token });
  assert.strictEqual((await notif(florist.token)).belum_dibaca, 0);
  ok('notifikasi terpisah per akun, dan bisa ditandai dibaca');

  // --- 020: refund & laporan ---
  const refundDini = await api(`/bookings/${bookingId}/laporan`, {
    method: 'POST', token: customer.token,
    body: { jenis: 'refund', alasan: 'Belum bayar tapi coba refund' },
  });
  assert.strictEqual(refundDini.status, 409, 'refund pesanan yang belum dibayar harus 409');
  ok('refund ditolak untuk pesanan yang belum dibayar');

  const bukanPunya = await api(`/bookings/${bookingId}/laporan`, {
    method: 'POST', token: mua.token, body: { jenis: 'laporan', alasan: 'Bukan pesanan saya sendiri' },
  });
  assert.strictEqual(bukanPunya.status, 404, 'pesanan orang lain harus 404');
  ok('pesanan orang lain tidak bisa dilaporkan (404)');

  // Pembayaran DP dibuat lewat DB — tombol simulasi hanya ada di mode
  // simulasi, sedangkan tes ini harus jalan juga saat Midtrans sandbox aktif.
  await pool.query(
    `INSERT INTO payments (booking_id, payment_type, amount, gateway_status, method, paid_at)
     VALUES ($1, 'down_payment', 300000, 'success', 'bca_va', now())`,
    [bookingId]
  );
  await pool.query(`UPDATE bookings SET payment_status = 'dp_paid' WHERE booking_id = $1`, [bookingId]);

  const saldoAwal = (await api('/bookings/vendor/balance', { token: florist.token })).body.balance;
  assert.strictEqual(saldoAwal.escrow, 300000);

  const aju = await api(`/bookings/${bookingId}/laporan`, {
    method: 'POST', token: customer.token,
    body: { jenis: 'refund', alasan: 'Vendor tidak bisa dihubungi sejak DP dibayar' },
  });
  assert.strictEqual(aju.status, 201, `ajukan refund gagal: ${JSON.stringify(aju.body)}`);
  const kembar = await api(`/bookings/${bookingId}/laporan`, {
    method: 'POST', token: customer.token, body: { jenis: 'laporan', alasan: 'Pengajuan kedua sekaligus' },
  });
  assert.strictEqual(kembar.status, 409, 'dua pengajuan menunggu untuk satu pesanan harus 409');
  ok('refund diajukan; pengajuan kedua selagi menunggu ditolak (409)');

  const pesanan = (await api('/bookings', { token: customer.token })).body.data
    .find((x) => x.booking_id === bookingId);
  assert.strictEqual(pesanan.laporan.status, 'menunggu');
  ok('Pesanan Saya ikut membawa status pengajuan');

  // Admin: akun biasa dinaikkan lewat DB, lalu masuk ulang supaya token
  // membawa perannya.
  const admin = await daftar();
  await pool.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [admin.email]);
  // Admin wajib lewat langkah kode sejak migrasi 022 — lihat test-masuk.js.
  const adminToken = await masukDenganKode(admin.email);

  assert.strictEqual((await api('/admin/laporan', { token: customer.token })).status, 403);
  const antre = await api('/admin/laporan', { token: adminToken });
  const baris = antre.body.data.find((x) => x.booking_id === bookingId);
  assert.ok(baris, 'pengajuan harus muncul di antrean admin');
  assert.strictEqual(Number(baris.dibayar), 300000);
  ok('antrean admin memuat pengajuan beserta nominal yang sudah dibayar');

  const tolakKosong = await api(`/admin/laporan/${baris.laporan_id}`, {
    method: 'PATCH', token: adminToken, body: { action: 'tolak' },
  });
  assert.strictEqual(tolakKosong.status, 400, 'menolak tanpa catatan harus 400');

  const setujui = await api(`/admin/laporan/${baris.laporan_id}`, {
    method: 'PATCH', token: adminToken, body: { action: 'setujui' },
  });
  assert.strictEqual(setujui.status, 200, `setujui gagal: ${JSON.stringify(setujui.body)}`);
  assert.strictEqual(setujui.body.dikembalikan, 300000);
  const dua = await api(`/admin/laporan/${baris.laporan_id}`, {
    method: 'PATCH', token: adminToken, body: { action: 'setujui' },
  });
  assert.strictEqual(dua.status, 409, 'refund tidak boleh disetujui dua kali');
  ok('refund disetujui sekali; klik kedua 409');

  const saldoAkhir = (await api('/bookings/vendor/balance', { token: florist.token })).body.balance;
  assert.strictEqual(saldoAkhir.escrow, 0, 'dana yang di-refund harus keluar dari escrow vendor');
  const bk = await pool.query('SELECT payment_status FROM bookings WHERE booking_id = $1', [bookingId]);
  assert.strictEqual(bk.rows[0].payment_status, 'cancelled');
  ok('dana keluar dari escrow vendor dan pesanan jadi cancelled');

  assert.ok((await notif(customer.token)).data.some((x) => x.judul === 'Refund disetujui'));
  assert.ok((await notif(florist.token)).data.some((x) => /Refund klien disetujui/.test(x.judul)));
  ok('klien & vendor diberi tahu keputusan admin');

  console.log(`\n${lolos} pemeriksaan lolos.`);
})()
  .catch((err) => {
    console.error('GAGAL:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Urutan wajib: bookings dulu (ON DELETE RESTRICT ke users/services),
    // baru users. Notifikasi & laporan ikut CASCADE.
    const { rows } = await pool.query('SELECT user_id FROM users WHERE email = ANY($1)', [emails]);
    const ids = rows.map((r) => r.user_id);
    await pool.query(
      `DELETE FROM bookings WHERE user_id = ANY($1)
          OR vendor_id IN (SELECT vendor_id FROM vendors WHERE owner_user_id = ANY($1))`,
      [ids]
    );
    await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [ids]);
    console.log(`Data uji dibersihkan: ${ids.length} akun.`);
    await pool.end();
  });
