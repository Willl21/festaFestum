const pool = require('../config/db');
const { acquireLock, lockHolder, LOCK_TTL_SECONDS } = require('../config/redis');
const { perTim, BOOKING_AKTIF } = require('../lib/kategori');

// Rentang maksimal satu permintaan ketersediaan. Kalender cuma butuh
// sebulan; 92 hari memberi ruang untuk tampilan tiga bulan.
const MAX_RENTANG_HARI = 92;

// Sejauh apa ke depan vendor boleh dipesan. Dulu batasnya muncul sendiri dari
// data (seed cuma membuat 30 hari slot); sekarang ketersediaan tidak disimpan
// sama sekali, jadi batasnya harus disebut.
const HORIZON_HARI = 730;

// Format YYYY-MM-DD, sekaligus menolak tanggal ngawur seperti 2026-02-31.
function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// ------------------------------------------------------------
// Ketersediaan DITURUNKAN, tidak disimpan, dan sejak migrasi 014 satuannya
// TANGGAL — bukan lagi (tanggal, shift).
//
// vendor_schedules cuma berisi penutupan yang dibuat vendor; tidak ada baris
// berarti tersedia. Jadi sebuah tanggal tidak bisa dipesan kalau salah satu
// dari dua ini benar:
//
//   1. vendor menutupnya       -> ada baris di vendor_schedules
//   2. kapasitas harian habis  -> jumlah terpakai >= vendors.daily_capacity
//
// Cabang ketiga yang dulu ada ("shiftnya sudah terisi") hilang bersama shift.
// Dia memang tidak pernah menolak apa pun yang belum ditolak kapasitas pada
// vendor berkapasitas 1, dan pada vendor berkapasitas lebih dia justru
// menolak pesanan yang sah. Lihat migrasi 014.
//
// Keduanya dihitung dari sumber yang sama dengan yang dibaca createBooking,
// jadi kalender tidak bisa menawarkan tanggal yang pasti ditolak.
// ------------------------------------------------------------

// Dipakai listAvailability (sebulan sekaligus) dan cekTanggal (satu titik).
// Nomor parameternya dioper karena kedua pemanggil punya urutan argumen yang
// berbeda — di cekTanggal, dari dan sampai adalah tanggal yang sama.
const sqlKetersediaan = (svc, dari, sampai) => `
  WITH svc AS (
    SELECT s.vendor_id, s.category, s.minimum_notice_days, v.daily_capacity
      FROM services s
      JOIN vendors  v ON v.vendor_id = s.vendor_id
     WHERE s.service_id = ${svc} AND s.is_active = TRUE
  ),
  hari AS (
    SELECT d::date AS event_date
      FROM generate_series(${dari}::date, ${sampai}::date, interval '1 day') d
  ),
  terpakai AS (
    SELECT b.event_date,
           SUM(CASE WHEN b.per_tim THEN 1 ELSE b.quantity END)::int AS jumlah
      FROM bookings b, svc
     WHERE b.vendor_id = svc.vendor_id
       AND b.event_date BETWEEN ${dari}::date AND ${sampai}::date
       AND b.${BOOKING_AKTIF}
     GROUP BY b.event_date
  )
  SELECT h.event_date::text AS event_date,
         CASE
           WHEN EXISTS (
             SELECT 1 FROM vendor_schedules vs, svc
              WHERE vs.vendor_id = svc.vendor_id
                AND vs.event_date = h.event_date
           ) THEN 'blocked'
           WHEN COALESCE((SELECT jumlah FROM terpakai t WHERE t.event_date = h.event_date), 0)
                >= (SELECT daily_capacity FROM svc) THEN 'booked'
           ELSE 'available'
         END AS status,
         GREATEST(
           (SELECT daily_capacity FROM svc)
             - COALESCE((SELECT jumlah FROM terpakai t WHERE t.event_date = h.event_date), 0),
           0
         ) AS sisa_kapasitas
    FROM hari h
   ORDER BY h.event_date`;

// Verdict satu tanggal, dipakai /schedules/check dan /schedules/hold supaya
// keduanya tidak pernah menjawab beda untuk pertanyaan yang sama.
async function cekTanggal(service_id, event_date) {
  const q = await pool.query(
    `SELECT s.vendor_id, s.service_name, s.price, s.minimum_notice_days, s.category,
            v.daily_capacity,
            ($2::date >= CURRENT_DATE + s.minimum_notice_days) AS notice_ok,
            ($2::date <= CURRENT_DATE + ${HORIZON_HARI}) AS horizon_ok,
            k.status, k.sisa_kapasitas
       FROM services s
       JOIN vendors  v ON v.vendor_id = s.vendor_id
       CROSS JOIN LATERAL (${sqlKetersediaan('$1', '$2', '$2')}) k
      WHERE s.service_id = $1 AND s.is_active = TRUE`,
    [service_id, event_date]
  );
  return q.rows[0] || null;
}

// Lock Redis hanya untuk vendor yang benar-benar eksklusif seharian: dihitung
// per tim DAN cuma sanggup satu pesanan. Vendor berkapasitas lebih tidak
// dikunci — memaksa pembeli antre satu-satu di checkout cuma menghalangi
// mereka tanpa mencegah apa pun, dan kapasitasnya tetap dijaga advisory lock
// saat booking dibuat.
const eksklusifSeharian = (category, daily_capacity) => perTim(category) && daily_capacity === 1;

// POST /api/v1/schedules  (vendor_owner)
// Body: { dates: ['YYYY-MM-DD', ...] }
//
// MENUTUP tanggal. Vendor tersedia secara bawaan, jadi yang perlu dicatat
// cuma kapan dia tidak menerima pesanan. Sejak migrasi 014 satuannya tanggal
// penuh — tidak ada lagi bagian hari yang bisa ditutup sendirian.
async function tutupTanggal(req, res, next) {
  try {
    const { dates } = req.body;

    if (!Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ message: 'dates wajib diisi dan berupa array tanggal' });
    }
    if (dates.length > 100) {
      return res.status(400).json({ message: 'Maksimal 100 tanggal per request' });
    }
    for (const d of dates) {
      if (typeof d !== 'string' || !isValidDate(d)) {
        return res.status(400).json({ message: 'Tiap tanggal harus format YYYY-MM-DD' });
      }
    }

    const vendor = await pool.query(
      'SELECT vendor_id FROM vendors WHERE owner_user_id = $1',
      [req.user.user_id]
    );
    if (vendor.rows.length === 0) {
      return res.status(404).json({ message: 'Anda belum memiliki profil vendor' });
    }
    const vendorId = vendor.rows[0].vendor_id;

    // Menutup tanggal yang sudah terlanjur dipesan akan membuat kalender
    // berbohong ke customer yang pesanannya sudah diterima. Ditolak, dan
    // tanggal bermasalahnya disebutkan supaya vendor tahu harus membatalkan
    // yang mana lebih dulu.
    const bentrok = await pool.query(
      `SELECT DISTINCT b.event_date::text AS event_date
         FROM bookings b
        WHERE b.vendor_id = $1
          AND b.event_date = ANY($2::date[])
          AND b.${BOOKING_AKTIF}`,
      [vendorId, dates]
    );
    if (bentrok.rows.length > 0) {
      return res.status(409).json({
        message: 'Ada pesanan aktif di tanggal yang mau ditutup',
        bentrok: bentrok.rows.map((r) => r.event_date),
      });
    }

    const result = await pool.query(
      `INSERT INTO vendor_schedules (vendor_id, event_date, status)
       SELECT $1, d::date, 'blocked' FROM unnest($2::date[]) d
       ON CONFLICT (vendor_id, event_date) DO NOTHING
       RETURNING schedule_id, event_date::text AS event_date, status`,
      [vendorId, dates]
    );

    res.status(201).json({
      ditutup: result.rows.length,
      dilewati: dates.length - result.rows.length,
      schedules: result.rows,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/services/:serviceId/availability?from=YYYY-MM-DD&to=YYYY-MM-DD  (public)
//
// Dipakai kalender pemesanan. Satu baris per TANGGAL sejak migrasi 014 —
// dulu tiga baris per tanggal, satu per shift.
async function listAvailability(req, res, next) {
  try {
    const { serviceId } = req.params;
    const { from, to } = req.query;

    if (!isValidDate(from) || !isValidDate(to)) {
      return res.status(400).json({ message: 'from dan to wajib diisi, format YYYY-MM-DD' });
    }
    if (from > to) {
      return res.status(400).json({ message: 'from tidak boleh setelah to' });
    }

    // Batas rentang supaya satu request tidak bisa menarik data bertahun-tahun.
    const hari = (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000;
    if (hari > MAX_RENTANG_HARI) {
      return res.status(400).json({ message: `Rentang maksimal ${MAX_RENTANG_HARI} hari` });
    }

    const svc = await pool.query(
      `SELECT s.vendor_id, s.minimum_notice_days, v.daily_capacity,
              (CURRENT_DATE + s.minimum_notice_days)::text AS paling_cepat,
              (CURRENT_DATE + ${HORIZON_HARI})::text AS paling_lama
         FROM services s
         JOIN vendors  v ON v.vendor_id = s.vendor_id
        WHERE s.service_id = $1 AND s.is_active = TRUE`,
      [serviceId]
    );

    if (svc.rows.length === 0) {
      return res.status(404).json({ message: 'Layanan tidak ditemukan atau sudah tidak aktif' });
    }

    const { vendor_id, minimum_notice_days, daily_capacity, paling_cepat, paling_lama } = svc.rows[0];
    const hasil = await pool.query(sqlKetersediaan('$1', '$2', '$3'), [serviceId, from, to]);

    res.json({
      service_id: serviceId,
      vendor_id,
      minimum_notice_days,
      daily_capacity,
      // Tanggal paling awal yang boleh dipesan. Dihitung di DB supaya zona
      // waktu server yang dipakai, bukan zona waktu browser pemesan.
      earliest_date: paling_cepat,
      latest_date: paling_lama,
      data: hasil.rows,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/schedules/check  (public)
// Body: { service_id, event_date }
// Menjawab satu pertanyaan: tanggal ini bisa dipesan atau tidak, dan kenapa.
async function checkAvailability(req, res, next) {
  try {
    const { service_id, event_date } = req.body;

    if (!service_id || !event_date) {
      return res.status(400).json({ message: 'service_id dan event_date wajib diisi' });
    }
    if (!isValidDate(event_date)) {
      return res.status(400).json({ message: 'event_date harus format YYYY-MM-DD' });
    }

    const r = await cekTanggal(service_id, event_date);
    if (!r) {
      return res.status(404).json({ message: 'Layanan tidak ditemukan atau sudah tidak aktif' });
    }

    const base = {
      service_id,
      vendor_id: r.vendor_id,
      service_name: r.service_name,
      price: r.price,
      event_date,
      minimum_notice_days: r.minimum_notice_days,
      sisa_kapasitas: r.sisa_kapasitas,
    };

    if (!r.notice_ok) {
      return res.json({
        ...base,
        available: false,
        reason: `Layanan ini butuh pemesanan minimal ${r.minimum_notice_days} hari sebelum acara`,
      });
    }
    if (!r.horizon_ok) {
      return res.json({
        ...base,
        available: false,
        reason: 'Tanggal terlalu jauh ke depan',
      });
    }
    if (r.status !== 'available') {
      // 'blocked' = vendor menutup tanggalnya sendiri; 'booked' = kapasitas
      // hariannya habis. Dua sebab yang berbeda buat pemesan, jadi kalimatnya
      // juga dibedakan.
      return res.json({
        ...base,
        available: false,
        reason: r.status === 'blocked'
          ? 'Vendor tidak menerima pesanan di tanggal ini'
          : 'Vendor sudah penuh di tanggal ini',
      });
    }

    // Bebas menurut DB, tapi mungkin sedang dipegang user lain di checkout.
    if (eksklusifSeharian(r.category, r.daily_capacity)) {
      const holder = await lockHolder(r.vendor_id, event_date);
      if (holder && holder !== (req.user && req.user.user_id)) {
        return res.json({ ...base, available: false, reason: 'Tanggal sedang diproses user lain' });
      }
    }

    res.json({ ...base, available: true, reason: null });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/schedules/hold  (login)
// Dipanggil saat user klik "Pesan" dan masuk halaman checkout. Inilah gunanya
// Redis: menahan tanggal SEBELUM baris booking dibuat, supaya user lain
// langsung ditolak alih-alih baru tahu setelah capek isi form.
//
// Yang tidak eksklusif seharian tidak ditahan: kapasitasnya lebih dari satu,
// jadi memaksa pembeli antre satu-satu di checkout cuma menghalangi mereka
// tanpa mencegah apa pun.
async function holdSlot(req, res, next) {
  try {
    const { service_id, event_date } = req.body;

    if (!service_id || !isValidDate(event_date)) {
      return res.status(400).json({
        message: 'service_id dan event_date (YYYY-MM-DD) wajib diisi dengan benar',
      });
    }

    const r = await cekTanggal(service_id, event_date);
    if (!r) {
      return res.status(404).json({ message: 'Layanan tidak ditemukan atau sudah tidak aktif' });
    }
    if (!r.notice_ok || !r.horizon_ok || r.status !== 'available') {
      return res.status(409).json({ message: 'Tanggal tidak tersedia' });
    }

    const eksklusif = eksklusifSeharian(r.category, r.daily_capacity);
    if (eksklusif) {
      const got = await acquireLock(r.vendor_id, event_date, req.user.user_id);
      if (!got) {
        return res.status(409).json({ message: 'Tanggal sedang diproses user lain, coba beberapa menit lagi' });
      }
    }

    res.json({
      vendor_id: r.vendor_id,
      event_date,
      sisa_kapasitas: r.sisa_kapasitas,
      hold_expires_in_seconds: eksklusif ? LOCK_TTL_SECONDS : 0,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/schedules/me?from=YYYY-MM-DD&to=YYYY-MM-DD  (role: vendor_owner)
// Mengisi kalender di halaman Jadwal vendor.
//
// Membalas GRID penuh, bukan cuma baris yang ada — karena "tidak ada baris"
// sekarang berarti tersedia, dan halaman jadwal perlu membedakan tersedia,
// ditutup, dan terisi. Satu baris per tanggal.
async function listMySchedules(req, res, next) {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ message: 'from dan to wajib diisi (YYYY-MM-DD)' });
    }
    if (!isValidDate(from) || !isValidDate(to)) {
      return res.status(400).json({ message: 'from dan to harus format YYYY-MM-DD' });
    }
    if (from > to) {
      return res.status(400).json({ message: 'from tidak boleh setelah to' });
    }
    const hari = (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000;
    if (hari > MAX_RENTANG_HARI) {
      return res.status(400).json({ message: `Rentang maksimal ${MAX_RENTANG_HARI} hari` });
    }

    const vendor = await pool.query(
      'SELECT v.vendor_id, v.daily_capacity FROM vendors v WHERE v.owner_user_id = $1',
      [req.user.user_id]
    );
    if (vendor.rows.length === 0) {
      return res.status(404).json({ message: 'Profil vendor belum dibuat' });
    }
    const { vendor_id, daily_capacity } = vendor.rows[0];

    // Pesanan yang menempel di tanggal ikut dibawa, supaya kalender bisa
    // menampilkan siapa yang memesan tanpa panggilan kedua. Satu tanggal bisa
    // punya lebih dari satu pesanan — jumlahnya ikut dikirim supaya vendor
    // tidak cuma melihat satu nama.
    const { rows } = await pool.query(
      `WITH hari AS (
         SELECT d::date AS event_date
           FROM generate_series($2::date, $3::date, interval '1 day') d
       ),
       aktif AS (
         SELECT b.booking_id, b.event_date, b.per_tim, b.quantity,
                b.start_time, b.payment_status, u.name AS customer_name
           FROM bookings b
           JOIN users u ON u.user_id = b.user_id
          WHERE b.vendor_id = $1
            AND b.event_date BETWEEN $2::date AND $3::date
            AND b.${BOOKING_AKTIF}
       ),
       terpakai AS (
         SELECT event_date,
                SUM(CASE WHEN per_tim THEN 1 ELSE quantity END)::int AS jumlah
           FROM aktif GROUP BY event_date
       )
       SELECT h.event_date::text AS event_date,
              tutup.schedule_id,
              CASE
                WHEN tutup.schedule_id IS NOT NULL THEN 'blocked'
                WHEN COALESCE(t.jumlah, 0) >= $4 THEN 'booked'
                ELSE 'available'
              END AS status,
              -- Berapa yang sudah terpakai dari kapasitas hari itu. Dulu
              -- informasi ini tersirat dari mana shift yang masih hijau;
              -- tanpa shift, angkanya harus disebut sendiri.
              COALESCE(t.jumlah, 0)::int AS terpakai,
              isi.booking_id, isi.payment_status, isi.customer_name,
              to_char(isi.start_time, 'HH24:MI') AS start_time,
              COALESCE(isi.jumlah_pesanan, 0)::int AS jumlah_pesanan
         FROM hari h
         LEFT JOIN vendor_schedules tutup
                ON tutup.vendor_id = $1
               AND tutup.event_date = h.event_date
         LEFT JOIN LATERAL (
           SELECT a.booking_id, a.payment_status, a.customer_name, a.start_time,
                  count(*) OVER () AS jumlah_pesanan
             FROM aktif a
            WHERE a.event_date = h.event_date
            ORDER BY a.start_time, a.booking_id
            LIMIT 1
         ) isi ON TRUE
         LEFT JOIN terpakai t ON t.event_date = h.event_date
        ORDER BY h.event_date`,
      [vendor_id, from, to, daily_capacity]
    );

    res.json({ data: rows, daily_capacity });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/schedules/:scheduleId  (role: vendor_owner)
//
// Membuka kembali tanggal yang ditutup.
//
// Kepemilikan ikut di WHERE lewat subquery vendor. Baris di tabel ini pasti
// penutupan (dijaga CHECK di migrasi 013), jadi tidak ada risiko menghapus
// tanggal yang sedang dipesan.
async function bukaSlot(req, res, next) {
  try {
    const { rows } = await pool.query(
      `DELETE FROM vendor_schedules sch
        WHERE sch.schedule_id = $1
          AND sch.vendor_id IN (SELECT vendor_id FROM vendors WHERE owner_user_id = $2)
        RETURNING sch.schedule_id`,
      [req.params.scheduleId, req.user.user_id]
    );

    if (rows.length === 0) {
      // Bisa berarti: bukan milik dia, atau tidak ada. Dua-duanya 404 supaya
      // tidak bocor penutupan mana yang ada dan milik siapa.
      return res.status(404).json({ message: 'Penutupan tidak ditemukan' });
    }

    res.json({ message: 'Tanggal dibuka kembali', schedule_id: rows[0].schedule_id });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  tutupTanggal, checkAvailability, listAvailability, holdSlot, listMySchedules,
  bukaSlot,
};
