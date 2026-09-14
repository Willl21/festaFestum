const pool = require('../config/db');
const { acquireLock, lockHolder, LOCK_TTL_SECONDS } = require('../config/redis');

const VALID_SLOTS = ['pagi', 'siang', 'malam'];

// Rentang maksimal satu permintaan ketersediaan. Kalender cuma butuh
// sebulan; 92 hari memberi ruang untuk tampilan tiga bulan.
const MAX_RENTANG_HARI = 92;

// Format YYYY-MM-DD, sekaligus menolak tanggal ngawur seperti 2026-02-31.
function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// POST /api/v1/schedules  (vendor_owner)
// Body: { slots: [{ event_date, time_slot }, ...] }
// Vendor diambil dari akun yang login — satu akun satu vendor.
async function setSchedules(req, res, next) {
  try {
    const { slots } = req.body;

    if (!Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ message: 'slots wajib diisi dan berupa array' });
    }

    if (slots.length > 100) {
      return res.status(400).json({ message: 'Maksimal 100 slot per request' });
    }

    for (const s of slots) {
      if (!s || !isValidDate(s.event_date) || !VALID_SLOTS.includes(s.time_slot)) {
        return res.status(400).json({
          message: 'Tiap slot butuh event_date (YYYY-MM-DD) dan time_slot yang valid',
          allowed_time_slots: VALID_SLOTS,
        });
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

    // ON CONFLICT DO NOTHING, bukan DO UPDATE: slot yang sudah 'booked' atau
    // 'held' tidak boleh diam-diam dikembalikan jadi 'available' oleh vendor.
    const result = await pool.query(
      `INSERT INTO vendor_schedules (vendor_id, event_date, time_slot)
       SELECT $1, d.event_date::date, d.time_slot::time_slot
       FROM jsonb_to_recordset($2::jsonb) AS d(event_date text, time_slot text)
       ON CONFLICT (vendor_id, event_date, time_slot) DO NOTHING
       RETURNING schedule_id, event_date, time_slot, status`,
      [vendorId, JSON.stringify(slots)]
    );

    res.status(201).json({
      created: result.rows.length,
      skipped: slots.length - result.rows.length,
      schedules: result.rows,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/services/:serviceId/availability?from=YYYY-MM-DD&to=YYYY-MM-DD  (public)
// Status seluruh slot dalam satu rentang, untuk menggambar kalender pemesanan.
//
// Ada karena /schedules/check cuma menjawab SATU tanggal sekali panggil —
// kalender sebulan akan menembakkan 60 request. Di sini satu query.
//
// Yang dikembalikan hanya slot yang benar-benar dibuka vendor. Tanggal yang
// tidak muncul berarti tidak bisa dipesan, jadi frontend tidak perlu tahu
// bedanya "vendor tutup" dan "tidak pernah dibuka".
//
// Lock Redis SENGAJA tidak diperiksa di sini: statusnya berubah dalam
// hitungan menit dan memeriksa 60 tanggal ke Redis untuk menggambar kalender
// itu mahal. Slot yang sedang dipegang orang lain tetap tertangkap saat
// /schedules/check dipanggil setelah user memilih, lalu sekali lagi oleh
// lock + constraint saat booking dibuat.
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
      `SELECT vendor_id, minimum_notice_days,
              (CURRENT_DATE + minimum_notice_days)::text AS paling_cepat
         FROM services
        WHERE service_id = $1 AND is_active = TRUE`,
      [serviceId]
    );

    if (svc.rows.length === 0) {
      return res.status(404).json({ message: 'Layanan tidak ditemukan atau sudah tidak aktif' });
    }

    const { vendor_id, minimum_notice_days, paling_cepat } = svc.rows[0];

    const slots = await pool.query(
      `SELECT event_date::text AS event_date, time_slot, status
         FROM vendor_schedules
        WHERE vendor_id = $1
          AND event_date BETWEEN $2::date AND $3::date
        ORDER BY event_date, time_slot`,
      [vendor_id, from, to]
    );

    res.json({
      service_id: serviceId,
      vendor_id,
      minimum_notice_days,
      // Tanggal paling awal yang boleh dipesan. Dihitung di DB supaya zona
      // waktu server yang dipakai, bukan zona waktu browser pemesan.
      earliest_date: paling_cepat,
      data: slots.rows,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/schedules/check  (public)
// Body: { service_id, event_date, time_slot }
// Menjawab satu pertanyaan: slot ini bisa dipesan atau tidak, dan kenapa.
async function checkAvailability(req, res, next) {
  try {
    const { service_id, event_date, time_slot } = req.body;

    if (!service_id || !event_date || !time_slot) {
      return res.status(400).json({ message: 'service_id, event_date, dan time_slot wajib diisi' });
    }
    if (!isValidDate(event_date)) {
      return res.status(400).json({ message: 'event_date harus format YYYY-MM-DD' });
    }
    if (!VALID_SLOTS.includes(time_slot)) {
      return res.status(400).json({ message: 'time_slot tidak valid', allowed: VALID_SLOTS });
    }

    // Sekali jalan: data service + apakah lead time-nya terpenuhi + status slot.
    // minimum_notice_days sengaja dihitung di sini (bukan constraint DB), karena
    // aturannya per-service dan hanya relevan saat pemesanan.
    const q = await pool.query(
      `SELECT s.vendor_id, s.service_name, s.price, s.minimum_notice_days,
              ($2::date >= CURRENT_DATE + s.minimum_notice_days) AS notice_ok,
              sch.schedule_id, sch.status
       FROM services s
       LEFT JOIN vendor_schedules sch
         ON sch.vendor_id = s.vendor_id
        AND sch.event_date = $2::date
        AND sch.time_slot = $3::time_slot
       WHERE s.service_id = $1 AND s.is_active = TRUE`,
      [service_id, event_date, time_slot]
    );

    if (q.rows.length === 0) {
      return res.status(404).json({ message: 'Layanan tidak ditemukan atau sudah tidak aktif' });
    }

    const r = q.rows[0];
    const base = {
      service_id,
      vendor_id: r.vendor_id,
      service_name: r.service_name,
      price: r.price,
      event_date,
      time_slot,
      minimum_notice_days: r.minimum_notice_days,
    };

    if (!r.notice_ok) {
      return res.json({
        ...base,
        available: false,
        reason: `Layanan ini butuh pemesanan minimal ${r.minimum_notice_days} hari sebelum acara`,
      });
    }
    if (!r.schedule_id) {
      return res.json({ ...base, available: false, reason: 'Vendor belum membuka slot di tanggal ini' });
    }
    if (r.status !== 'available') {
      return res.json({ ...base, available: false, reason: `Slot berstatus ${r.status}` });
    }

    // Slot bebas menurut DB, tapi mungkin sedang dipegang user lain di checkout.
    const holder = await lockHolder(r.vendor_id, event_date, time_slot);
    if (holder && holder !== (req.user && req.user.user_id)) {
      return res.json({ ...base, available: false, reason: 'Slot sedang diproses user lain' });
    }

    res.json({ ...base, schedule_id: r.schedule_id, available: true, reason: null });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/schedules/hold  (login)
// Dipanggil saat user klik "Pesan" dan masuk halaman checkout. Inilah gunanya
// Redis: menahan slot SEBELUM baris booking dibuat, supaya user lain langsung
// ditolak alih-alih baru tahu setelah capek isi form.
async function holdSlot(req, res, next) {
  try {
    const { service_id, event_date, time_slot } = req.body;

    if (!service_id || !isValidDate(event_date) || !VALID_SLOTS.includes(time_slot)) {
      return res.status(400).json({
        message: 'service_id, event_date (YYYY-MM-DD), dan time_slot wajib diisi dengan benar',
        allowed_time_slots: VALID_SLOTS,
      });
    }

    const q = await pool.query(
      `SELECT s.vendor_id, sch.schedule_id, sch.status
       FROM services s
       LEFT JOIN vendor_schedules sch
         ON sch.vendor_id = s.vendor_id
        AND sch.event_date = $2::date
        AND sch.time_slot = $3::time_slot
       WHERE s.service_id = $1 AND s.is_active = TRUE`,
      [service_id, event_date, time_slot]
    );

    if (q.rows.length === 0) {
      return res.status(404).json({ message: 'Layanan tidak ditemukan atau sudah tidak aktif' });
    }

    const { vendor_id, schedule_id, status } = q.rows[0];
    if (!schedule_id || status !== 'available') {
      return res.status(409).json({ message: 'Slot tidak tersedia' });
    }

    const got = await acquireLock(vendor_id, event_date, time_slot, req.user.user_id);
    if (!got) {
      return res.status(409).json({ message: 'Slot sedang diproses user lain, coba beberapa menit lagi' });
    }

    res.json({
      vendor_id,
      schedule_id,
      event_date,
      time_slot,
      hold_expires_in_seconds: LOCK_TTL_SECONDS,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/schedules/me?from=YYYY-MM-DD&to=YYYY-MM-DD  (role: vendor_owner)
// Mengisi kalender di halaman Jadwal vendor.
//
// Rentang WAJIB dibatasi: tanpa `from`/`to` satu vendor dengan setahun slot
// akan menarik ribuan baris untuk menggambar satu bulan.
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

    const vendor = await pool.query(
      'SELECT vendor_id FROM vendors WHERE owner_user_id = $1',
      [req.user.user_id]
    );
    if (vendor.rows.length === 0) {
      return res.status(404).json({ message: 'Profil vendor belum dibuat' });
    }

    // Booking yang menempel di slot ikut dibawa, supaya kalender bisa
    // menampilkan siapa yang memesan tanpa panggilan kedua.
    const { rows } = await pool.query(
      `SELECT sch.schedule_id, sch.event_date, sch.time_slot, sch.status,
              b.booking_id, b.payment_status, u.name AS customer_name
         FROM vendor_schedules sch
         LEFT JOIN bookings b ON b.schedule_id = sch.schedule_id
         LEFT JOIN users u    ON u.user_id     = b.user_id
        WHERE sch.vendor_id = $1
          AND sch.event_date BETWEEN $2::date AND $3::date
        ORDER BY sch.event_date, sch.time_slot`,
      [vendor.rows[0].vendor_id, from, to]
    );

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/schedules/:scheduleId  (role: vendor_owner)
// Menutup slot = menghapus barisnya, karena aturan tabel vendor_schedules
// adalah "tidak ada baris berarti tidak menerima pesanan".
//
// Kepemilikan ikut di WHERE lewat subquery vendor, dan status HARUS masih
// 'available': slot yang sudah dipesan tidak boleh hilang begitu saja karena
// bookings mereferensikannya (ON DELETE RESTRICT juga akan menolak).
async function deleteSchedule(req, res, next) {
  try {
    const { rows } = await pool.query(
      `DELETE FROM vendor_schedules sch
        WHERE sch.schedule_id = $1
          AND sch.status = 'available'
          AND sch.vendor_id IN (SELECT vendor_id FROM vendors WHERE owner_user_id = $2)
        RETURNING sch.schedule_id`,
      [req.params.scheduleId, req.user.user_id]
    );

    if (rows.length === 0) {
      // Bisa berarti: bukan milik dia, tidak ada, atau sudah dipesan. Ketiganya
      // dibalas 404 supaya tidak bocor slot mana yang ada dan milik siapa.
      return res.status(404).json({
        message: 'Slot tidak ditemukan atau sudah dipesan sehingga tidak bisa ditutup',
      });
    }

    res.json({ message: 'Slot ditutup', schedule_id: rows[0].schedule_id });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  setSchedules, checkAvailability, listAvailability, holdSlot, listMySchedules,
  deleteSchedule,
};
