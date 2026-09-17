const pool = require('../config/db');
const { hitungSaldo, vendorIdMilik } = require('../lib/saldo');
const { acquireLock, lockHolder, releaseLock } = require('../config/redis');

const VALID_SLOTS = ['pagi', 'siang', 'malam'];
const VALID_EVENT_TYPES = [
  'wedding', 'engagement', 'graduation', 'gala_dinner', 'corporate_seminar',
];

// DP 30% dari total. Angka bisnis, bukan konstanta teknis — kalau nanti beda
// per vendor, pindahkan ke kolom di tabel vendors.
const DP_RATE = 0.3;

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// POST /api/v1/bookings  (login)
// Body: { service_id, event_date, time_slot, event_type, event_location_detail }
//
// Tiga lapis pertahanan terhadap double-booking, dari luar ke dalam:
//   1. Redis lock  — menolak lebih awal, sebelum sentuh DB
//   2. SELECT ... FOR UPDATE — dua request yang lolos lapis 1 diantrekan DB
//   3. UNIQUE (schedule_id) di bookings — jaring terakhir kalau 1 & 2 bocor
async function createBooking(req, res, next) {
  const { service_id, event_date, time_slot, event_type, event_location_detail } = req.body;

  if (!service_id || !event_date || !time_slot || !event_type || !event_location_detail) {
    return res.status(400).json({
      message: 'service_id, event_date, time_slot, event_type, dan event_location_detail wajib diisi',
    });
  }
  if (!isValidDate(event_date)) {
    return res.status(400).json({ message: 'event_date harus format YYYY-MM-DD' });
  }
  if (!VALID_SLOTS.includes(time_slot)) {
    return res.status(400).json({ message: 'time_slot tidak valid', allowed: VALID_SLOTS });
  }
  if (!VALID_EVENT_TYPES.includes(event_type)) {
    return res.status(400).json({ message: 'event_type tidak valid', allowed: VALID_EVENT_TYPES });
  }

  const userId = req.user.user_id;
  let vendorId = null;
  let weOwnTheLock = false;

  const client = await pool.connect();
  try {
    const svc = await client.query(
      `SELECT vendor_id, price, minimum_notice_days,
              ($2::date >= CURRENT_DATE + minimum_notice_days) AS notice_ok
       FROM services WHERE service_id = $1 AND is_active = TRUE`,
      [service_id, event_date]
    );

    if (svc.rows.length === 0) {
      return res.status(404).json({ message: 'Layanan tidak ditemukan atau sudah tidak aktif' });
    }

    const { vendor_id, price, minimum_notice_days, notice_ok } = svc.rows[0];
    vendorId = vendor_id;

    if (!notice_ok) {
      return res.status(400).json({
        message: `Layanan ini butuh pemesanan minimal ${minimum_notice_days} hari sebelum acara`,
      });
    }

    // Kalau user sudah hold slot ini lewat /schedules/hold, lock-nya sudah
    // atas namanya — jangan direbut ulang, cukup dipakai lalu dilepas di akhir.
    const holder = await lockHolder(vendor_id, event_date, time_slot);
    if (holder && holder !== userId) {
      return res.status(409).json({ message: 'Slot sedang diproses user lain' });
    }
    if (!holder) {
      const got = await acquireLock(vendor_id, event_date, time_slot, userId);
      if (!got) {
        return res.status(409).json({ message: 'Slot sedang diproses user lain' });
      }
    }
    weOwnTheLock = true;

    await client.query('BEGIN');

    // FOR UPDATE mengunci baris slot: request kedua menunggu di sini sampai
    // yang pertama commit, lalu melihat status sudah bukan 'available'.
    const sch = await client.query(
      `SELECT schedule_id FROM vendor_schedules
       WHERE vendor_id = $1 AND event_date = $2::date AND time_slot = $3::time_slot
         AND status = 'available'
       FOR UPDATE`,
      [vendor_id, event_date, time_slot]
    );

    if (sch.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Slot tidak tersedia' });
    }

    const scheduleId = sch.rows[0].schedule_id;
    const dpAmount = (Number(price) * DP_RATE).toFixed(2);

    await client.query(
      `UPDATE vendor_schedules SET status = 'held', updated_at = now()
       WHERE schedule_id = $1`,
      [scheduleId]
    );

    const booking = await client.query(
      `INSERT INTO bookings
         (user_id, service_id, schedule_id, event_type, event_location_detail,
          total_price, dp_amount, soft_lock_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '24 hours')
       RETURNING *`,
      [userId, service_id, scheduleId, event_type, event_location_detail, price, dpAmount]
    );

    await client.query('COMMIT');

    res.status(201).json({ booking: booking.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
    // Lock dilepas apa pun hasilnya: kalau booking sukses, DB (status 'held')
    // yang jadi penjaga; kalau gagal, slot harus segera bebas untuk user lain.
    if (weOwnTheLock) await releaseLock(vendorId, event_date, time_slot, userId);
  }
}

// Booking 'pending' yang lewat 24 jam tanpa DP dibatalkan, slotnya dibebaskan.
// Satu statement, dijalankan berkala dari index.js.
// ponytail: setInterval di dalam proses app. Kalau nanti backend jalan >1
// instance, dua instance akan menyapu bersamaan — tidak merusak (query-nya
// idempoten), tapi pindahkan ke cron eksternal kalau mulai berisik.
async function expireStaleBookings() {
  try {
    const { rows } = await pool.query(
      `WITH expired AS (
         UPDATE bookings
            SET payment_status = 'expired',
                -- Vendor yang tidak menjawab sampai batas waktu = menolak.
                -- Tanpa ini pesanannya kedaluwarsa tapi statusnya tetap
                -- 'menunggu' selamanya, dan customer tidak pernah dapat jawaban.
                confirm_status = CASE WHEN confirm_status = 'menunggu'
                                      THEN 'ditolak'::booking_confirm_status
                                      ELSE confirm_status END,
                confirm_note = CASE WHEN confirm_status = 'menunggu'
                                    THEN 'Vendor tidak merespons sampai batas waktu'
                                    ELSE confirm_note END,
                updated_at = now()
         WHERE payment_status = 'pending' AND soft_lock_expires_at < now()
         RETURNING schedule_id
       )
       UPDATE vendor_schedules SET status = 'available', updated_at = now()
       WHERE schedule_id IN (SELECT schedule_id FROM expired)
         AND status = 'held'
       RETURNING schedule_id`
    );
    if (rows.length) console.log(`[expiry] ${rows.length} slot dibebaskan`);
  } catch (err) {
    console.error('[expiry] gagal:', err.message);
  }
}

// Satu booking apa adanya, lengkap dengan layanan, vendor, jadwal, dan
// riwayat pembayarannya. Dipakai bertiga oleh Pesanan Saya (sisi customer),
// Pemesanan (sisi vendor), dan Dashboard vendor — supaya bentuk datanya sama
// dan frontend tidak perlu menyusun ulang per halaman.
const BOOKING_SELECT = `
  SELECT b.booking_id, b.event_type, b.event_location_detail,
         b.total_price, b.dp_amount, b.payment_status,
         b.confirm_status, b.confirm_note, b.confirmed_at,
         b.soft_lock_expires_at, b.created_at,
         s.service_id, s.service_name, s.category,
         v.vendor_id, v.business_name, v.city,
         u.name AS customer_name, u.phone AS customer_phone,
         sch.event_date, sch.time_slot,
         COALESCE(
           (SELECT json_agg(json_build_object(
                     'payment_id', p.payment_id,
                     'payment_type', p.payment_type,
                     'amount', p.amount,
                     'method', p.method,
                     'details', p.details,
                     'gateway_status', p.gateway_status,
                     'expires_at', p.expires_at,
                     'paid_at', p.paid_at
                   ) ORDER BY p.created_at)
              FROM payments p WHERE p.booking_id = b.booking_id),
           '[]'::json
         ) AS payments,
         -- null kalau belum diulas. Dipakai Pesanan Saya untuk memilih antara
         -- tombol "Beri Ulasan" dan bintang yang sudah terlanjur diberi.
         (SELECT json_build_object('rating', rv.rating, 'comment', rv.comment,
                                   'created_at', rv.created_at)
            FROM reviews rv WHERE rv.booking_id = b.booking_id) AS review
    FROM bookings b
    JOIN services s         ON s.service_id  = b.service_id
    JOIN vendors  v         ON v.vendor_id   = s.vendor_id
    JOIN users    u         ON u.user_id     = b.user_id
    JOIN vendor_schedules sch ON sch.schedule_id = b.schedule_id`;

// GET /api/v1/bookings  (login) — pesanan milik customer yang sedang login.
async function listMyBookings(req, res, next) {
  try {
    const { rows } = await pool.query(
      `${BOOKING_SELECT}
        WHERE b.user_id = $1
        ORDER BY b.created_at DESC`,
      [req.user.user_id]
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/bookings/:bookingId  (login)
// Kepemilikan ikut di WHERE: customer pemiliknya ATAU vendor yang dipesan.
// Selain itu 404, bukan 403, supaya ID valid tidak bocor.
async function getBooking(req, res, next) {
  try {
    const { rows } = await pool.query(
      `${BOOKING_SELECT}
        WHERE b.booking_id = $1
          AND (b.user_id = $2 OR v.owner_user_id = $2)`,
      [req.params.bookingId, req.user.user_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
    }
    res.json({ booking: rows[0] });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/bookings/vendor  (role: vendor_owner) — pesanan yang MASUK.
async function listVendorBookings(req, res, next) {
  try {
    const { rows } = await pool.query(
      `${BOOKING_SELECT}
        WHERE v.owner_user_id = $1
        ORDER BY sch.event_date ASC`,
      [req.user.user_id]
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/bookings/vendor/stats  (role: vendor_owner)
// Angka-angka untuk kartu di Dashboard vendor. Sengaja satu query: lima
// SELECT terpisah berarti lima round-trip ke Supabase untuk satu halaman.
async function vendorStats(req, res, next) {
  try {
    const { rows } = await pool.query(
      `WITH v AS (SELECT vendor_id FROM vendors WHERE owner_user_id = $1),
       b AS (
         SELECT bk.booking_id, bk.payment_status, bk.confirm_status, sch.event_date
           FROM bookings bk
           JOIN services s ON s.service_id = bk.service_id
           JOIN vendor_schedules sch ON sch.schedule_id = bk.schedule_id
          WHERE s.vendor_id IN (SELECT vendor_id FROM v)
       )
       SELECT
         -- Pendapatan = pembayaran yang BENAR-BENAR lunas bulan ini.
         COALESCE((
           SELECT SUM(p.amount) FROM payments p
            WHERE p.booking_id IN (SELECT booking_id FROM b)
              AND p.gateway_status = 'success'
              AND date_trunc('month', p.paid_at) = date_trunc('month', now())
         ), 0) AS revenue_bulan_ini,
         COALESCE((
           SELECT SUM(p.amount) FROM payments p
            WHERE p.booking_id IN (SELECT booking_id FROM b)
              AND p.gateway_status = 'success'
              AND date_trunc('month', p.paid_at)
                  = date_trunc('month', now() - interval '1 month')
         ), 0) AS revenue_bulan_lalu,
         -- Pesanan batal/kedaluwarsa BUKAN pesanan. Sebelum ini ikut terhitung,
         -- jadi angka "total" dan "selesai" naik tiap kali ada yang gagal.
         (SELECT count(*) FROM b
           WHERE payment_status NOT IN ('cancelled', 'expired'))::int AS total_pesanan,
         -- Dipisah dari menunggu_dp: yang satu menunggu VENDOR bertindak, yang
         -- satu menunggu CUSTOMER membayar. Digabung, tugas vendor tersembunyi
         -- di balik angka yang terbaca seperti salah customer.
         (SELECT count(*) FROM b WHERE confirm_status = 'menunggu'
             AND payment_status = 'pending')::int AS perlu_dijawab,
         (SELECT count(*) FROM b WHERE payment_status = 'pending'
             AND confirm_status = 'diterima')::int AS menunggu_dp,
         (SELECT count(*) FROM b WHERE payment_status = 'fully_paid')::int AS lunas,
         (SELECT count(*) FROM b
           WHERE event_date BETWEEN now() - interval '7 days' AND now()
             AND payment_status NOT IN ('cancelled', 'expired'))::int AS selesai_minggu_ini,
         (SELECT count(*) FROM vendor_schedules
           WHERE vendor_id IN (SELECT vendor_id FROM v)
             AND status = 'available' AND event_date >= CURRENT_DATE)::int AS slot_tersedia`,
      [req.user.user_id]
    );
    res.json({ stats: rows[0] });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/bookings/vendor/balance  (role: vendor_owner)
// Saldo vendor DITURUNKAN dari tabel payments, bukan disimpan sebagai kolom —
// kolom saldo gampang melenceng dari kenyataan kalau ada satu update terlewat.
//
// Aturannya: pembayaran yang sukses masih di ESCROW selama acaranya belum
// lewat; setelah tanggal acara terlampaui, dana masuk SALDO TERSEDIA dikurangi
// biaya platform. Penarikan dana belum ada (tabel payouts belum dibuat,
// menunggu keputusan alur approval admin).

async function vendorBalance(req, res, next) {
  try {
    const vendorId = await vendorIdMilik(pool, req.user.user_id);
    if (!vendorId) {
      return res.status(404).json({ message: 'Anda belum memiliki profil vendor' });
    }

    const saldo = await hitungSaldo(pool, vendorId);

    // Rumusnya dipakai bersama dengan pemeriksaan batas di POST /payouts —
    // lihat src/lib/saldo.js. Payout yang masih menunggu persetujuan sudah
    // ikut dikurangi di sana, jadi angka ini tidak bisa ditarik dua kali.
    res.json({ balance: { ...saldo, penarikan_aktif: true } });
  } catch (err) {
    next(err);
  }
}

// Membebaskan slot sebuah booking yang batal. Dipakai jalur tolak DAN jalur
// batal supaya dua-duanya melepas slot dengan syarat yang sama persis: hanya
// slot yang masih 'held'. Slot 'booked' berarti uang sudah masuk dan
// pembebasannya bukan urusan endpoint ini.
async function bebaskanSlot(client, scheduleId) {
  await client.query(
    `UPDATE vendor_schedules SET status = 'available', updated_at = now()
      WHERE schedule_id = $1 AND status = 'held'`,
    [scheduleId]
  );
}

// PATCH /api/v1/bookings/:bookingId/konfirmasi  (role: vendor_owner)
// Body: { action: 'terima' | 'tolak', note? }
//
// Satu endpoint dua aksi, mengikuti pola yang sudah dipakai
// PATCH /admin/users/:id/verification — bukan dua rute terpisah.
async function konfirmasiBooking(req, res, next) {
  const { action, note } = req.body;

  if (!['terima', 'tolak'].includes(action)) {
    return res.status(400).json({ message: 'action harus terima atau tolak' });
  }
  if (note != null && String(note).length > 500) {
    return res.status(400).json({ message: 'Catatan maksimal 500 karakter' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Kepemilikan ikut di WHERE: vendor lain tidak menemukan baris ini sama
    // sekali, jadi balasannya 404 dan ID pesanan yang valid tidak bocor.
    const bk = await client.query(
      `SELECT b.booking_id, b.schedule_id, b.confirm_status, b.payment_status
         FROM bookings b
         JOIN services s ON s.service_id = b.service_id
         JOIN vendors  v ON v.vendor_id  = s.vendor_id
        WHERE b.booking_id = $1 AND v.owner_user_id = $2
        FOR UPDATE OF b`,
      [req.params.bookingId, req.user.user_id]
    );

    if (bk.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
    }

    const booking = bk.rows[0];

    if (booking.confirm_status !== 'menunggu') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Pesanan ini sudah ${booking.confirm_status}`,
      });
    }

    if (action === 'terima') {
      // Batas bayar dihitung ulang dari saat DITERIMA, bukan dari saat pesanan
      // dibuat. Kalau tidak, vendor yang menjawab di jam ke-23 menyisakan satu
      // jam untuk customer membayar, lalu slotnya lepas sendiri.
      await client.query(
        `UPDATE bookings
            SET confirm_status = 'diterima', confirmed_at = now(),
                confirm_note = $2,
                soft_lock_expires_at = now() + interval '24 hours',
                updated_at = now()
          WHERE booking_id = $1`,
        [booking.booking_id, note || null]
      );
    } else {
      // Menolak sesudah uang masuk berarti perlu refund, dan refund di luar
      // lingkup proyek ini. Dijaga di sini walaupun charge sudah menolak
      // pembayaran untuk pesanan yang belum diterima — dua pintu lebih murah
      // daripada satu pintu yang ternyata bocor.
      if (booking.payment_status !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'Pesanan yang sudah dibayar tidak bisa ditolak. Hubungi admin.',
        });
      }

      await client.query(
        `UPDATE bookings
            SET confirm_status = 'ditolak', confirmed_at = now(),
                payment_status = 'cancelled', confirm_note = $2,
                updated_at = now()
          WHERE booking_id = $1`,
        [booking.booking_id, note || null]
      );
      await bebaskanSlot(client, booking.schedule_id);
    }

    await client.query('COMMIT');

    const { rows } = await pool.query(`${BOOKING_SELECT} WHERE b.booking_id = $1`, [booking.booking_id]);
    res.json({ booking: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

// POST /api/v1/bookings/:bookingId/batal  (login) — dibatalkan CUSTOMER.
//
// Hanya selama belum ada uang yang masuk. Begitu DP terbayar, pembatalan
// berarti pengembalian dana, dan refund tidak ada di lingkup proyek ini —
// lebih baik menolak dengan jujur daripada membatalkan pesanan lalu
// meninggalkan uang customer menggantung tanpa jalan pulang.
async function batalBooking(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bk = await client.query(
      `SELECT booking_id, schedule_id, payment_status
         FROM bookings
        WHERE booking_id = $1 AND user_id = $2
        FOR UPDATE`,
      [req.params.bookingId, req.user.user_id]
    );

    if (bk.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
    }

    const booking = bk.rows[0];

    if (booking.payment_status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: booking.payment_status === 'cancelled' || booking.payment_status === 'expired'
          ? 'Pesanan ini sudah tidak aktif'
          : 'Pesanan yang sudah dibayar tidak bisa dibatalkan sendiri. Hubungi admin.',
      });
    }

    await client.query(
      `UPDATE bookings SET payment_status = 'cancelled', updated_at = now()
        WHERE booking_id = $1`,
      [booking.booking_id]
    );
    await bebaskanSlot(client, booking.schedule_id);

    await client.query('COMMIT');

    const { rows } = await pool.query(`${BOOKING_SELECT} WHERE b.booking_id = $1`, [booking.booking_id]);
    res.json({ booking: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

module.exports = {
  createBooking,
  expireStaleBookings,
  listMyBookings,
  getBooking,
  listVendorBookings,
  vendorStats,
  vendorBalance,
  konfirmasiBooking,
  batalBooking,
};
