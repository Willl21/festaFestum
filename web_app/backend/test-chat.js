// Obrolan (migrasi 015): tiga jenis percakapan, siapa boleh masuk, dan
// hitungan belum-dibaca. Jalankan dengan server hidup: node test-chat.js
const assert = require('assert');
const pool = require('./src/config/db');

const BASE = process.env.BASE_URL || 'http://localhost:4000/api/v1';
const DIBUAT = [];

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

async function register(role) {
  const tag = uniq();
  const email = `c${tag}@mail.com`;
  const r = await api('/auth/register', {
    method: 'POST',
    body: { name: `C ${tag}`, email, phone: `0816${tag}`, password: 'password123', role },
  });
  assert.strictEqual(r.status, 201, `register gagal: ${JSON.stringify(r.body)}`);
  DIBUAT.push(email);
  return { token: r.body.token, email };
}

// Admin tidak bisa didaftarkan lewat API — perannya dinaikkan langsung di DB,
// sama seperti akun admin sungguhan proyek ini.
async function registerAdmin() {
  const { token, email } = await register('customer');
  await pool.query("UPDATE users SET role = 'admin' WHERE email = $1", [email]);
  const masuk = await api('/auth/login', {
    method: 'POST', body: { email, password: 'password123' },
  });
  assert.strictEqual(masuk.status, 200, `login admin gagal: ${JSON.stringify(masuk.body)}`);
  return masuk.body.token;
}

const futureDate = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

let lolos = 0;
function cek(nama, syarat, detail = '') {
  assert.ok(syarat, `${nama} GAGAL ${detail}`);
  console.log(`  ok  ${nama}`);
  lolos++;
}

(async () => {
  // --- Persiapan: vendor + layanan + satu pesanan ---
  const vendor = await register('vendor_owner');
  const v = await api('/vendors', {
    method: 'POST', token: vendor.token,
    body: { business_name: `Chat Uji ${uniq()}`, city: 'depok' },
  });
  assert.strictEqual(v.status, 201, `buat vendor gagal: ${JSON.stringify(v.body)}`);
  const vendorId = v.body.vendor.vendor_id;

  const s = await api(`/vendors/${vendorId}/services`, {
    method: 'POST', token: vendor.token,
    body: { service_name: 'Buket Uji', category: 'florist', price: 500000, minimum_notice_days: 0 },
  });
  assert.strictEqual(s.status, 201, `buat layanan gagal: ${JSON.stringify(s.body)}`);

  const klien = await register('customer');
  const pesan = await api('/bookings', {
    method: 'POST', token: klien.token,
    body: {
      service_id: s.body.service.service_id, event_date: futureDate(30), start_time: '10:00',
      event_type: 'wedding', event_location_detail: 'Gedung Uji',
    },
  });
  assert.strictEqual(pesan.status, 201, `buat pesanan gagal: ${JSON.stringify(pesan.body)}`);
  const bookingId = pesan.body.booking.booking_id;

  // --- 1. Obrolan pesanan: dibuka klien, idempoten ---
  console.log('\n[klien <-> vendor]');
  const buka = await api('/chat', {
    method: 'POST', token: klien.token, body: { booking_id: bookingId },
  });
  cek('buka obrolan pesanan -> 201', buka.status === 201, JSON.stringify(buka.body));
  const convId = buka.body.conversation.conversation_id;

  const lagi = await api('/chat', {
    method: 'POST', token: klien.token, body: { booking_id: bookingId },
  });
  cek('dibuka dua kali -> ruang yang sama, 200',
    lagi.status === 200 && lagi.body.conversation.conversation_id === convId,
    `${lagi.status} ${JSON.stringify(lagi.body?.conversation?.conversation_id)}`);

  cek('kepala percakapan bawa konteks pesanan',
    buka.body.conversation.nama_vendor && buka.body.conversation.event_date,
    JSON.stringify(buka.body.conversation));

  // --- 2. Kirim & baca ---
  const kirim = await api(`/chat/${convId}/pesan`, {
    method: 'POST', token: klien.token, body: { body: 'Halo, bunganya bisa warna putih?' },
  });
  cek('klien kirim pesan -> 201', kirim.status === 201, JSON.stringify(kirim.body));
  // Balasan POST harus SELENGKAP baris di GET. Waktu dia cuma membalas kolom
  // mentah tabel messages, peran_pengirim ikut kosong dan bubble pesan yang
  // baru dikirim nongol di sisi lawan bicara sampai penarikan berikutnya.
  cek('balasan kirim bawa nama & peran pengirim',
    kirim.body.message.peran_pengirim === 'customer' && !!kirim.body.message.nama_pengirim,
    JSON.stringify(kirim.body.message));

  const kosong = await api(`/chat/${convId}/pesan`, {
    method: 'POST', token: klien.token, body: { body: '   ' },
  });
  cek('pesan kosong ditolak 400', kosong.status === 400, JSON.stringify(kosong.body));

  const belumVendor = await api('/chat/belum-dibaca', { token: vendor.token });
  cek('vendor punya 1 belum dibaca', belumVendor.body.jumlah === 1,
    JSON.stringify(belumVendor.body));
  const belumKlien = await api('/chat/belum-dibaca', { token: klien.token });
  cek('pesan sendiri tidak dihitung belum dibaca', belumKlien.body.jumlah === 0,
    JSON.stringify(belumKlien.body));

  const vendorBuka = await api(`/chat/${convId}`, { token: vendor.token });
  cek('vendor bisa membuka obrolan pesanannya', vendorBuka.status === 200,
    JSON.stringify(vendorBuka.body));
  cek('isinya 1 pesan', vendorBuka.body.data.length === 1);

  const sesudahDibaca = await api('/chat/belum-dibaca', { token: vendor.token });
  cek('membuka = menandai terbaca', sesudahDibaca.body.jumlah === 0,
    JSON.stringify(sesudahDibaca.body));

  const balas = await api(`/chat/${convId}/pesan`, {
    method: 'POST', token: vendor.token, body: { body: 'Bisa Kak, putih tersedia.' },
  });
  cek('vendor membalas -> 201', balas.status === 201, JSON.stringify(balas.body));
  cek('peran di balasan vendor ikut benar',
    balas.body.message.peran_pengirim === 'vendor_owner',
    JSON.stringify(balas.body.message));

  // --- 3. Orang luar tidak boleh masuk ---
  const asing = await register('customer');
  const curi = await api(`/chat/${convId}`, { token: asing.token });
  cek('orang lain membuka -> 404 (bukan 403)', curi.status === 404,
    `dapat ${curi.status} ${JSON.stringify(curi.body)}`);
  const curiKirim = await api(`/chat/${convId}/pesan`, {
    method: 'POST', token: asing.token, body: { body: 'nyelonong' },
  });
  cek('orang lain mengirim -> 404', curiKirim.status === 404,
    `dapat ${curiKirim.status}`);

  const pesananOrangLain = await api('/chat', {
    method: 'POST', token: asing.token, body: { booking_id: bookingId },
  });
  cek('buka obrolan pesanan orang lain -> 404', pesananOrangLain.status === 404,
    `dapat ${pesananOrangLain.status}`);

  // --- 4. Tiket ke admin ---
  console.log('\n[tiket admin]');
  const admin = await registerAdmin();

  const tiketVendor = await api('/chat', {
    method: 'POST', token: vendor.token, body: { jenis: 'admin_vendor' },
  });
  cek('vendor buka tiket admin -> 201', tiketVendor.status === 201,
    JSON.stringify(tiketVendor.body));
  const tiketVendorLagi = await api('/chat', {
    method: 'POST', token: vendor.token, body: { jenis: 'admin_vendor' },
  });
  cek('tiket vendor idempoten',
    tiketVendorLagi.body.conversation.conversation_id ===
      tiketVendor.body.conversation.conversation_id);

  const tiketKlien = await api('/chat', {
    method: 'POST', token: klien.token, body: { jenis: 'admin_klien' },
  });
  cek('klien buka tiket admin -> 201', tiketKlien.status === 201,
    JSON.stringify(tiketKlien.body));

  await api(`/chat/${tiketVendor.body.conversation.conversation_id}/pesan`, {
    method: 'POST', token: vendor.token, body: { body: 'Pencairan saya belum masuk.' },
  });

  const daftarAdmin = await api('/chat', { token: admin });
  const idAdmin = daftarAdmin.body.data.map((c) => c.conversation_id);
  // Yang diperiksa: KEDUA tiket run ini kelihatan — bukan jumlah totalnya.
  // Admin memang melihat seluruh antrean, termasuk tiket sungguhan yang dibuka
  // vendor asli, jadi asersi berbasis panjang daftar akan patah sendiri begitu
  // ada satu saja tiket nyata di DB.
  cek('admin melihat kedua tiket run ini',
    idAdmin.includes(tiketVendor.body.conversation.conversation_id)
      && idAdmin.includes(tiketKlien.body.conversation.conversation_id),
    JSON.stringify(idAdmin));
  cek('admin TIDAK melihat obrolan klien-vendor', !idAdmin.includes(convId));
  cek('daftar admin bawa cuplikan pesan terakhir + belum dibaca',
    daftarAdmin.body.data.some((c) => c.pesan_terakhir && c.belum_dibaca === 1),
    JSON.stringify(daftarAdmin.body.data.map((c) => [c.pesan_terakhir, c.belum_dibaca])));

  const adminBalas = await api(
    `/chat/${tiketVendor.body.conversation.conversation_id}/pesan`,
    { method: 'POST', token: admin, body: { body: 'Sedang kami cek ya.' } }
  );
  cek('admin membalas tiket -> 201', adminBalas.status === 201, JSON.stringify(adminBalas.body));

  const adminNyelonong = await api(`/chat/${convId}/pesan`, {
    method: 'POST', token: admin, body: { body: 'ikut nimbrung' },
  });
  cek('admin tidak bisa masuk obrolan klien-vendor -> 404', adminNyelonong.status === 404,
    `dapat ${adminNyelonong.status}`);

  // --- 5. Daftar per peran & filter jenis ---
  console.log('\n[daftar]');
  const daftarKlien = await api('/chat', { token: klien.token });
  cek('klien melihat obrolan pesanan + tiketnya', daftarKlien.body.data.length === 2,
    JSON.stringify(daftarKlien.body.data.map((c) => c.jenis)));

  const daftarVendorPesanan = await api('/chat?jenis=klien_vendor', { token: vendor.token });
  cek('filter jenis dipatuhi',
    daftarVendorPesanan.body.data.length === 1 &&
      daftarVendorPesanan.body.data[0].jenis === 'klien_vendor',
    JSON.stringify(daftarVendorPesanan.body.data.map((c) => c.jenis)));

  cek('terbaru di atas',
    new Date(daftarKlien.body.data[0].last_message_at) >=
      new Date(daftarKlien.body.data[1].last_message_at));

  // --- 6. Bentuk percakapan yang tidak sah ditolak DB, bukan disimpan ---
  console.log('\n[constraint]');
  let ditolakDb = false;
  try {
    await pool.query(
      "INSERT INTO conversations (jenis, user_id) VALUES ('klien_vendor', $1)",
      [null]
    );
  } catch {
    ditolakDb = true;
  }
  cek('klien_vendor tanpa vendor/booking ditolak CHECK', ditolakDb);

  console.log(`\nOK: ${lolos} pemeriksaan lolos.`);
})()
  .catch((err) => {
    console.error('\nGAGAL:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (DIBUAT.length) {
      // conversations & messages ikut CASCADE dari users/bookings, jadi
      // urutannya sama dengan skrip lain: bookings dulu, baru users.
      await pool.query(
        `DELETE FROM bookings
          WHERE user_id IN (SELECT user_id FROM users WHERE email = ANY($1::text[]))`,
        [DIBUAT]
      );
      const r = await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [DIBUAT]);
      console.log(`Data uji dibersihkan: ${r.rowCount} akun.`);
    }
    await pool.end();
  });
