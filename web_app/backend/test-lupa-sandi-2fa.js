// Uji lupa sandi, verifikasi dua langkah, dan pencabutan sesi (migrasi 022).
// Server harus hidup:  node test-lupa-sandi-2fa.js
//
// Email ke @mail.com memang tidak pernah dikirim (lib/email.js), dan kode
// disimpan sebagai hash. Jadi tes ini MENEBAK kodenya dari kode_hash di DB —
// sejuta sha256, sekitar satu detik. Tidak ada pintu belakang di server.
//
// Percobaan gagal ikut dihitung rate limit (8 / 15 menit per endpoint):
// restart backend kalau tes ini dijalankan dua kali berturut-turut.
require('dotenv').config();
const assert = require('assert');
const pool = require('./src/config/db');
const { kodeDari } = require('./test-masuk');

const BASE = process.env.BASE_URL || 'http://localhost:4000/api/v1';

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      // Menebak kode memblokir proses beberapa detik; koneksi keep-alive yang
      // menganggur selama itu sudah ditutup server -> "fetch failed".
      Connection: 'close',
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
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

async function daftar() {
  const tag = uniq();
  const email = `t${tag}@mail.com`;
  const r = await api('/auth/register', {
    method: 'POST',
    body: { name: `T ${tag}`, email, phone: `0812${tag}`, password: 'password123' },
  });
  assert.strictEqual(r.status, 201, `register gagal: ${JSON.stringify(r.body)}`);
  emails.push(email);
  return { token: r.body.token, email };
}

const salahDari = (kode) => String((Number(kode) + 1) % 1_000_000).padStart(6, '0');

(async () => {
  const a = await daftar();

  // --- Lupa sandi ---
  const asing = await api('/auth/lupa-sandi', { method: 'POST', body: { email: `tidak-ada-${uniq()}@mail.com` } });
  const lupa = await api('/auth/lupa-sandi', { method: 'POST', body: { email: a.email } });
  assert.strictEqual(asing.status, 200);
  assert.strictEqual(lupa.status, 200);
  assert.strictEqual(asing.body.message, lupa.body.message, 'balasan email terdaftar & tidak harus sama');
  ok('lupa sandi membalas sama persis untuk email terdaftar maupun tidak');

  const kodeReset = await kodeDari(lupa.body.tiket);
  const salah = await api('/auth/reset-sandi', {
    method: 'POST', body: { tiket: lupa.body.tiket, kode: salahDari(kodeReset), sandi_baru: 'sandibaru123' },
  });
  assert.strictEqual(salah.status, 401, 'kode salah harus 401');

  // Detik berganti dulu: sesi_sejak dibulatkan ke detik, token lama harus
  // terbit di detik SEBELUMNYA supaya pencabutannya teruji jujur.
  await tunggu(1100);
  const reset = await api('/auth/reset-sandi', {
    method: 'POST', body: { tiket: lupa.body.tiket, kode: kodeReset, sandi_baru: 'sandibaru123' },
  });
  assert.strictEqual(reset.status, 200, `reset gagal: ${JSON.stringify(reset.body)}`);
  ok('reset sandi: kode salah ditolak, kode benar mengganti sandi');

  const ulang = await api('/auth/reset-sandi', {
    method: 'POST', body: { tiket: lupa.body.tiket, kode: kodeReset, sandi_baru: 'sandilain123' },
  });
  assert.strictEqual(ulang.status, 401, 'kode yang sama tidak boleh dipakai dua kali');
  ok('kode sekali pakai');

  assert.strictEqual((await api('/auth/me', { token: a.token })).status, 401, 'token lama masih hidup sesudah reset');
  ok('reset sandi mengeluarkan sesi lama');

  assert.strictEqual((await api('/auth/login', { method: 'POST', body: { email: a.email, password: 'password123' } })).status, 401);
  let masuk = await api('/auth/login', { method: 'POST', body: { email: a.email, password: 'sandibaru123' } });
  assert.strictEqual(masuk.status, 200);
  assert.ok(masuk.body.token, 'tanpa 2FA, login langsung memberi token');
  let token = masuk.body.token;
  ok('sandi lama tidak bisa dipakai, sandi baru bisa');

  // --- Menyalakan 2FA ---
  const pwSalah = await api('/auth/dua-langkah', { method: 'POST', token, body: { current_password: 'bukan' } });
  assert.strictEqual(pwSalah.status, 401);
  const mulai = await api('/auth/dua-langkah', { method: 'POST', token, body: { current_password: 'sandibaru123' } });
  assert.strictEqual(mulai.status, 200, `mulai 2FA gagal: ${JSON.stringify(mulai.body)}`);
  assert.strictEqual((await api('/auth/me', { token })).body.user.dua_langkah, false, '2FA menyala sebelum kode dikonfirmasi');
  ok('menyalakan 2FA butuh sandi, dan belum menyala sebelum kode dikonfirmasi');

  await tunggu(1100);
  const konfirmasi = await api('/auth/dua-langkah/konfirmasi', {
    method: 'POST', token, body: { tiket: mulai.body.tiket, kode: await kodeDari(mulai.body.tiket) },
  });
  assert.strictEqual(konfirmasi.status, 200, `konfirmasi gagal: ${JSON.stringify(konfirmasi.body)}`);
  assert.strictEqual((await api('/auth/me', { token })).status, 401, 'sesi lain harus keluar saat 2FA menyala');
  token = konfirmasi.body.token;
  assert.strictEqual((await api('/auth/me', { token })).body.user.dua_langkah, true);
  ok('kode benar menyalakan 2FA, sesi lain keluar, perangkat ini dapat token baru');

  // --- Login dengan 2FA ---
  masuk = await api('/auth/login', { method: 'POST', body: { email: a.email, password: 'sandibaru123' } });
  assert.strictEqual(masuk.body.butuh_kode, true);
  assert.strictEqual(masuk.body.token, undefined, 'token tidak boleh terbit sebelum kode');
  assert.match(masuk.body.email, /\*\*\*@mail\.com$/);
  const kodeMasuk = await kodeDari(masuk.body.tiket);
  for (let i = 0; i < 5; i++) {
    const r = await api('/auth/login/kode', { method: 'POST', body: { tiket: masuk.body.tiket, kode: salahDari(kodeMasuk) } });
    assert.strictEqual(r.status, 401);
  }
  const habis = await api('/auth/login/kode', { method: 'POST', body: { tiket: masuk.body.tiket, kode: kodeMasuk } });
  assert.strictEqual(habis.status, 401, 'kode benar sesudah 5x salah harus sudah hangus');
  ok('login ber-2FA tidak memberi token sebelum kode; 5x salah = kode hangus');

  masuk = await api('/auth/login', { method: 'POST', body: { email: a.email, password: 'sandibaru123' } });
  assert.notStrictEqual(masuk.body.tiket, undefined);
  const lewat = await api('/auth/login/kode', {
    method: 'POST', body: { tiket: masuk.body.tiket, kode: await kodeDari(masuk.body.tiket) },
  });
  assert.strictEqual(lewat.status, 200, `login kode gagal: ${JSON.stringify(lewat.body)}`);
  assert.ok(lewat.body.token);
  token = lewat.body.token;
  ok('kode baru terbit sesudah yang lama hangus, dan kode benar memberi token');

  // --- Mematikan 2FA ---
  const mati = await api('/auth/dua-langkah/matikan', { method: 'POST', token, body: { current_password: 'sandibaru123' } });
  assert.strictEqual(mati.status, 200);
  masuk = await api('/auth/login', { method: 'POST', body: { email: a.email, password: 'sandibaru123' } });
  assert.ok(masuk.body.token, 'sesudah 2FA dimatikan login harus langsung memberi token');
  token = masuk.body.token;
  ok('mematikan 2FA (dengan sandi) mengembalikan login satu langkah');

  // --- Ganti sandi biasa juga mencabut sesi lain ---
  await tunggu(1100);
  const ganti = await api('/auth/password', {
    method: 'PATCH', token, body: { current_password: 'sandibaru123', new_password: 'sandiketiga123' },
  });
  assert.strictEqual(ganti.status, 200);
  assert.strictEqual((await api('/auth/me', { token })).status, 401, 'token lama hidup sesudah ganti sandi');
  assert.strictEqual((await api('/auth/me', { token: ganti.body.token })).status, 200, 'token baru dari ganti sandi tidak jalan');
  ok('ganti sandi mengeluarkan sesi lain, perangkat ini dapat token baru');

  // --- Admin selalu diminta kode ---
  const admin = await daftar();
  await pool.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [admin.email]);
  masuk = await api('/auth/login', { method: 'POST', body: { email: admin.email, password: 'password123' } });
  assert.strictEqual(masuk.body.butuh_kode, true, 'admin harus selalu lewat langkah kode');
  ok('admin wajib 2FA walau tidak menyalakannya');

  console.log(`\n${lolos} pemeriksaan lolos.`);
})()
  .catch((err) => {
    console.error('GAGAL:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // kode_otp ikut CASCADE dari users.
    const { rowCount } = await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
    console.log(`Data uji dibersihkan: ${rowCount} akun.`);
    await pool.end();
  });
