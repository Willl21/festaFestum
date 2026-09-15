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
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const emails = [];

(async () => {
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
  const token = daftar.body.token;

  // Vendor belum punya profil: unggah harus ditolak, bukan meledak 500.
  const belum = await api('/vendors/me/photos/0', { method: 'PUT', token, body: { image: PNG } });
  assert.strictEqual(belum.status, 404, 'unggah tanpa profil vendor harus 404');

  const buat = await api('/vendors', {
    method: 'POST', token,
    body: { business_name: `Studio ${tag}`, city: 'jakarta_selatan' },
  });
  assert.strictEqual(buat.status, 201, `buat vendor gagal: ${JSON.stringify(buat.body)}`);

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
  // Ini kasus yang paling gampang salah: galeri masih kosong, lalu yang diisi
  // slot 2. Slot 0 dan 1 harus jadi string kosong, BUKAN null atau hilang.
  const loncat = await api('/vendors/me/photos/2', { method: 'PUT', token, body: { image: PNG } });
  assert.strictEqual(loncat.status, 200, `unggah slot 2 gagal: ${JSON.stringify(loncat.body)}`);
  assert.deepStrictEqual(loncat.body.gallery, ['', '', PNG], 'slot kosong harus string kosong');

  // --- Mengisi slot hero ---
  const hero = await api('/vendors/me/photos/0', { method: 'PUT', token, body: { image: PNG } });
  assert.deepStrictEqual(hero.body.gallery, [PNG, '', PNG], 'slot lain tidak boleh ikut berubah');

  // --- Terbaca lagi lewat GET /vendors/me ---
  const saya = await api('/vendors/me', { token });
  assert.deepStrictEqual(saya.body.vendor.gallery, [PNG, '', PNG], 'galeri tidak terbaca ulang');

  // --- Menghapus ---
  const hapus = await api('/vendors/me/photos/0', { method: 'PUT', token, body: { image: '' } });
  assert.deepStrictEqual(hapus.body.gallery, ['', '', PNG], 'penghapusan harus menyisakan slot');

  // --- Vendor lain tidak bisa menulis ke galeri orang ---
  const lainTag = uniq();
  const lainEmail = `w${lainTag}@mail.com`;
  emails.push(lainEmail);
  const lain = await api('/auth/register', {
    method: 'POST',
    body: {
      name: `W ${lainTag}`, email: lainEmail, phone: `0813${lainTag}`,
      password: 'password123', role: 'vendor_owner',
    },
  });
  const tolak = await api('/vendors/me/photos/0', {
    method: 'PUT', token: lain.body.token, body: { image: PNG },
  });
  assert.strictEqual(tolak.status, 404, 'vendor tanpa profil tidak boleh menembus galeri milik orang');

  const tetap = await api('/vendors/me', { token });
  assert.deepStrictEqual(tetap.body.vendor.gallery, ['', '', PNG], 'galeri berubah oleh akun lain');

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
