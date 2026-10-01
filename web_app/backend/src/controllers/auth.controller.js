const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { gambarBermasalah } = require('../lib/gambar');
const { terbitkanKode, cocokkanKode, samarkanEmail } = require('../lib/kodeOtp');

const SALT_ROUNDS = 10;
const ALLOWED_SELF_REGISTER_ROLES = ['customer', 'vendor_owner'];

/** Detik sekarang menurut jam NODE — sumber yang sama dengan iat di JWT.
 *  sesi_sejak WAJIB ditulis dari sini, bukan now() Postgres: jam server DB
 *  (Supabase) tidak sama persis dengan jam backend, dan selisih sedetik saja
 *  membuat token yang baru diterbitkan ikut terbaca lebih tua dari sesi_sejak. */
const detikIni = () => Math.floor(Date.now() / 1000);

function signToken(user) {
  return jwt.sign(
    { user_id: user.user_id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
}

// POST /api/v1/auth/register
async function register(req, res, next) {
  try {
    const { name, email, phone, password, role } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: 'name, email, phone, dan password wajib diisi' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password minimal 8 karakter' });
    }

    const finalRole = ALLOWED_SELF_REGISTER_ROLES.includes(role) ? role : 'customer';

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, name, email, phone, role, avatar_url, created_at`,
      [name, email, phone, passwordHash, finalRole]
    );

    const user = result.rows[0];
    const token = signToken(user);

    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/login
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'email dan password wajib diisi' });
    }

    const result = await pool.query(
      `SELECT user_id, name, email, phone, password_hash, role, avatar_url, dua_langkah
       FROM users WHERE email = $1`,
      [email]
    );

    const user = result.rows[0];

    // Pesan generik sengaja dipakai untuk email & password salah,
    // supaya tidak bocorin info email mana saja yang terdaftar.
    if (!user) {
      return res.status(401).json({ message: 'Email atau password salah' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Email atau password salah' });
    }

    // Verifikasi dua langkah: sandi benar BELUM memberi token. Kode dikirim ke
    // email, token baru terbit di POST /auth/login/kode. Admin SELALU lewat
    // langkah ini (akun yang menyetujui pencairan dana), yang lain kalau
    // menyalakannya sendiri.
    if (user.dua_langkah || user.role === 'admin') {
      let tiket;
      try {
        tiket = await terbitkanKode(user, 'login');
      } catch (err) {
        console.error('[2fa] gagal kirim kode:', err.message);
        return res.status(502).json({ message: 'Kode masuk gagal dikirim ke email. Coba lagi sebentar lagi.' });
      }
      return res.json({ butuh_kode: true, tiket, email: samarkanEmail(user.email) });
    }

    delete user.password_hash;
    delete user.dua_langkah;
    res.json({ user, token: signToken(user) });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/google
// Body: { credential } — ID token dari tombol Google Identity Services.
//
// Tokennya diperiksa lewat endpoint tokeninfo Google: Google yang mengecek
// tanda tangan & kedaluwarsanya, kita tinggal memastikan token itu memang
// dibuat untuk Client ID KITA (`aud`) — tanpa itu, token login dari aplikasi
// lain mana pun bisa dipakai masuk ke sini.
// ponytail: tokeninfo = satu perjalanan ke Google per login. Upgrade kalau
// ramai: verifikasi sendiri dengan jsonwebtoken + sertifikat publik Google.
//
// Tiga aturan (disepakati 25 Sep 2026):
// - Hanya customer. Akun vendor/admin tetap masuk dengan sandi di halamannya.
// - Email yang sudah terdaftar lewat form biasa langsung masuk ke akun itu —
//   Google sudah membuktikan orang ini pemilik emailnya.
// - Akun baru: nomor HP kosong (Google tidak memberinya; diisi di profil,
//   createBooking menagihnya), sandi = hash angka acak yang tidak bisa ditebak,
//   karena kolomnya NOT NULL dan akun ini memang tidak punya sandi.
async function googleLogin(req, res, next) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({ message: 'Login Google belum dikonfigurasi' });
    }
    const { credential } = req.body;
    if (typeof credential !== 'string' || !credential) {
      return res.status(400).json({ message: 'credential wajib diisi' });
    }

    const r = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );
    const info = await r.json().catch(() => ({}));
    const sah = r.ok
      && info.aud === clientId
      && ['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)
      && String(info.email_verified) === 'true'
      && info.email;
    if (!sah) {
      return res.status(401).json({ message: 'Login Google gagal, coba lagi' });
    }

    // lower(): email dari Google selalu huruf kecil, sedangkan form daftar
    // menyimpan apa adanya.
    const ada = await pool.query(
      `SELECT user_id, name, email, phone, role, avatar_url
         FROM users WHERE lower(email) = lower($1)
        ORDER BY created_at LIMIT 1`,
      [info.email]
    );

    let user = ada.rows[0];
    let baru = false;
    // Pelanggan ber-2FA yang masuk lewat Google TIDAK diminta kode lagi: kode
    // 2FA dikirim ke email yang sama, dan Google baru saja membuktikan orang
    // ini memegang email itu. Vendor & admin (yang 2FA-nya bisa wajib) memang
    // tidak boleh lewat jalur ini sama sekali.
    if (user && user.role !== 'customer') {
      return res.status(403).json({
        message: 'Akun vendor/admin masuk lewat halaman masuknya sendiri dengan sandi',
      });
    }
    if (!user) {
      const sandiAcak = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), SALT_ROUNDS);
      const dibuat = await pool.query(
        `INSERT INTO users (name, email, phone, password_hash, role)
         VALUES ($1, $2, '', $3, 'customer')
         RETURNING user_id, name, email, phone, role, avatar_url`,
        [(info.name || info.email.split('@')[0]).slice(0, 150), info.email, sandiAcak]
      );
      user = dibuat.rows[0];
      baru = true;
    }

    res.status(baru ? 201 : 200).json({ user, token: signToken(user) });
  } catch (err) {
    next(err);
  }
}

const PROFILE_COLUMNS = `user_id, name, full_name, email, phone, birth_date, avatar_url,
          shipping_address, shipping_note, notification_prefs, role,
          bank_name, bank_account_number, bank_account_holder, dua_langkah,
          is_verified, verified_at, created_at`;

// GET /api/v1/auth/me (protected)
async function me(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT ${PROFILE_COLUMNS} FROM users WHERE user_id = $1`,
      [req.user.user_id]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    res.json({ user });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/auth/me (protected)
// Hanya field profil. email, password, role, dan REKENING sengaja TIDAK bisa
// diubah di sini: ganti email butuh verifikasi ulang, ganti password & rekening
// butuh password lama (lihat gantiRekening), dan role yang bisa diubah sendiri
// = eskalasi hak akses.
const EDITABLE_PROFILE_FIELDS = [
  'name', 'full_name', 'phone', 'birth_date', 'avatar_url',
  'shipping_address', 'shipping_note', 'notification_prefs',
];

// Daftar bank tujuan transfer. Hanya kode yang divalidasi di sini; nama
// panjangnya ("PT Bank Central Asia Tbk") hidup di frontend karena cuma untuk
// ditampilkan. Kalau daftar ini bertambah, tambahkan di dua tempat.
const BANK_CODES = new Set([
  'bca', 'bni', 'bri', 'mandiri', 'bsi', 'cimb', 'permata',
  'danamon', 'btn', 'panin', 'ocbc', 'maybank', 'jago',
]);

const BANK_FIELDS = ['bank_name', 'bank_account_number', 'bank_account_holder'];

// Rekening setengah terisi tidak bisa ditransfer ke mana-mana, jadi ketiganya
// wajib berangkat bersama — atau ketiganya dikosongkan untuk mencabut rekening.
function rekeningBermasalah(body) {
  const dikirim = BANK_FIELDS.filter((f) => f in body);
  if (dikirim.length === 0) return null;

  const isi = Object.fromEntries(
    BANK_FIELDS.map((f) => [f, typeof body[f] === 'string' ? body[f].trim() : body[f]])
  );
  const terisi = BANK_FIELDS.filter((f) => isi[f] !== '' && isi[f] != null);

  if (terisi.length === 0) return null;          // dicabut, semua dikosongkan
  if (terisi.length < BANK_FIELDS.length) {
    return 'Nama bank, nomor rekening, dan nama pemilik harus diisi semuanya';
  }

  if (!BANK_CODES.has(String(isi.bank_name).toLowerCase())) {
    return 'Bank tersebut belum didukung';
  }
  if (!/^[0-9]{8,20}$/.test(isi.bank_account_number)) {
    return 'Nomor rekening harus 8-20 digit angka';
  }
  if (!/^[A-Za-z.,'\- ]{3,60}$/.test(isi.bank_account_holder)) {
    return 'Nama pemilik rekening harus 3-60 huruf, sesuai KTP';
  }
  return null;
}

// Foto profil disimpan sebagai data URL di kolom avatar_url, bukan file di
// disk: tidak ada storage/CDN di proyek ini dan browser sudah mengecilkan
// gambarnya ke 256px sebelum kirim. Batas di bawah menjaga baris users tetap
// waras kalau ada yang menembak endpoint ini langsung.
// ponytail: data URL di DB. Pindah ke object storage kalau fotonya makin besar
// atau baris users mulai berat dibaca.
// Plafon express.json() sekarang 1 MB (dinaikkan demi foto portofolio vendor,
// lihat app.js), jadi angka di bawah ini yang benar-benar menolak avatar
// kebesaran — dan penolakannya berupa pesan yang bisa dibaca user, bukan 413
// telanjang. Foto 256px JPEG hasil kecilkanGambar() cuma ~20 KB, jadi lapang.
const AVATAR_MAX_CHARS = 80_000; // ~60 KB setelah base64

async function updateMe(req, res, next) {
  try {
    // Ditolak terang-terangan, bukan diabaikan diam-diam: klien lama yang masih
    // mengirim rekening ke sini harus tahu rekeningnya TIDAK tersimpan.
    if (BANK_FIELDS.some((f) => f in req.body)) {
      return res.status(400).json({ message: 'Rekening diubah lewat PATCH /auth/rekening' });
    }

    const sets = [];
    const values = [];

    for (const field of EDITABLE_PROFILE_FIELDS) {
      if (!(field in req.body)) continue;
      let value = req.body[field];

      if (field === 'avatar_url' && value !== '' && value !== null) {
        const salah = gambarBermasalah(value, AVATAR_MAX_CHARS, 'Foto profil');
        if (salah) return res.status(400).json({ message: salah });
      }

      if (field === 'notification_prefs') {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          return res.status(400).json({ message: 'notification_prefs harus berupa object' });
        }
        value = JSON.stringify(value);
      } else if (value === '') {
        value = null; // field dikosongkan dari form
      }

      values.push(value);
      sets.push(`${field} = $${values.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ message: 'Tidak ada field profil yang diubah' });
    }

    values.push(req.user.user_id);

    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')}, updated_at = now()
       WHERE user_id = $${values.length}
       RETURNING ${PROFILE_COLUMNS}`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/auth/password (protected)
// Sengaja terpisah dari updateMe: ganti sandi butuh sandi lama sebagai bukti
// kepemilikan. Tanpa itu, token yang dicuri bisa dipakai mengunci pemilik asli
// keluar dari akunnya sendiri.
async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ message: 'Sandi lama dan sandi baru wajib diisi' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ message: 'Sandi baru minimal 8 karakter' });
    }
    if (new_password === current_password) {
      return res.status(400).json({ message: 'Sandi baru harus berbeda dari sandi lama' });
    }

    const result = await pool.query(
      'SELECT password_hash FROM users WHERE user_id = $1',
      [req.user.user_id]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });

    const cocok = await bcrypt.compare(current_password, user.password_hash);
    if (!cocok) return res.status(401).json({ message: 'Sandi lama salah' });

    // sesi_sejak (022): semua token lama — termasuk milik orang yang mungkin
    // sedang memakai akun ini — ditolak requireAuth. Perangkat yang mengganti
    // sandi dapat token baru di balasan supaya tidak ikut terlempar.
    const { rows: [u] } = await pool.query(
      `UPDATE users SET password_hash = $1, sesi_sejak = to_timestamp($3), updated_at = now()
        WHERE user_id = $2 RETURNING user_id, role`,
      [await bcrypt.hash(new_password, SALT_ROUNDS), req.user.user_id, detikIni()]
    );
    res.json({ message: 'Sandi berhasil diganti', token: signToken(u) });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/auth/rekening (protected, rate limit seperti login)
// Body: { current_password, bank_name, bank_account_number, bank_account_holder }
// Ketiga field rekening dikosongkan = rekening dicabut.
//
// Terpisah dari /auth/me dengan alasan yang sama dengan /auth/password: ini
// jalur uang. Rekening ini tujuan transfer payout vendor dan refund klien, jadi
// token yang dicuri saja tidak boleh cukup untuk membelokkannya — harus tahu
// sandinya juga. Dan karena menerima sandi, dia butuh rate limit, yang tidak
// dimiliki /auth/me.
// ponytail: akun yang dibuat lewat Google punya sandi acak, jadi tidak bisa
// menyimpan rekening. Tambahkan "atur sandi" untuk akun Google kalau itu dipakai.
async function gantiRekening(req, res, next) {
  try {
    const { current_password } = req.body;
    if (!current_password) {
      return res.status(400).json({ message: 'Masukkan kata sandi Anda untuk mengganti rekening' });
    }
    if (!BANK_FIELDS.every((f) => f in req.body)) {
      return res.status(400).json({
        message: 'Kirim ketiga field rekening (kosongkan semuanya untuk mencabut)',
      });
    }
    const salah = rekeningBermasalah(req.body);
    if (salah) return res.status(400).json({ message: salah });

    const result = await pool.query(
      'SELECT password_hash FROM users WHERE user_id = $1',
      [req.user.user_id]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan' });
    if (!(await bcrypt.compare(current_password, user.password_hash))) {
      return res.status(401).json({ message: 'Kata sandi salah' });
    }

    const rapi = (f) => {
      const v = String(req.body[f] ?? '').trim();
      if (!v) return null;
      if (f === 'bank_name') return v.toLowerCase();
      if (f === 'bank_account_holder') return v.toUpperCase();
      return v;
    };

    const { rows } = await pool.query(
      `UPDATE users
          SET bank_name = $1, bank_account_number = $2, bank_account_holder = $3,
              updated_at = now()
        WHERE user_id = $4
        RETURNING ${PROFILE_COLUMNS}`,
      [...BANK_FIELDS.map(rapi), req.user.user_id]
    );
    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/login/kode  { tiket, kode }  (rate limit)
// Langkah kedua masuk untuk akun ber-2FA dan admin.
async function loginKode(req, res, next) {
  try {
    const hasil = await cocokkanKode(req.body.tiket, 'login', req.body.kode);
    if (hasil.salah) return res.status(401).json({ message: hasil.salah });

    const { rows: [user] } = await pool.query(
      'SELECT user_id, name, email, phone, role, avatar_url FROM users WHERE user_id = $1',
      [hasil.user_id]
    );
    if (!user) return res.status(401).json({ message: 'Akun tidak ditemukan' });
    res.json({ user, token: signToken(user) });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/lupa-sandi  { email }
// Balasannya SELALU sama, terdaftar atau tidak, dan termasuk saat email gagal
// terkirim — kalau beda, endpoint ini jadi alat mengecek email mana yang
// punya akun. Email tak terdaftar dapat tiket acak yang tidak cocok dengan apa
// pun, jadi langkah berikutnya gagal dengan pesan yang sama persis.
async function lupaSandi(req, res, next) {
  try {
    const email = String(req.body.email || '').trim();
    if (!email) return res.status(400).json({ message: 'Email wajib diisi' });

    const { rows: [user] } = await pool.query(
      'SELECT user_id, name, email FROM users WHERE email = $1',
      [email]
    );
    let tiket = crypto.randomUUID();
    if (user) {
      try {
        tiket = await terbitkanKode(user, 'reset_sandi');
      } catch (err) {
        console.error('[lupa-sandi] gagal kirim kode:', err.message);
      }
    }
    res.json({
      tiket,
      message: 'Kalau email itu terdaftar, kode 6 digit sudah dikirim. Berlaku 10 menit.',
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/reset-sandi  { tiket, kode, sandi_baru }  (rate limit)
// Sukses = semua sesi di semua perangkat dicabut (sesi_sejak), lalu orangnya
// masuk ulang seperti biasa — termasuk langkah 2FA kalau menyala.
async function resetSandi(req, res, next) {
  try {
    const { tiket, kode, sandi_baru } = req.body;
    if (!sandi_baru || String(sandi_baru).length < 8) {
      return res.status(400).json({ message: 'Sandi baru minimal 8 karakter' });
    }
    const hasil = await cocokkanKode(tiket, 'reset_sandi', kode);
    if (hasil.salah) return res.status(401).json({ message: hasil.salah });

    await pool.query(
      `UPDATE users SET password_hash = $1, sesi_sejak = to_timestamp($3), updated_at = now()
        WHERE user_id = $2`,
      [await bcrypt.hash(String(sandi_baru), SALT_ROUNDS), hasil.user_id, detikIni()]
    );
    res.json({ message: 'Kata sandi diganti. Silakan masuk dengan sandi baru.' });
  } catch (err) {
    next(err);
  }
}

async function sandiCocok(userId, sandi) {
  const { rows: [u] } = await pool.query(
    'SELECT user_id, name, email, role, password_hash, dua_langkah FROM users WHERE user_id = $1',
    [userId]
  );
  if (!u || !sandi || !(await bcrypt.compare(String(sandi), u.password_hash))) return null;
  return u;
}

// POST /api/v1/auth/dua-langkah  { current_password }  (rate limit)
// Langkah 1 menyalakan 2FA: kirim kode ke email. 2FA BELUM menyala sebelum
// kodenya dikonfirmasi — membuktikan email itu memang menerima kode. Tanpa
// bukti ini, akun dengan email yang tidak bisa menerima surat langsung
// terkunci di luar begitu 2FA menyala.
async function duaLangkahMulai(req, res, next) {
  try {
    const u = await sandiCocok(req.user.user_id, req.body.current_password);
    if (!u) return res.status(401).json({ message: 'Kata sandi salah' });
    if (u.dua_langkah) return res.status(409).json({ message: 'Verifikasi dua langkah sudah aktif' });

    let tiket;
    try {
      tiket = await terbitkanKode(u, 'aktifkan_2fa');
    } catch (err) {
      console.error('[2fa] gagal kirim kode:', err.message);
      return res.status(502).json({ message: 'Kode gagal dikirim ke email. Coba lagi sebentar lagi.' });
    }
    res.json({ tiket, email: samarkanEmail(u.email) });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/dua-langkah/konfirmasi  { tiket, kode }  (rate limit)
// Langkah 2: kode benar = 2FA menyala, dan sesi di perangkat lain dicabut
// (yang tadinya masuk tanpa kode tidak boleh tetap di dalam).
async function duaLangkahKonfirmasi(req, res, next) {
  try {
    const hasil = await cocokkanKode(req.body.tiket, 'aktifkan_2fa', req.body.kode, req.user.user_id);
    if (hasil.salah) return res.status(401).json({ message: hasil.salah });

    const { rows: [u] } = await pool.query(
      `UPDATE users SET dua_langkah = true, sesi_sejak = to_timestamp($2), updated_at = now()
        WHERE user_id = $1 RETURNING user_id, role`,
      [req.user.user_id, detikIni()]
    );
    res.json({ dua_langkah: true, token: signToken(u) });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/dua-langkah/matikan  { current_password }  (rate limit)
// Admin tetap diminta kode walau kolomnya false — lihat login().
async function duaLangkahMatikan(req, res, next) {
  try {
    const u = await sandiCocok(req.user.user_id, req.body.current_password);
    if (!u) return res.status(401).json({ message: 'Kata sandi salah' });
    await pool.query(
      'UPDATE users SET dua_langkah = false, updated_at = now() WHERE user_id = $1',
      [req.user.user_id]
    );
    res.json({ dua_langkah: false });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register, login, googleLogin, me, updateMe, changePassword, gantiRekening,
  loginKode, lupaSandi, resetSandi, duaLangkahMulai, duaLangkahKonfirmasi, duaLangkahMatikan,
};
