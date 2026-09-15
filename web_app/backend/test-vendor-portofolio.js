// Uji foto portofolio vendor. Jalankan dengan server hidup:
//   node test-vendor-galeri.js
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

const uniq = () => Math.random().toString(36).slice(2, 10);

// PNG 1x1 transparan — cukup untuk menguji validasi bentuk data URL.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PNG = `data:image/png;base64,${PNG_B64}`;

const emails = [];

async function buatVendor() {
  const tag = uniq();
  const email = `v${tag}@mail.com`;
  emails.push(email);
  const daftar = await api('/auth/register', {
    method: 'POST',
    body: {
      name: `V ${tag}`, email, phone: `0812${tag}`,
      password: 'password123', role: 'vendor_owner',
    },
  });
  assert.strictEqual(daftar.status, 201, `register gagal: ${JSON.stringify(daftar.body)}`);
  return { token: daftar.body.token, tag };
}

(async () => {
  const { token, tag } = await buatVendor();

  // Vendor belum punya profil: unggah ditolak rapi, bukan meledak 500.
  const belum = await api('/vendors/me/photos/0', { method: 'PUT', token, body: { image: PNG } });
  assert.strictEqual(belum.status, 404, 'unggah tanpa profil vendor harus 404');

  const buat = await api('/vendors', {
    method: 'POST', token,
    body: { business_name: `Studio ${tag}`, city: 'jakarta_selatan' },
  });
  assert.strictEqual(buat.status, 201, `buat vendor gagal: ${JSON.stringify(buat.body)}`);
  const vendorId = buat.body.vendor.vendor_id;

  // --- Validasi ---
  for (const [slot, image, kenapa] of [
    [3, PNG, 'slot di luar 0-2'],
    [-1, PNG, 'slot negatif'],
    [0, 'bukan-gambar', 'bukan data URL gambar'],
    [0, `data:image/png;base64,${'A'.repeat(200_001)}`, 'gambar terlalu besar'],
  ]) {
    const r = await api(`/vendors/me/photos/${slot}`, { method: 'PUT', token, body: { image } });
    assert.strictEqual(r.status, 400, `${kenapa} harus ditolak, dapat ${r.status}`);
  }

  // --- Mengisi slot belakang lebih dulu ---
  const loncat = await api('/vendors/me/photos/2', { method: 'PUT', token, body: { image: PNG } });
  assert.strictEqual(loncat.status, 200, `unggah slot 2 gagal: ${JSON.stringify(loncat.body)}`);
  assert.deepStrictEqual(loncat.body.photos, [false, false, true], 'slot kosong harus false');

  // --- Mengisi hero ---
  const hero = await api('/vendors/me/photos/0', { method: 'PUT', token, body: { image: PNG } });
  assert.deepStrictEqual(hero.body.photos, [true, false, true], 'slot lain ikut berubah');

  // --- Unggah ULANG slot yang sama harus MENGGANTI, bukan menambah baris ---
  // Ini yang dijaga indeks unik (vendor_id, sort_order) di migrasi 008. Tanpa
  // itu, vendor pelan-pelan mengumpulkan foto hantu yang tak bisa dihapus.
  await api('/vendors/me/photos/0', { method: 'PUT', token, body: { image: PNG } });
  const baris = await pool.query(
    'SELECT COUNT(*)::int n FROM portfolio_images WHERE vendor_id = $1',
    [vendorId]
  );
  assert.strictEqual(baris.rows[0].n, 2, 'unggah ulang menambah baris, bukan mengganti');

  // --- Gambarnya benar-benar bisa diambil sebagai berkas ---
  const gambar = await fetch(`${BASE}/vendors/${vendorId}/photo/0`);
  assert.strictEqual(gambar.status, 200, 'foto hero tidak bisa diambil');
  assert.strictEqual(gambar.headers.get('content-type'), 'image/png', 'content-type salah');
  const bytes = Buffer.from(await gambar.arrayBuffer());
  assert.strictEqual(bytes.toString('base64'), PNG_B64, 'isi gambar tidak utuh');

  // Endpoint gambar harus publik — dipasang sebagai <img src>, tanpa token.
  const slotKosong = await fetch(`${BASE}/vendors/${vendorId}/photo/1`);
  assert.strictEqual(slotKosong.status, 404, 'slot kosong harus 404 supaya Img jatuh ke emoji');

  // --- Listing membawa penanda, BUKAN gambarnya ---
  const listing = await api(`/vendors?city=jakarta_selatan&limit=50`);
  const saya = listing.body.data.find((v) => v.vendor_id === vendorId);
  assert.ok(saya, 'vendor tidak muncul di listing');
  assert.strictEqual(saya.has_photo, true, 'has_photo harus true');
  assert.ok(
    !JSON.stringify(saya).includes('base64'),
    'listing membawa data URL — payload-nya akan membengkak'
  );

  // --- Menghapus ---
  const hapus = await api('/vendors/me/photos/0', { method: 'PUT', token, body: { image: '' } });
  assert.deepStrictEqual(hapus.body.photos, [false, false, true], 'penghapusan gagal');
  const setelah = await fetch(`${BASE}/vendors/${vendorId}/photo/0`);
  assert.strictEqual(setelah.status, 404, 'foto terhapus masih bisa diambil');

  // --- Vendor lain tidak bisa menulis ke portofolio orang ---
  const lain = await buatVendor();
  const tolak = await api('/vendors/me/photos/0', {
    method: 'PUT', token: lain.token, body: { image: PNG },
  });
  assert.strictEqual(tolak.status, 404, 'vendor tanpa profil menembus portofolio milik orang');

  const tetap = await api('/vendors/me', { token });
  assert.deepStrictEqual(tetap.body.vendor.photos, [false, false, true], 'portofolio berubah oleh akun lain');

  console.log('SEMUA LOLOS');
})()
  .catch((e) => {
    console.error('GAGAL:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (emails.length) {
      await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
    }
    await pool.end();
  });
