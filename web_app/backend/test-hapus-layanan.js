// Hapus layanan permanen: boleh kalau belum pernah dipesan, ditolak kalau sudah
// (bookings.service_id ON DELETE RESTRICT). Jalankan dengan server hidup:
//   node test-hapus-layanan.js
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
  const email = `h${tag}@mail.com`;
  const r = await api('/auth/register', {
    method: 'POST',
    body: { name: `H ${tag}`, email, phone: `0815${tag}`, password: 'password123', role },
  });
  assert.strictEqual(r.status, 201, `register gagal: ${JSON.stringify(r.body)}`);
  DIBUAT.push(email);
  return r.body.token;
}

async function buatLayanan(token, vendorId, nama) {
  const r = await api(`/vendors/${vendorId}/services`, {
    method: 'POST', token,
    body: { service_name: nama, category: 'florist', price: 500000, minimum_notice_days: 0 },
  });
  assert.strictEqual(r.status, 201, `buat layanan gagal: ${JSON.stringify(r.body)}`);
  return r.body.service.service_id;
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
  const token = await register('vendor_owner');
  const v = await api('/vendors', {
    method: 'POST', token,
    body: { business_name: `Hapus Uji ${uniq()}`, city: 'depok' },
  });
  assert.strictEqual(v.status, 201, `buat vendor gagal: ${JSON.stringify(v.body)}`);
  const vendorId = v.body.vendor.vendor_id;

  // --- 1. Layanan yang belum pernah dipesan boleh hilang ---
  const bersih = await buatLayanan(token, vendorId, 'Buket Belum Dipesan');
  const hapus = await api(`/services/${bersih}`, { method: 'DELETE', token });
  cek('hapus layanan tanpa pesanan -> 200', hapus.status === 200, JSON.stringify(hapus.body));

  const sisa = await pool.query('SELECT 1 FROM services WHERE service_id = $1', [bersih]);
  cek('barisnya benar-benar hilang dari DB', sisa.rows.length === 0);

  const daftar = await api('/vendors/me/services', { token });
  cek('tidak muncul lagi di katalog vendor',
    !daftar.body.data.some((s) => s.service_id === bersih));

  // --- 2. Layanan yang pernah dipesan ditolak, bukan meledak 500 ---
  const dipesan = await buatLayanan(token, vendorId, 'Buket Sudah Dipesan');
  const tokenCust = await register('customer');
  const pesan = await api('/bookings', {
    method: 'POST', token: tokenCust,
    body: {
      service_id: dipesan, event_date: futureDate(30), start_time: '10:00',
      event_type: 'wedding', event_location_detail: 'Gedung Uji',
    },
  });
  assert.strictEqual(pesan.status, 201, `buat pesanan gagal: ${JSON.stringify(pesan.body)}`);

  const ditolak = await api(`/services/${dipesan}`, { method: 'DELETE', token });
  cek('hapus layanan yang sudah dipesan -> 409', ditolak.status === 409,
    `dapat ${ditolak.status} ${JSON.stringify(ditolak.body)}`);
  cek('pesannya menyarankan menyembunyikan',
    /embunyi/i.test(ditolak.body?.message || ''), JSON.stringify(ditolak.body));

  const masihAda = await pool.query('SELECT 1 FROM services WHERE service_id = $1', [dipesan]);
  cek('layanannya tetap utuh sesudah ditolak', masihAda.rows.length === 1);

  // Jalan keluarnya tetap ada: sembunyikan.
  const sembunyi = await api(`/services/${dipesan}`, {
    method: 'PATCH', token, body: { is_active: false },
  });
  cek('sembunyikan tetap bisa -> 200 & is_active false',
    sembunyi.status === 200 && sembunyi.body.service.is_active === false,
    JSON.stringify(sembunyi.body));

  // --- 3. Layanan milik orang lain: 404, bukan 403 ---
  const tokenLain = await register('vendor_owner');
  const asing = await api(`/services/${dipesan}`, { method: 'DELETE', token: tokenLain });
  cek('vendor lain menghapus -> 404 (bukan 403)', asing.status === 404,
    `dapat ${asing.status} ${JSON.stringify(asing.body)}`);

  console.log(`\nOK: ${lolos} pemeriksaan lolos.`);
})()
  .catch((err) => {
    console.error('\nGAGAL:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (DIBUAT.length) {
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
