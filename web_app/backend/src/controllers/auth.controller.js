const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const SALT_ROUNDS = 10;
const ALLOWED_SELF_REGISTER_ROLES = ['customer', 'vendor_owner'];

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
      `SELECT user_id, name, email, phone, password_hash, role, avatar_url
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

    const token = signToken(user);
    delete user.password_hash;

    res.json({ user, token });
  } catch (err) {
    next(err);
  }
}

const PROFILE_COLUMNS = `user_id, name, full_name, email, phone, birth_date, avatar_url,
          shipping_address, shipping_note, notification_prefs, role,
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
// Hanya field profil. email, password, dan role sengaja TIDAK bisa diubah di
// sini: ganti email butuh verifikasi ulang, ganti password butuh password lama,
// dan role yang bisa diubah sendiri = eskalasi hak akses.
const EDITABLE_PROFILE_FIELDS = [
  'name', 'full_name', 'phone', 'birth_date', 'avatar_url',
  'shipping_address', 'shipping_note', 'notification_prefs',
];

// Foto profil disimpan sebagai data URL di kolom avatar_url, bukan file di
// disk: tidak ada storage/CDN di proyek ini dan browser sudah mengecilkan
// gambarnya ke 256px sebelum kirim. Batas di bawah menjaga baris users tetap
// waras kalau ada yang menembak endpoint ini langsung.
// ponytail: data URL di DB. Pindah ke object storage kalau fotonya makin besar
// atau baris users mulai berat dibaca.
// Plafon sebenarnya datang dari express.json() yang default 100 KB dan
// membalas 413 sebelum kode ini jalan — angka di bawah sengaja di bawahnya
// supaya penolakannya berupa pesan yang bisa dibaca user, bukan 413 telanjang.
// Foto 256px JPEG hasil kecilkanFoto() cuma ~20 KB, jadi lapang.
const AVATAR_MAX_CHARS = 80_000; // ~60 KB setelah base64

function avatarBermasalah(value) {
  if (typeof value !== 'string') return 'avatar_url harus berupa teks';
  if (value.length > AVATAR_MAX_CHARS) return 'Foto profil terlalu besar, maksimal ~60 KB';
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) &&
      !/^https?:\/\//.test(value)) {
    return 'Foto profil harus gambar PNG/JPEG/WebP';
  }
  return null;
}

async function updateMe(req, res, next) {
  try {
    const sets = [];
    const values = [];

    for (const field of EDITABLE_PROFILE_FIELDS) {
      if (!(field in req.body)) continue;
      let value = req.body[field];

      if (field === 'avatar_url' && value !== '' && value !== null) {
        const salah = avatarBermasalah(value);
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

module.exports = { register, login, me, updateMe };
