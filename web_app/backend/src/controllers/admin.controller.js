const pool = require('../config/db');
const { PLATFORM_FEE_RATE } = require('../lib/saldo');

// ------------------------------------------------------------
// PUSAT KENDALI ADMIN
//
// PENGECUALIAN YANG DISENGAJA: di seluruh backend, kepemilikan ikut di klausa
// WHERE dan resource milik orang lain dibalas 404 (lihat vendor/booking
// controller). Admin adalah satu-satunya peran yang menembus aturan itu —
// tanpa itu, antrean kurasi lintas vendor tidak mungkin ditampilkan.
// Penjaganya cuma satu: requireRole('admin') di router. Karena itu TIDAK ADA
// vendor_id/user_id dari token yang dipakai memfilter di sini.
// ------------------------------------------------------------

const VALID_STATUS = ['pending', 'verified', 'all'];

// GET /api/v1/admin/vendors?status=pending|verified|all
// Antrean kurasi: vendor + pemiliknya + dokumen legal + kategori layanannya.
async function listVendorsForReview(req, res, next) {
  try {
    const status = req.query.status || 'pending';
    if (!VALID_STATUS.includes(status)) {
      return res.status(400).json({ message: 'status tidak valid', allowed: VALID_STATUS });
    }

    const kondisi =
      status === 'pending' ? 'WHERE v.is_verified = FALSE'
      : status === 'verified' ? 'WHERE v.is_verified = TRUE'
      : '';

    const result = await pool.query(
      `SELECT v.vendor_id, v.business_name, v.city, v.description,
              v.is_verified, v.verification_note, v.verified_at,
              v.rating_avg, v.rating_count, v.created_at,
              u.user_id AS owner_id, u.name AS owner_name,
              u.full_name AS owner_full_name, u.email AS owner_email, u.phone AS owner_phone,
              COALESCE(
                (SELECT json_agg(json_build_object(
                          'doc_type', d.doc_type, 'file_name', d.file_name,
                          'status', d.status, 'uploaded_at', d.uploaded_at)
                        ORDER BY d.doc_type)
                   FROM vendor_documents d WHERE d.vendor_id = v.vendor_id),
                '[]'::json) AS documents,
              COALESCE(
                (SELECT json_agg(DISTINCT s.category)
                   FROM services s WHERE s.vendor_id = v.vendor_id AND s.is_active),
                '[]'::json) AS categories
         FROM vendors v
         JOIN users u ON u.user_id = v.owner_user_id
         ${kondisi}
        ORDER BY v.created_at DESC
        LIMIT 100`
    );

    // Kunci `data`, sama dengan listing lain di API ini.
    res.json({ data: result.rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/stats
// Angka untuk kartu ringkasan di halaman kurasi.
async function vendorReviewStats(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT
         (SELECT count(*) FROM vendors WHERE is_verified = FALSE)         AS menunggu,
         (SELECT count(*) FROM vendors WHERE is_verified = TRUE)          AS terverifikasi,
         (SELECT count(*) FROM vendor_documents WHERE status = 'pending') AS dokumen_menunggu,
         (SELECT COALESCE(sum(total_price), 0) FROM bookings
            WHERE payment_status IN ('dp_paid', 'fully_paid'))            AS gmv`
    );

    res.json({ stats: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/vendors/:vendorId/verification
// Body: { action: 'approve' | 'reject', note? }
// Menyetujui vendor sekaligus menandai dokumennya, supaya vendor tidak
// melihat "terverifikasi" tapi dokumennya masih 'pending'.
async function reviewVendor(req, res, next) {
  const client = await pool.connect();
  try {
    const { vendorId } = req.params;
    const { action, note } = req.body;

    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ message: "action harus 'approve' atau 'reject'" });
    }

    // Penolakan tanpa alasan bikin vendor tidak tahu harus memperbaiki apa.
    if (action === 'reject' && (!note || !note.trim())) {
      return res.status(400).json({ message: 'note wajib diisi saat menolak' });
    }

    await client.query('BEGIN');

    const v = await client.query(
      `UPDATE vendors
          SET is_verified       = $1,
              verification_note = $2,
              verified_at       = now(),
              verified_by       = $3,
              updated_at        = now()
        WHERE vendor_id = $4
        RETURNING vendor_id, business_name, is_verified, verification_note, verified_at`,
      [action === 'approve', note?.trim() || null, req.user.user_id, vendorId]
    );

    if (v.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Vendor tidak ditemukan' });
    }

    const d = await client.query(
      `UPDATE vendor_documents
          SET status = $1
        WHERE vendor_id = $2
        RETURNING document_id`,
      [action === 'approve' ? 'approved' : 'rejected', vendorId]
    );

    await client.query('COMMIT');

    res.json({ vendor: v.rows[0], dokumen_diperbarui: d.rows.length });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------
// PUSAT ESCROW & PENCAIRAN
// ------------------------------------------------------------

const VALID_PAYOUT_STATUS = ['pending', 'paid', 'rejected', 'all'];

// GET /api/v1/admin/payouts?status=pending|paid|rejected|all
// Antrean pencairan LINTAS VENDOR — inti halaman Pusat Escrow.
async function listPayouts(req, res, next) {
  try {
    const status = req.query.status || 'pending';
    if (!VALID_PAYOUT_STATUS.includes(status)) {
      return res.status(400).json({ message: 'status tidak valid', allowed: VALID_PAYOUT_STATUS });
    }

    const { rows } = await pool.query(
      `SELECT po.payout_id, po.amount, po.status, po.note,
              po.requested_at, po.decided_at,
              v.vendor_id, v.business_name, v.city, v.is_verified,
              u.name AS owner_name, u.email AS owner_email,
              d.name AS decided_by_name
         FROM payouts po
         JOIN vendors v ON v.vendor_id = po.vendor_id
         JOIN users   u ON u.user_id   = v.owner_user_id
         LEFT JOIN users d ON d.user_id = po.decided_by
        WHERE ($1 = 'all' OR po.status::text = $1)
        ORDER BY po.requested_at DESC
        LIMIT 100`,
      [status]
    );

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/escrow
// Ringkasan dana: yang masih ditahan (acara belum jalan) vs yang sudah
// dirilis, memakai batas yang sama dengan saldo vendor (tanggal acara).
async function escrowSummary(req, res, next) {
  try {
    const { rows } = await pool.query(
      `WITH lunas AS (
         SELECT p.amount, bk.event_date
           FROM payments p
           JOIN bookings bk ON bk.booking_id = p.booking_id
          WHERE p.gateway_status = 'success'
       )
       SELECT
         COALESCE((SELECT SUM(amount) FROM lunas WHERE event_date >= CURRENT_DATE), 0) AS tertahan,
         COALESCE((SELECT SUM(amount) FROM lunas WHERE event_date <  CURRENT_DATE), 0) AS dirilis_kotor,
         (SELECT count(*) FROM lunas WHERE event_date >= CURRENT_DATE)::int            AS pesanan_tertahan,
         COALESCE((SELECT SUM(amount) FROM payouts WHERE status = 'pending'), 0)       AS antrean_pencairan,
         (SELECT count(*) FROM payouts WHERE status = 'pending')::int                  AS jumlah_antrean,
         COALESCE((SELECT SUM(amount) FROM payouts WHERE status = 'paid'), 0)          AS sudah_dicairkan`
    );

    const r = rows[0];
    const kotor = Number(r.dirilis_kotor);

    res.json({
      escrow: {
        tertahan: Number(r.tertahan),
        dirilis_kotor: kotor,
        biaya_platform: Math.round(kotor * PLATFORM_FEE_RATE),
        platform_fee_rate: PLATFORM_FEE_RATE,
        pesanan_tertahan: r.pesanan_tertahan,
        antrean_pencairan: Number(r.antrean_pencairan),
        jumlah_antrean: r.jumlah_antrean,
        sudah_dicairkan: Number(r.sudah_dicairkan),
      },
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/payouts/:payoutId
// Body: { action: 'approve' | 'reject', note? }
// Hanya payout 'pending' yang bisa diputuskan — klik dua kali tidak boleh
// mencairkan dana yang sama dua kali.
async function decidePayout(req, res, next) {
  try {
    const { payoutId } = req.params;
    const { action, note } = req.body;

    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ message: "action harus 'approve' atau 'reject'" });
    }
    if (action === 'reject' && (!note || !note.trim())) {
      return res.status(400).json({ message: 'note wajib diisi saat menolak' });
    }

    // Status lama ikut di klausa WHERE, jadi keputusan kedua atas payout yang
    // sama tidak mengubah apa pun (dan dibalas 409, bukan diam-diam sukses).
    const { rows } = await pool.query(
      `UPDATE payouts
          SET status     = $1,
              note       = $2,
              decided_at = now(),
              decided_by = $3
        WHERE payout_id = $4 AND status = 'pending'
        RETURNING payout_id, vendor_id, amount, status, note, decided_at`,
      [action === 'approve' ? 'paid' : 'rejected', note?.trim() || null, req.user.user_id, payoutId]
    );

    if (rows.length === 0) {
      const ada = await pool.query('SELECT status FROM payouts WHERE payout_id = $1', [payoutId]);
      if (ada.rows.length === 0) {
        return res.status(404).json({ message: 'Pengajuan pencairan tidak ditemukan' });
      }
      return res.status(409).json({
        message: 'Pengajuan ini sudah diputuskan sebelumnya',
        status: ada.rows[0].status,
      });
    }

    res.json({ payout: rows[0] });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/bookings?limit=
// Aliran acara terbaru lintas vendor untuk halaman ringkasan.
async function listBookings(req, res, next) {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);

    const { rows } = await pool.query(
      `SELECT bk.booking_id, bk.total_price, bk.payment_status, bk.created_at,
              bk.event_date, to_char(bk.start_time, 'HH24:MI') AS start_time,
              s.service_name, s.category,
              v.business_name, v.city,
              u.name AS customer_name
         FROM bookings bk
         JOIN services s ON s.service_id = bk.service_id
         JOIN vendors  v ON v.vendor_id  = s.vendor_id
         JOIN users    u ON u.user_id    = bk.user_id
        ORDER BY bk.created_at DESC
        LIMIT $1`,
      [limit]
    );

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

// ------------------------------------------------------------
// REGISTRI AKUN
// ------------------------------------------------------------

const VALID_ROLE = ['customer', 'vendor_owner', 'admin', 'all'];

// GET /api/v1/admin/users?role=&q=
// Registri semua akun + nilai transaksinya. `q` mencari nama/email.
async function listUsers(req, res, next) {
  try {
    const role = req.query.role || 'all';
    if (!VALID_ROLE.includes(role)) {
      return res.status(400).json({ message: 'role tidak valid', allowed: VALID_ROLE });
    }

    const q = (req.query.q || '').trim();

    const { rows } = await pool.query(
      `SELECT u.user_id, u.name, u.full_name, u.email, u.phone, u.role, u.created_at,
              u.is_verified AS akun_terverifikasi,
              v.vendor_id, v.business_name, v.city, v.is_verified,
              v.rating_avg, v.rating_count,
              COALESCE((
                SELECT SUM(p.amount)
                  FROM payments p
                  JOIN bookings bk ON bk.booking_id = p.booking_id
                 WHERE p.gateway_status = 'success'
                   AND (bk.user_id = u.user_id
                        OR bk.service_id IN (SELECT service_id FROM services WHERE vendor_id = v.vendor_id))
              ), 0) AS nilai_transaksi,
              (SELECT count(*) FROM bookings WHERE user_id = u.user_id)::int AS jumlah_pesanan
         FROM users u
         LEFT JOIN vendors v ON v.owner_user_id = u.user_id
        WHERE ($1 = 'all' OR u.role::text = $1)
          AND ($2 = '' OR u.name ILIKE '%' || $2 || '%' OR u.email ILIKE '%' || $2 || '%'
               OR v.business_name ILIKE '%' || $2 || '%')
        ORDER BY u.created_at DESC
        LIMIT 100`,
      [role, q]
    );

    const ringkas = await pool.query(
      `SELECT
         count(*) FILTER (WHERE role = 'customer')::int     AS klien,
         count(*) FILTER (WHERE role = 'vendor_owner')::int AS vendor,
         count(*) FILTER (WHERE role = 'admin')::int        AS admin,
         count(*)::int                                      AS total
       FROM users`
    );

    res.json({ data: rows, ringkasan: ringkas.rows[0] });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/users/:userId/verification  { action: 'approve' | 'revoke' }
// Badge "Pengguna Terverifikasi" di halaman profil berasal dari sini. Sengaja
// keputusan admin, bukan OTP: kirim email/SMS butuh layanan pihak ketiga yang
// di luar lingkup lomba.
async function verifyUser(req, res, next) {
  try {
    const { action } = req.body;
    if (action !== 'approve' && action !== 'revoke') {
      return res.status(400).json({ message: "action harus 'approve' atau 'revoke'" });
    }

    const approve = action === 'approve';
    const { rows } = await pool.query(
      `UPDATE users
          SET is_verified = $1,
              verified_at = $2,
              verified_by = $3,
              updated_at  = now()
        WHERE user_id = $4
        RETURNING user_id, name, email, is_verified, verified_at`,
      [approve, approve ? new Date() : null, approve ? req.user.user_id : null, req.params.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Akun tidak ditemukan' });
    }

    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listVendorsForReview, vendorReviewStats, reviewVendor,
  listPayouts, escrowSummary, decidePayout,
  listBookings, listUsers, verifyUser,
};
