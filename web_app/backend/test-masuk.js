// Pembantu tes: masuk ke akun yang wajib lewat langkah kode (admin, atau akun
// yang menyalakan 2FA) — sejak migrasi 022 /auth/login untuk akun seperti itu
// TIDAK memberi token, cuma tiket.
//
// Email ke @mail.com tidak pernah dikirim dan kode disimpan sebagai hash, jadi
// kodenya ditebak dari kode_hash di DB (sejuta sha256, sekitar satu detik).
// Bukan berkas tes; dipakai test-*.js lain.
require('dotenv').config();
const crypto = require('crypto');
const pool = require('./src/config/db');

const BASE = process.env.BASE_URL || 'http://localhost:4000/api/v1';

/** Kode 6 digit di balik sebuah tiket, ditebak dari hash-nya. */
async function kodeDari(tiket) {
  const { rows: [k] } = await pool.query('SELECT kode_hash FROM kode_otp WHERE kode_id = $1', [tiket]);
  if (!k) throw new Error('tiket tidak ada di kode_otp');
  for (let i = 0; i < 1_000_000; i++) {
    const kode = String(i).padStart(6, '0');
    const h = crypto.createHash('sha256').update(`${process.env.JWT_SECRET}:${kode}`).digest('hex');
    if (h === k.kode_hash) return kode;
  }
  throw new Error('kode tidak ketemu');
}

const kirim = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    // Menebak kode memblokir proses beberapa detik; koneksi keep-alive yang
    // menganggur selama itu sudah ditutup server -> "fetch failed".
    headers: { 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

/** Login lengkap: sandi, lalu kode kalau diminta. Mengembalikan token. */
async function masukDenganKode(email, password = 'password123') {
  const r = await kirim('/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`login gagal: ${JSON.stringify(r.body)}`);
  if (!r.body.butuh_kode) return r.body.token;
  const k = await kirim('/auth/login/kode', { tiket: r.body.tiket, kode: await kodeDari(r.body.tiket) });
  if (k.status !== 200) throw new Error(`login kode gagal: ${JSON.stringify(k.body)}`);
  return k.body.token;
}

module.exports = { kodeDari, masukDenganKode };
