// Uji rekening tujuan pencairan dana vendor (migrasi 021). Server harus hidup:
//   node test-payout-rekening.js
//
// Kasus gagal PATCH /auth/rekening sengaja tidak ada di sini (sudah di
// test-keamanan-rekening.js): endpoint itu dibatasi 8 percobaan gagal per 15
// menit, dan dua tes yang sama-sama menghabiskan jatah saling menjegal.
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
  return { token: r.body.token, email };
}

function tanggal(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const BCA = { bank_name: 'bca', bank_account_number: '8271000012349402', bank_account_holder: 'Uji Vendor Satu' };
const BNI = { bank_name: 'bni', bank_account_number: '0099887766', bank_account_holder: 'Uji Vendor Dua' };

(async () => {
  // Vendor florist dengan satu pesanan lunas yang acaranya sudah lewat,
  // supaya saldonya bisa dicairkan: 300.000 - 2,5% = 292.500.
  const vendor = await daftar('vendor_owner');
  const v = await api('/vendors', {
    method: 'POST', token: vendor.token,
    body: { business_name: `Uji Payout ${uniq()}`, city: 'jakarta_selatan', description: 'uji' },
  });
  assert.strictEqual(v.status, 201, `buat vendor gagal: ${JSON.stringify(v.body)}`);
  const s = await api(`/vendors/${v.body.vendor.vendor_id}/services`, {
    method: 'POST', token: vendor.token,
    body: { service_name: 'Paket uji', category: 'florist', price: 300000, minimum_notice_days: 0 },
  });
  assert.strictEqual(s.status, 201, `buat layanan gagal: ${JSON.stringify(s.body)}`);

  const customer = await daftar();
  const b = await api('/bookings', {
    method: 'POST', token: customer.token,
    body: {
      service_id: s.body.service.service_id, event_date: tanggal(20),
      event_type: 'graduation', event_location_detail: 'Uji payout',
    },
  });
  assert.strictEqual(b.status, 201, `buat pesanan gagal: ${JSON.stringify(b.body)}`);
  const bookingId = b.body.booking.booking_id;
  await pool.query(
    `INSERT INTO payments (booking_id, payment_type, amount, gateway_status, method, paid_at)
     VALUES ($1, 'settlement', 300000, 'success', 'bca_va', now())`,
    [bookingId]
  );
  await pool.query(
    `UPDATE bookings SET payment_status = 'fully_paid', confirm_status = 'diterima',
                         event_date = CURRENT_DATE - 1
      WHERE booking_id = $1`,
    [bookingId]
  );
  const saldo = (await api('/bookings/vendor/balance', { token: vendor.token })).body.balance;
  assert.ok(saldo.saldo_tersedia > 0, `saldo uji harus positif: ${JSON.stringify(saldo)}`);

  // 1. Tanpa rekening, pencairan ditolak.
  const tanpa = await api('/payouts', { method: 'POST', token: vendor.token, body: { amount: 100000 } });
  assert.strictEqual(tanpa.status, 400, `tarik dana tanpa rekening harus 400, dapat ${tanpa.status}`);
  assert.match(tanpa.body.message, /rekening/i);
  ok('tarik dana tanpa rekening ditolak (400)');

  // 2. Simpan rekening (wajib sandi), lalu ajukan.
  const rek = (isi) => api('/auth/rekening', {
    method: 'PATCH', token: vendor.token, body: { current_password: 'password123', ...isi },
  });
  assert.strictEqual((await rek(BCA)).status, 200);
  const aju = await api('/payouts', { method: 'POST', token: vendor.token, body: { amount: 100000 } });
  assert.strictEqual(aju.status, 201, `ajukan gagal: ${JSON.stringify(aju.body)}`);
  assert.strictEqual(aju.body.payout.bank_name, 'bca');
  assert.strictEqual(aju.body.payout.bank_account_number, BCA.bank_account_number);
  assert.strictEqual(aju.body.payout.bank_account_holder, 'UJI VENDOR SATU');
  const payoutId = aju.body.payout.payout_id;
  ok('pengajuan menyalin rekening vendor saat itu');

  // 3. Ganti rekening SESUDAH mengajukan: pengajuan lama tidak ikut berbelok.
  assert.strictEqual((await rek(BNI)).status, 200);
  const riwayat = (await api('/payouts', { token: vendor.token })).body.data;
  const lama = riwayat.find((p) => p.payout_id === payoutId);
  assert.strictEqual(lama.bank_account_number, BCA.bank_account_number,
    'rekening pengajuan lama ikut berubah saat vendor ganti rekening');
  ok('ganti rekening sesudah mengajukan tidak mengubah tujuan pengajuan lama');

  // 4. Admin melihat rekening tujuan di antrean.
  const admin = await daftar();
  await pool.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [admin.email]);
  // Admin wajib lewat langkah kode sejak migrasi 022 — lihat test-masuk.js.
  const adminToken = await masukDenganKode(admin.email);
  let antre = (await api('/admin/payouts?status=pending', { token: adminToken })).body.data;
  let po = antre.find((p) => p.payout_id === payoutId);
  assert.ok(po, 'pengajuan tidak muncul di antrean admin');
  assert.strictEqual(po.bank_account_number, BCA.bank_account_number);
  assert.strictEqual(po.rekening_terkini, false);
  ok('admin melihat rekening yang tercatat saat pengajuan');

  // 5. Baris lama (sebelum 021, tanpa salinan) jatuh ke rekening vendor saat
  //    ini dan ditandai begitu.
  const { rows: [legacy] } = await pool.query(
    `INSERT INTO payouts (vendor_id, amount) VALUES ($1, 1000) RETURNING payout_id`,
    [v.body.vendor.vendor_id]
  );
  antre = (await api('/admin/payouts?status=pending', { token: adminToken })).body.data;
  po = antre.find((p) => p.payout_id === legacy.payout_id);
  assert.strictEqual(po.bank_account_number, BNI.bank_account_number);
  assert.strictEqual(po.rekening_terkini, true);
  ok('pengajuan lama tanpa salinan memakai rekening vendor saat ini, ditandai rekening_terkini');

  console.log(`\n${lolos} pemeriksaan lolos.`);
})()
  .catch((err) => {
    console.error('GAGAL:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // bookings dulu (ON DELETE RESTRICT), baru users; payouts & payments ikut CASCADE.
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
