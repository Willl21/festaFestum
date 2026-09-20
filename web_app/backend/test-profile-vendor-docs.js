// Uji endpoint profil user & dokumen vendor. Jalankan dengan server hidup:
//   node test-profile-vendor-docs.js
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

// Semua email yang dibuat run ini, supaya bisa disapu di akhir.
const DIBUAT = [];

async function register(role) {
  const tag = uniq();
  const r = await api('/auth/register', {
    method: 'POST',
    body: {
      name: `T ${tag}`, email: `t${tag}@mail.com`, phone: `0812${tag}`,
      password: 'password123', role,
    },
  });
  assert.strictEqual(r.status, 201, `register gagal: ${JSON.stringify(r.body)}`);
  DIBUAT.push(`t${tag}@mail.com`);
  return r.body.token;
}

(async () => {
  // --- Profil user ---
  const userToken = await register('customer');

  let r = await api('/auth/me', {
    method: 'PATCH',
    token: userToken,
    body: {
      full_name: 'Clara Valery Sudibyo',
      birth_date: '1994-08-16',
      shipping_address: 'Apartemen Senopati Suites Tower 2',
      notification_prefs: { event_reminder: true, promo: false },
    },
  });
  assert.strictEqual(r.status, 200, `patch profil gagal: ${JSON.stringify(r.body)}`);
  assert.strictEqual(r.body.user.full_name, 'Clara Valery Sudibyo');
  assert.strictEqual(r.body.user.notification_prefs.promo, false);

  r = await api('/auth/me', { token: userToken });
  assert.strictEqual(r.body.user.shipping_address, 'Apartemen Senopati Suites Tower 2');
  assert.ok(!('password_hash' in r.body.user), 'password_hash bocor di GET /auth/me');

  // Field terlarang diabaikan, bukan diterapkan diam-diam.
  r = await api('/auth/me', { method: 'PATCH', token: userToken, body: { role: 'admin' } });
  assert.strictEqual(r.status, 400, 'role seharusnya tidak bisa diubah lewat PATCH /auth/me');
  r = await api('/auth/me', { token: userToken });
  assert.strictEqual(r.body.user.role, 'customer');

  // --- Vendor: daftar tanpa kota, lalu unggah dokumen ---
  const vendorToken = await register('vendor_owner');

  r = await api('/vendors', {
    method: 'POST', token: vendorToken,
    body: { business_name: `Elegance ${uniq()}` },
  });
  assert.strictEqual(r.status, 201, `daftar vendor tanpa kota gagal: ${JSON.stringify(r.body)}`);
  assert.strictEqual(r.body.vendor.city, null);

  r = await api('/vendors/me/documents/ktp', {
    method: 'PUT', token: vendorToken, body: { file_name: 'ktp-clara.jpg' },
  });
  assert.strictEqual(r.status, 201, `unggah ktp gagal: ${JSON.stringify(r.body)}`);
  assert.strictEqual(r.body.document.status, 'pending');

  // Unggah ulang jenis yang sama harus menimpa, bukan bikin baris kedua.
  r = await api('/vendors/me/documents/ktp', {
    method: 'PUT', token: vendorToken, body: { file_name: 'ktp-clara-revisi.jpg' },
  });
  assert.strictEqual(r.status, 201);
  r = await api('/vendors/me/documents', { token: vendorToken });
  assert.strictEqual(r.body.documents.length, 1, 'unggah ulang membuat baris duplikat');
  assert.strictEqual(r.body.documents[0].file_name, 'ktp-clara-revisi.jpg');

  r = await api('/vendors/me/documents/paspor', {
    method: 'PUT', token: vendorToken, body: { file_name: 'x.jpg' },
  });
  assert.strictEqual(r.status, 400, 'jenis dokumen asing seharusnya ditolak');

  // Customer tidak boleh menyentuh dokumen vendor.
  r = await api('/vendors/me/documents', { token: userToken });
  assert.strictEqual(r.status, 403);

  console.log('OK — profil user & dokumen vendor lolos semua skenario');
})()
  .catch((err) => {
    console.error('GAGAL:', err.message);
    process.exitCode = 1;
  })
  // Bersih-bersih jalan baik lolos maupun gagal. Skrip ini dulu satu-satunya
  // yang tidak punya blok ini, jadi tiap run meninggalkan 2 akun uji.
  // Vendor, layanan, dan dokumen ikut CASCADE dari users; tidak ada booking
  // yang dibuat di sini, jadi urutan bookings-dulu tidak diperlukan.
  .finally(async () => {
    if (DIBUAT.length) {
      const r = await pool.query(
        'DELETE FROM users WHERE email = ANY($1::text[])', [DIBUAT]
      );
      console.log(`Data uji dibersihkan: ${r.rowCount} akun.`);
    }
    await pool.end();
  });
