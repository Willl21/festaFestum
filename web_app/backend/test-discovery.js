// Uji schedule-first discovery di GET /vendors.
// Fokusnya satu aturan halus: kalau filter kategori DAN tanggal dipakai
// bersamaan, yang harus tersedia adalah layanan DI KATEGORI ITU — bukan
// layanan lain milik vendor yang sama.
//
// Skrip ini MEMBERSIHKAN datanya sendiri di akhir, jadi aman dijalankan
// berulang tanpa menumpuk sampah di DB.
// Jalankan dengan server hidup: node test-discovery.js
require('dotenv').config();
const assert = require('assert');
const pool = require('./src/config/db');

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

const TAG = `disc${Math.random().toString(36).slice(2, 8)}`;
const EMAIL = `${TAG}@discovery.test`;
const futureDate = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

let pass = 0;
const ok = (l) => { pass++; console.log(`  OK  ${l}`); };

// Apakah vendor kita muncul di hasil filter tertentu?
async function muncul(query) {
  const r = await api(`/vendors?limit=50&${query}`);
  assert.strictEqual(r.status, 200, `query gagal: ${JSON.stringify(r.body)}`);
  return r.body.data.some((v) => v.business_name === TAG);
}

(async () => {
  const reg = await api('/auth/register', {
    method: 'POST',
    body: {
      name: TAG, email: EMAIL, phone: '081200000000',
      password: 'password123', role: 'vendor_owner',
    },
  });
  assert.strictEqual(reg.status, 201, `register gagal: ${JSON.stringify(reg.body)}`);
  const token = reg.body.token;

  const vendor = await api('/vendors', {
    method: 'POST', token,
    body: { business_name: TAG, city: 'depok' },
  });
  assert.strictEqual(vendor.status, 201);
  const vendorId = vendor.body.vendor.vendor_id;

  // Satu vendor, DUA kategori — persis kasus yang mau diuji.
  const s = await api(`/vendors/${vendorId}/services`, {
    method: 'POST', token,
    body: { service_name: 'Paket Bunga', category: 'florist', price: 500000, minimum_notice_days: 7 },
  });
  assert.strictEqual(s.status, 201, `buat service gagal: ${JSON.stringify(s.body)}`);

  // Kategori kedua disisipkan LANGSUNG KE DB, bukan lewat API: sejak aturan
  // "satu vendor satu kategori" berlaku, POST /vendors/:id/services membalas
  // 409 untuk kategori kedua. Aturannya di level aplikasi, jadi baris seperti
  // ini masih mungkin ada dari data lama — dan justru itu yang harus tetap
  // aman dari kebocoran filter. Menguji lewat API akan menguji penjaganya,
  // bukan query discovery-nya.
  await pool.query(
    `INSERT INTO services (vendor_id, service_name, category, price, minimum_notice_days)
     VALUES ($1, 'Paket Foto', 'photographer', 500000, 7)`,
    [vendorId]
  );

  const TGL = futureDate(20);
  await api('/schedules', {
    method: 'POST', token,
    body: { slots: [{ event_date: TGL, time_slot: 'pagi' }] },
  });

  console.log('\nSchedule-first discovery:');

  assert.ok(await muncul('category=florist'), 'harusnya muncul di florist');
  ok('muncul di filter kategori florist');

  assert.ok(
    await muncul(`category=florist&event_date=${TGL}&time_slot=pagi`),
    'harusnya muncul: slot tersedia dan lead time terpenuhi'
  );
  ok('muncul saat tanggal tersedia + lead time terpenuhi');

  assert.ok(
    !(await muncul(`category=florist&event_date=${futureDate(3)}&time_slot=pagi`)),
    'harusnya TIDAK muncul: minimum_notice_days 7 hari belum terpenuhi'
  );
  ok('hilang saat tanggal terlalu mepet (minimum_notice_days ditegakkan)');

  assert.ok(
    !(await muncul(`category=florist&event_date=${TGL}&time_slot=malam`)),
    'harusnya TIDAK muncul: slot malam tidak dibuka'
  );
  ok('hilang saat shift yang diminta tidak dibuka');

  // --- Inti pengujian ----------------------------------------------------
  // Layanan florist dinonaktifkan, layanan photographer TETAP aktif dan
  // slotnya tetap ada. Kalau filter kategori & ketersediaan dipisah jadi dua
  // kondisi, vendor ini akan tetap lolos filter florist — itu bug-nya.
  await pool.query(
    `UPDATE services SET is_active = FALSE
      WHERE vendor_id = $1 AND category = 'florist'`,
    [vendorId]
  );

  assert.ok(
    !(await muncul(`category=florist&event_date=${TGL}&time_slot=pagi`)),
    'BUG: masih muncul di florist padahal layanan florist-nya nonaktif'
  );
  ok('tidak bocor ke kategori florist saat layanan florist nonaktif');

  assert.ok(
    await muncul(`category=photographer&event_date=${TGL}&time_slot=pagi`),
    'harusnya masih muncul di photographer'
  );
  ok('masih muncul di photographer, slot yang sama');

  console.log(`\n${pass} skenario lolos.`);
})()
  .catch((err) => {
    console.error('\nGAGAL:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Bersihkan apa pun yang terjadi, supaya DB tidak ketambahan sampah.
    const r = await pool.query('DELETE FROM users WHERE email = $1 RETURNING email', [EMAIL]);
    console.log(r.rows.length ? 'Data uji dibersihkan.\n' : 'Tidak ada data uji tersisa.\n');
    await pool.end();
  });
