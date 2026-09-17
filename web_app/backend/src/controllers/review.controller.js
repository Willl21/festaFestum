const pool = require('../config/db');

const KOMENTAR_MAKS = 1000;

// vendors.rating_avg/rating_count adalah angka TURUNAN dari tabel reviews,
// disimpan supaya listing vendor tidak perlu menghitung rata-rata 250 vendor
// tiap kali halaman kategori dibuka. Karena turunan, dia wajib dihitung ulang
// di transaksi yang sama dengan ulasannya — kalau tidak, satu kegagalan di
// tengah jalan meninggalkan bintang yang tidak cocok dengan ulasannya.
async function hitungUlangRating(client, vendorId) {
  await client.query(
    `UPDATE vendors v
        SET rating_avg   = COALESCE(r.avg_rating, 0),
            rating_count = COALESCE(r.n, 0),
            updated_at   = now()
       FROM (SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating, count(*)::int AS n
               FROM reviews WHERE vendor_id = $1) r
      WHERE v.vendor_id = $1`,
    [vendorId]
  );
}

// POST /api/v1/bookings/:bookingId/ulasan  (login)
// Body: { rating: 1..5, comment? }
//
// Syaratnya sengaja ketat: hanya pemilik pesanan, hanya kalau LUNAS, dan
// hanya setelah tanggal acaranya lewat. Ulasan sebelum acaranya terjadi tidak
// menilai apa pun, dan ulasan tanpa pesanan membuat bintang vendor bisa
// dikarang siapa saja.
async function buatUlasan(req, res, next) {
  const { rating, comment } = req.body;
  const angka = Number(rating);

  if (!Number.isInteger(angka) || angka < 1 || angka > 5) {
    return res.status(400).json({ message: 'rating harus bilangan bulat 1 sampai 5' });
  }
  if (comment != null && String(comment).length > KOMENTAR_MAKS) {
    return res.status(400).json({ message: `Komentar maksimal ${KOMENTAR_MAKS} karakter` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bk = await client.query(
      `SELECT b.booking_id, b.payment_status, s.vendor_id,
              (sch.event_date < CURRENT_DATE) AS acara_lewat
         FROM bookings b
         JOIN services s ON s.service_id = b.service_id
         JOIN vendor_schedules sch ON sch.schedule_id = b.schedule_id
        WHERE b.booking_id = $1 AND b.user_id = $2`,
      [req.params.bookingId, req.user.user_id]
    );

    if (bk.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
    }

    const { payment_status, vendor_id, acara_lewat } = bk.rows[0];

    if (payment_status !== 'fully_paid') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Ulasan hanya bisa diberi setelah pesanan lunas' });
    }
    if (!acara_lewat) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Ulasan bisa diberi setelah acaranya selesai' });
    }

    // UNIQUE (booking_id) sudah ada di skema, jadi ulasan kedua ditolak oleh
    // DB, bukan oleh pemeriksaan terpisah yang bisa kebobolan dua klik
    // bersamaan.
    const ins = await client.query(
      `INSERT INTO reviews (booking_id, user_id, vendor_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (booking_id) DO NOTHING
       RETURNING review_id, rating, comment, created_at`,
      [req.params.bookingId, req.user.user_id, vendor_id, angka, comment || null]
    );

    if (ins.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Pesanan ini sudah pernah diulas' });
    }

    await hitungUlangRating(client, vendor_id);
    await client.query('COMMIT');

    res.status(201).json({ review: ins.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

// GET /api/v1/vendors/:vendorId/ulasan  (publik)
// Membalas kunci `data` seperti endpoint listing lain di backend ini.
//
// avatar_url SENGAJA tidak ikut: isinya data URL, dan menempelkannya di
// respons daftar membuat satu halaman detail vendor membengkak ratusan KB.
async function listUlasanVendor(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const { rows } = await pool.query(
      `SELECT r.review_id, r.rating, r.comment, r.created_at,
              u.name AS user_name, s.category
         FROM reviews r
         JOIN users u    ON u.user_id    = r.user_id
         JOIN bookings b ON b.booking_id = r.booking_id
         JOIN services s ON s.service_id = b.service_id
        WHERE r.vendor_id = $1
        ORDER BY r.created_at DESC
        LIMIT $2`,
      [req.params.vendorId, limit]
    );

    // Ringkasan dihitung dari seluruh ulasan, bukan cuma yang ikut terkirim
    // di atas — kalau tidak, sebaran bintangnya ikut terpotong LIMIT.
    const { rows: ringkas } = await pool.query(
      `SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0) AS rata_rata,
              count(*)::int AS jumlah,
              count(*) FILTER (WHERE rating = 5)::int AS b5,
              count(*) FILTER (WHERE rating = 4)::int AS b4,
              count(*) FILTER (WHERE rating = 3)::int AS b3,
              count(*) FILTER (WHERE rating = 2)::int AS b2,
              count(*) FILTER (WHERE rating = 1)::int AS b1
         FROM reviews WHERE vendor_id = $1`,
      [req.params.vendorId]
    );

    res.json({ data: rows, ringkasan: ringkas[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { buatUlasan, listUlasanVendor, hitungUlangRating };
