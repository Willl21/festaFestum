// Uji foto profil + verifikasi akun oleh admin. Jalankan dengan server hidup:
//   node test-profil-verifikasi.js
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

async function register(role) {
  const tag = uniq();
  const email = `t${tag}@mail.com`;
  const r = await api('/auth/register', {
    method: 'POST',
    body: { name: `T ${tag}`, email, phone: `0812${tag}`, password: 'password123', role },
  });
  assert.strictEqual(r.status, 201, `register gagal: ${JSON.stringify(r.body)}`);
  return { token: r.body.token, email, user_id: r.body.user.user_id };
}

// PNG 1x1 transparan — cukup untuk menguji validasi bentuk data URL.
const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const emails = [];

(async () => {
  const user = await register('customer');
  const admin = await register('customer');
  emails.push(user.email, admin.email);

  // --- Foto profil ---
  let r = await api('/auth/me', { method: 'PATCH', token: user.token, body: { avatar_url: PNG_1X1 } });
  assert.strictEqual(r.status, 200, `avatar sah ditolak: ${JSON.stringify(r.body)}`);
  assert.strictEqual(r.body.user.avatar_url, PNG_1X1);

  r = await api('/auth/me', { method: 'PATCH', token: user.token, body: { avatar_url: 'javascript:alert(1)' } });
  assert.strictEqual(r.status, 400, 'avatar non-gambar seharusnya ditolak');

  r = await api('/auth/me', {
    method: 'PATCH', token: user.token,
    body: { avatar_url: `data:image/png;base64,${'A'.repeat(80_001)}` },
  });
  assert.strictEqual(r.status, 400, 'avatar kebesaran seharusnya ditolak');

  // Batas express.json() naik ke 1 MB demi foto portofolio vendor (app.js),
  // jadi avatar 150 KB sekarang lolos parser dan ditolak controller — 400
  // dengan pesan yang bisa dibaca, bukan 413 telanjang. Itu yang diinginkan.
  r = await api('/auth/me', {
    method: 'PATCH', token: user.token,
    body: { avatar_url: `data:image/png;base64,${'A'.repeat(200_000)}` },
  });
  assert.strictEqual(r.status, 400, 'avatar 150 KB seharusnya ditolak controller');

  // Di atas 1 MB penolakannya tetap datang lebih awal dari body parser.
  r = await api('/auth/me', {
    method: 'PATCH', token: user.token,
    body: { avatar_url: `data:image/png;base64,${'A'.repeat(1_200_000)}` },
  });
  assert.strictEqual(r.status, 413, 'payload raksasa seharusnya ditolak body parser');

  // --- Verifikasi akun ---
  r = await api('/auth/me', { token: user.token });
  assert.strictEqual(r.body.user.is_verified, false, 'akun baru seharusnya belum terverifikasi');

  // Customer biasa tidak boleh memverifikasi siapa pun.
  r = await api(`/admin/users/${user.user_id}/verification`, {
    method: 'PATCH', token: user.token, body: { action: 'approve' },
  });
  assert.strictEqual(r.status, 403, 'non-admin seharusnya ditolak');

  // Peran admin memang dibuat langsung di DB — POST /auth/register menolaknya.
  await pool.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [admin.email]);
  const masuk = await api('/auth/login', {
    method: 'POST', body: { email: admin.email, password: 'password123' },
  });
  const adminToken = masuk.body.token;

  r = await api(`/admin/users/${user.user_id}/verification`, {
    method: 'PATCH', token: adminToken, body: { action: 'bikin_admin' },
  });
  assert.strictEqual(r.status, 400, 'action asing seharusnya ditolak');

  r = await api(`/admin/users/${user.user_id}/verification`, {
    method: 'PATCH', token: adminToken, body: { action: 'approve' },
  });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.user.is_verified, true);

  r = await api('/auth/me', { token: user.token });
  assert.strictEqual(r.body.user.is_verified, true, 'badge profil tidak ikut menyala');
  assert.ok(r.body.user.verified_at, 'verified_at kosong padahal sudah disetujui');

  r = await api(`/admin/users/${user.user_id}/verification`, {
    method: 'PATCH', token: adminToken, body: { action: 'revoke' },
  });
  assert.strictEqual(r.body.user.is_verified, false);
  assert.strictEqual(r.body.user.verified_at, null, 'verified_at harus ikut dikosongkan');

  r = await api(`/admin/users/${'0'.repeat(8)}-0000-0000-0000-000000000000/verification`, {
    method: 'PATCH', token: adminToken, body: { action: 'approve' },
  });
  assert.strictEqual(r.status, 404);

  console.log('OK — foto profil & verifikasi akun lolos semua skenario');
})()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(async () => {
    if (emails.length) await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
    await pool.end();
  });
