const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Middleware wajib login: cek header Authorization: Bearer <token>
//
// Sejak migrasi 022 juga membaca users.sesi_sejak: token yang terbit SEBELUM
// waktu itu ditolak, jadi reset sandi, ganti sandi, dan menyalakan 2FA bisa
// mengeluarkan semua perangkat lain. Harganya satu query kecil per request
// (primary key). JWT tetap dipakai untuk identitas & role; DB cuma ditanya
// "token ini masih berlaku?".
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token tidak ditemukan' });
  }

  const token = authHeader.split(' ')[1];

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: 'Token tidak valid atau sudah kedaluwarsa' });
  }

  try {
    const { rows: [u] } = await pool.query(
      'SELECT sesi_sejak FROM users WHERE user_id = $1',
      [payload.user_id]
    );
    // iat dalam detik; sesi_sejak ditulis dalam detik dari jam Node yang sama
    // (detikIni di auth.controller), jadi token yang terbit di detik yang sama
    // dengan pencabutan tetap lolos (iat*1000 === sesi_sejak).
    if (!u || (u.sesi_sejak && payload.iat * 1000 < u.sesi_sejak.getTime())) {
      return res.status(401).json({ message: 'Sesi sudah berakhir. Silakan masuk lagi.' });
    }
  } catch (err) {
    return next(err);
  }

  // payload berisi: { user_id, role }
  req.user = payload;
  next();
}

// Middleware pembatas role, contoh: requireRole('vendor_owner')
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Akses ditolak untuk role ini' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
