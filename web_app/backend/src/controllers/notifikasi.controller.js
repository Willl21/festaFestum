const pool = require('../config/db');

// Lonceng notifikasi (migrasi 019). Satu endpoint untuk klien dan vendor:
// penerimanya selalu akun yang login, jadi kepemilikan cukup `user_id = $1`.

// GET /api/v1/notifikasi — 30 terbaru + jumlah yang belum dibaca.
async function listNotifikasi(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT notifikasi_id, judul, isi, tautan, dibaca, dibuat_at
         FROM notifikasi WHERE user_id = $1
        ORDER BY dibuat_at DESC
        LIMIT 30`,
      [req.user.user_id]
    );
    const belum = await pool.query(
      'SELECT count(*)::int AS n FROM notifikasi WHERE user_id = $1 AND NOT dibaca',
      [req.user.user_id]
    );
    res.json({ data: rows, belum_dibaca: belum.rows[0].n });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/notifikasi/baca — tandai semua sudah dibaca. Dipanggil saat
// lonceng dibuka; per-item tidak perlu untuk daftar sependek ini.
async function tandaiDibaca(req, res, next) {
  try {
    await pool.query(
      'UPDATE notifikasi SET dibaca = TRUE WHERE user_id = $1 AND NOT dibaca',
      [req.user.user_id]
    );
    res.json({ belum_dibaca: 0 });
  } catch (err) {
    next(err);
  }
}

module.exports = { listNotifikasi, tandaiDibaca };
