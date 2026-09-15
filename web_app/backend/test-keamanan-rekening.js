// Uji ganti sandi + rekening bank. Jalankan dengan server hidup:
//   node test-keamanan-rekening.js
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

async function register() {
  const tag = uniq();
  const email = `t${tag}@mail.com`;
  const r = await api('/auth/register', {
    method: 'POST',
    body: { name: `T ${tag}`, email, phone: `0812${tag}`, password: 'password123' },
  });
  assert.strictEqual(r.status, 201, `register gagal: ${JSON.stringify(r.body)}`);
  return { token: r.body.token, email };
}

const REKENING_SAH = {
  bank_name: 'bca',
  bank_account_number: '8271000012349402',
  bank_account_holder: 'Clara Valery Sudibyo',
};

const emails = [];

(async () => {
  const u = await register();
  emails.push(u.email);
  const token = u.token;

  // --- Rekening bank ---
  const setengah = await api('/auth/me', {
    method: 'PATCH',
    token,
    body: { bank_name: 'bca', bank_account_number: '', bank_account_holder: '' },
  });
  assert.strictEqual(setengah.status, 400, 'rekening setengah terisi harus ditolak');

  for (const [ubah, kenapa] of [
    [{ bank_name: 'bank_gaib' }, 'bank di luar daftar'],
    [{ bank_account_number: '12345' }, 'nomor rekening kependekan'],
    [{ bank_account_number: '827100001234940a' }, 'nomor rekening bukan angka'],
    [{ bank_account_holder: 'AB' }, 'nama pemilik kependekan'],
  ]) {
    const r = await api('/auth/me', {
      method: 'PATCH',
      token,
      body: { ...REKENING_SAH, ...ubah },
    });
    assert.strictEqual(r.status, 400, `${kenapa} harus ditolak, dapat ${r.status}`);
  }

  const simpan = await api('/auth/me', { method: 'PATCH', token, body: REKENING_SAH });
  assert.strictEqual(simpan.status, 200, `simpan rekening gagal: ${JSON.stringify(simpan.body)}`);
  assert.strictEqual(simpan.body.user.bank_name, 'bca');
  // Nama pemilik dinormalkan ke huruf besar supaya cocok dengan tampilan kartu.
  assert.strictEqual(simpan.body.user.bank_account_holder, 'CLARA VALERY SUDIBYO');

  // Menyimpan field profil lain TIDAK boleh menyentuh rekening yang sudah ada.
  const lain = await api('/auth/me', { method: 'PATCH', token, body: { name: 'Nama Baru' } });
  assert.strictEqual(lain.body.user.bank_account_number, REKENING_SAH.bank_account_number,
    'rekening ikut terhapus saat menyimpan field lain');

  const cabut = await api('/auth/me', {
    method: 'PATCH',
    token,
    body: { bank_name: '', bank_account_number: '', bank_account_holder: '' },
  });
  assert.strictEqual(cabut.status, 200);
  assert.strictEqual(cabut.body.user.bank_name, null, 'rekening harus bisa dicabut');

  // --- Ganti sandi ---
  const salah = await api('/auth/password', {
    method: 'PATCH',
    token,
    body: { current_password: 'bukan-sandinya', new_password: 'sandibaru123' },
  });
  assert.strictEqual(salah.status, 401, 'sandi lama salah harus ditolak');

  const pendek = await api('/auth/password', {
    method: 'PATCH',
    token,
    body: { current_password: 'password123', new_password: 'pendek' },
  });
  assert.strictEqual(pendek.status, 400, 'sandi baru < 8 karakter harus ditolak');

  const sama = await api('/auth/password', {
    method: 'PATCH',
    token,
    body: { current_password: 'password123', new_password: 'password123' },
  });
  assert.strictEqual(sama.status, 400, 'sandi baru sama dengan lama harus ditolak');

  const ganti = await api('/auth/password', {
    method: 'PATCH',
    token,
    body: { current_password: 'password123', new_password: 'sandibaru123' },
  });
  assert.strictEqual(ganti.status, 200, `ganti sandi gagal: ${JSON.stringify(ganti.body)}`);

  const lama = await api('/auth/login', {
    method: 'POST',
    body: { email: u.email, password: 'password123' },
  });
  assert.strictEqual(lama.status, 401, 'sandi lama masih bisa dipakai masuk');

  const baru = await api('/auth/login', {
    method: 'POST',
    body: { email: u.email, password: 'sandibaru123' },
  });
  assert.strictEqual(baru.status, 200, 'sandi baru tidak bisa dipakai masuk');

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
