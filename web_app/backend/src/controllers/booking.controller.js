const pool = require('../config/db');
const { hitungSaldo, vendorIdMilik } = require('../lib/saldo');
const { acquireLock, lockHolder, releaseLock } = require('../config/redis');
const { perTim: kategoriPerTim, BOOKING_AKTIF, berbasisJam } = require('../lib/kategori');
const { timKosong, bacaDurasi } = require('./schedule.controller');
const { kirimEmail, urlFrontend } = require('../lib/email');

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
// Body: { service_id, event_date, start_time, event_type, event_location_detail,
//         quantity? }
//
// Tiga lapis pertahanan terhadap double-booking, dari luar ke dalam:
//   1. Redis lock — menolak lebih awal, sebelum sentuh DB. Hanya untuk
//      kategori yang mengunci shift; florist boleh checkout bersamaan.
//   2. pg_advisory_xact_lock(vendor+tanggal) — menyerialkan semua pemesanan
//      vendor itu di tanggal itu, jadi hitungan kapasitas tidak bisa balapan.
//      Menggantikan SELECT ... FOR UPDATE yang dulu mengunci baris jadwal:
//      barisnya sekarang tidak ada sampai vendor menutup tanggalnya.
//   3. Jaring terakhir di level DB kalau 1 & 2 bocor. Tiap pesanan per_tim
//      memegang NOMOR tim (slot_ke, 0..kapasitas-1):
//      - EO: idx_booking_slot_ke_aktif, satu nomor sekali sehari (migrasi 014).
//      - MUA & fotografer: bookings_rentang_tidak_bertumpuk, satu nomor tidak
//        boleh punya dua rentang jam yang bertumpuk (migrasi 016).
async function createBooking(req, res, next) {
  const {
    service_id, event_date, start_time, event_type, event_location_detail, quantity,
    jam_tambahan, konsultasi_id,
  } = req.body;

  if (!service_id || !event_date || !start_time || !event_type || !event_location_detail) {
    return res.status(400).json({
      message: 'service_id, event_date, start_time, event_type, dan event_location_detail wajib diisi',
    });
  }
  if (!isValidDate(event_date)) {
    return res.status(400).json({ message: 'event_date harus format YYYY-MM-DD' });
  }
  // Jam acara/kirim. HH:MM 24 jam — bentuk yang dikirim <input type="time">.
  // Menit bebas, bukan kelipatan tertentu: kelima mockup "Isi data diri"
  // memakai input jam biasa, bukan daftar pilihan.
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start_time)) {
    return res.status(400).json({ message: 'start_time harus format HH:MM (24 jam)' });
  }
  if (!VALID_EVENT_TYPES.includes(event_type)) {
    return res.status(400).json({ message: 'event_type tidak valid', allowed: VALID_EVENT_TYPES });
  }

  // Jumlah = berapa orang (MUA), berapa buket (florist), berapa setel (sewa).
  // Tidak dikirim berarti 1, supaya pemanggil lama tetap jalan.
  const jumlah = quantity === undefined || quantity === null ? 1 : Number(quantity);
  if (!Number.isInteger(jumlah) || jumlah < 1 || jumlah > 999) {
    return res.status(400).json({ message: 'quantity harus bilangan bulat 1-999' });
  }

  const userId = req.user.user_id;

  let vendorId = null;
  let weOwnTheLock = false;
  let client;
  try {
    client = await pool.connect();

    // Akun dari login Google lahir tanpa nomor HP (Google tidak memberinya),
    // padahal vendor butuh nomor itu untuk menghubungi pemesannya. Ditagih di
    // sini, satu pintu untuk kelima halaman pesan. Di DALAM try: query yang
    // gagal di luar try tidak tertangkap dan mematikan seluruh proses.
    const hp = await client.query('SELECT phone FROM users WHERE user_id = $1', [userId]);
    if (!hp.rows[0]?.phone?.trim()) {
      return res.status(400).json({
        message: 'Lengkapi nomor WhatsApp di halaman Profil dulu sebelum memesan.',
      });
    }

    const svc = await client.query(
      `SELECT s.vendor_id, s.price, s.minimum_notice_days, s.category, s.service_name,
              s.durasi_menit, s.per_orang, s.harga_per_jam_tambahan,
              v.daily_capacity, v.jeda_menit,
              ($2::date >= CURRENT_DATE + s.minimum_notice_days) AS notice_ok
         FROM services s
         JOIN vendors  v ON v.vendor_id = s.vendor_id
        WHERE s.service_id = $1 AND s.is_active = TRUE`,
      [service_id, event_date]
    );

    if (svc.rows.length === 0) {
      return res.status(404).json({ message: 'Layanan tidak ditemukan atau sudah tidak aktif' });
    }

    const layanan = svc.rows[0];
    const {
      vendor_id, price, minimum_notice_days, category, daily_capacity, notice_ok,
    } = layanan;
    // Satu pesanan = satu tim (MUA/EO/fotografer) atau sekian unit stok
    // (florist/sewa). Yang pertama memotong kapasitas 1 berapa pun jumlahnya.
    const perTim = kategoriPerTim(category);
    // Tanggalnya habis begitu ada satu pesanan: cuma vendor per_tim yang
    // kapasitasnya 1. Yang menentukan perlu-tidaknya lock Redis.
    // MUA & fotografer: yang habis JAM tim-nya, bukan harinya (migrasi 016).
    const perJam = berbasisJam(category);
    const eksklusif = perTim && daily_capacity === 1 && !perJam;
    vendorId = vendor_id;

    let durasi = null;
    let tambahan = 0;
    if (perJam) {
      // Jadwalnya dipilih per jam penuh, dan rentang kuncinya dihitung dari
      // situ — menit bebas akan membuat dua pesanan saling mengunci 15 menit
      // yang tidak pernah bisa dipakai siapa pun.
      if (!/^([01]\d|2[0-3]):00$/.test(start_time)) {
        return res.status(400).json({ message: 'start_time harus jam penuh, format HH:00' });
      }
      const d = bacaDurasi(layanan, jumlah, jam_tambahan);
      if (d.galat) return res.status(400).json({ message: d.galat });
      durasi = d.durasi;
      tambahan = d.tambahan;
    } else if (jam_tambahan) {
      return res.status(400).json({ message: 'Layanan ini tidak dipesan per jam' });
    }

    if (!notice_ok) {
      return res.status(400).json({
        message: `Layanan ini butuh pemesanan minimal ${minimum_notice_days} hari sebelum acara`,
      });
    }

    // Lock Redis cuma masuk akal kalau tanggalnya memang eksklusif: dihitung
    // per tim DAN kapasitasnya cuma satu. Florist berkapasitas 10 — dan MUA
    // berkru 3 — tidak boleh dipaksa antre satu-satu di checkout, karena
    // tanggalnya memang muat lebih dari satu pesanan.
    if (eksklusif) {
      // Kalau user sudah hold tanggal ini lewat /schedules/hold, lock-nya
      // sudah atas namanya — jangan direbut ulang, cukup dipakai lalu
      // dilepas di akhir.
      const holder = await lockHolder(vendor_id, event_date);
      if (holder && holder !== userId) {
        return res.status(409).json({ message: 'Tanggal sedang diproses user lain' });
      }
      if (!holder) {
        const got = await acquireLock(vendor_id, event_date, userId);
        if (!got) {
          return res.status(409).json({ message: 'Tanggal sedang diproses user lain' });
        }
      }
      weOwnTheLock = true;
    }

    await client.query('BEGIN');

    // Semua pemesanan vendor ini di tanggal ini diserialkan di sini. Inilah
    // yang membuat hitungan kapasitas — dan pemilihan nomor slot di bawah —
    // tidak bisa balapan.
    //
    // Pesanan berbasis jam diserialkan per VENDOR, bukan per tanggal: rentang
    // yang dimulai malam ini bisa menyeberang ke besok pagi, jadi dua pesanan
    // di dua tanggal berbeda tetap bisa bertabrakan.
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [perJam ? `${vendor_id}:jam` : `${vendor_id}:${event_date}`]
    );

    // Baris vendor_schedules sekarang HANYA berarti "vendor menutup ini".
    // Tidak ada baris = tersedia.
    const tutup = await client.query(
      `SELECT 1 FROM vendor_schedules
        WHERE vendor_id = $1 AND event_date = $2::date`,
      [vendor_id, event_date]
    );
    if (tutup.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Vendor tidak menerima pesanan di tanggal ini' });
    }

    // per_tim dibaca dari BARIS PESANANNYA, bukan dari kategori layanan
    // yang sedang dipesan: satu vendor satu kategori, jadi seluruh pesanannya
    // dihitung dengan aturan yang sama, termasuk pesanan lama.
    let slotKe = null;

    // Berbasis jam: cari tim yang kosong selama rentang itu. Tidak ada
    // hitungan harian sama sekali — tim yang sama boleh dapat pesanan pagi
    // dan sore di hari yang sama.
    if (perJam) {
      slotKe = await timKosong(client, {
        vendor_id, event_date, start_time,
        durasi, jeda: layanan.jeda_menit, kapasitas: daily_capacity,
      });
      if (slotKe === null) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'Jam itu bentrok dengan pesanan lain. Pilih jam lain.',
        });
      }
    }

    const pakai = perJam ? null : await client.query(
      `SELECT COALESCE(SUM(CASE WHEN per_tim THEN 1 ELSE quantity END), 0)::int AS terpakai
         FROM bookings
        WHERE vendor_id = $1 AND event_date = $2::date AND ${BOOKING_AKTIF}`,
      [vendor_id, event_date]
    );

    const butuh = perTim ? 1 : jumlah;
    const sisa = perJam ? Infinity : daily_capacity - pakai.rows[0].terpakai;
    if (butuh > sisa) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: sisa <= 0
          ? 'Vendor sudah penuh di tanggal tersebut'
          : `Vendor hanya sanggup ${sisa} lagi di tanggal tersebut`,
        sisa_kapasitas: Math.max(0, sisa),
      });
    }

    // Nomor slot untuk pesanan per_tim: angka bebas TERKECIL di
    // [0, daily_capacity). Dipilih di dalam advisory lock, jadi dua pemesan
    // tidak bisa mendapat angka yang sama; kalaupun lock-nya bocor,
    // idx_booking_slot_ke_aktif menolak yang kedua di level DB.
    //
    // Pesanan yang tidak per_tim tidak bernomor (NULL) — kapasitasnya dipotong
    // per unit, dan beberapa pesanan memang boleh berbagi hari yang sama.
    if (perTim && !perJam) {
      const bebas = await client.query(
        `SELECT n FROM generate_series(0, $3::int - 1) n
          WHERE NOT EXISTS (
            SELECT 1 FROM bookings
             WHERE vendor_id = $1 AND event_date = $2::date
               AND slot_ke = n AND per_tim AND ${BOOKING_AKTIF}
          )
          ORDER BY n LIMIT 1`,
        [vendor_id, event_date, daily_capacity]
      );
      // Tidak mungkin kosong: hitungan kapasitas di atas sudah lolos. Kalau
      // toh kosong, itu berarti kedua hitungan tidak sepakat — tolak, jangan
      // menyimpan pesanan tanpa nomor.
      if (bebas.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Vendor sudah penuh di tanggal tersebut' });
      }
      slotKe = bebas.rows[0].n;
    }

    // Nominal selalu dihitung ulang di sini dari harga layanan di DB — angka
    // dari browser tidak dipercaya, termasuk jumlahnya.
    // Jam tambahan ditagih per pesanan, bukan per orang.
    const totalPrice = (
      Number(price) * jumlah + tambahan * Number(layanan.harga_per_jam_tambahan || 0)
    ).toFixed(2);
    const dpAmount = (Number(totalPrice) * DP_RATE).toFixed(2);

    // Pesanan dari rekomendasi paket di ruang konsultasi (migrasi 017). Ruangnya
    // harus milik pemesan DAN dengan vendor yang sama — kalau tidak, pesanan
    // bisa ditempelkan ke obrolan orang lain. Tidak cocok = ditolak, bukan
    // diam-diam diabaikan.
    let konsultasiId = null;
    if (konsultasi_id) {
      const ruang = await client.query(
        `SELECT conversation_id FROM conversations
          WHERE conversation_id = $1 AND jenis = 'konsultasi'
            AND user_id = $2 AND vendor_id = $3`,
        [konsultasi_id, userId, vendor_id]
      );
      if (ruang.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Ruang konsultasi tidak ditemukan' });
      }
      konsultasiId = konsultasi_id;
    }

    const booking = await client.query(
      `INSERT INTO bookings
         (user_id, service_id, vendor_id, event_date, start_time, per_tim,
          slot_ke, quantity, event_type, event_location_detail, total_price,
          dp_amount, soft_lock_expires_at, durasi_menit, jam_tambahan, jeda_menit,
          konsultasi_id)
       VALUES ($1, $2, $3, $4::date, $5::time, $6, $7, $8, $9, $10, $11, $12,
               now() + interval '24 hours', $13, $14, $15, $16)
       RETURNING *`,
      [userId, service_id, vendor_id, event_date, start_time, perTim,
       slotKe, jumlah, event_type, event_location_detail, totalPrice, dpAmount,
       durasi, tambahan, perJam ? layanan.jeda_menit : 0, konsultasiId]
    );

    // Jejak di ruang konsultasi: vendor langsung melihat paket rekomendasinya
    // benar-benar dipesan, tanpa harus membuka halaman Pemesanan. Satu
    // transaksi dengan pesanannya — tidak ada pesanan tanpa jejak.
    if (konsultasiId) {
      await client.query(
        `WITH c AS (
           UPDATE conversations SET last_message_at = now()
            WHERE conversation_id = $1 RETURNING conversation_id
         )
         INSERT INTO messages (conversation_id, sender_user_id, body)
         SELECT conversation_id, $2,
                '[Otomatis] Pesanan dibuat: ' || $3::text || ' untuk ' || to_char($4::date, 'DD/MM/YYYY')
                || ' pukul ' || $5::text || '. Menunggu konfirmasi vendor.'
           FROM c`,
        [konsultasiId, userId, layanan.service_name || 'paket', event_date, start_time]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({ booking: booking.rows[0] });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    // 23P01 = constraint EXCLUDE menolak: dua rentang jam bertumpuk lolos dari
    // pengecekan aplikasi (mis. lock bocor). Itu tetap "jadwal bentrok" bagi
    // pemesan, bukan kesalahan server.
    if (err.code === '23P01') {
      return res.status(409).json({ message: 'Jam itu bentrok dengan pesanan lain. Pilih jam lain.' });
    }
    next(err);
  } finally {
    client?.release();
    // Lock dilepas apa pun hasilnya: kalau booking sukses, DB (status 'held')
    // yang jadi penjaga; kalau gagal, slot harus segera bebas untuk user lain.
    if (weOwnTheLock) await releaseLock(vendorId, event_date, userId);
  }
}

// Booking 'pending' yang lewat 24 jam tanpa DP dibatalkan.
//
// Tidak ada lagi baris jadwal yang perlu dikembalikan ke 'available':
// kapasitas dihitung dari pesanan yang MASIH aktif, jadi begitu barisnya
// jadi 'expired' dia otomatis keluar dari hitungan. Satu UPDATE, selesai.
// ponytail: setInterval di dalam proses app. Kalau nanti backend jalan >1
// instance, dua instance akan menyapu bersamaan — tidak merusak (query-nya
// idempoten), tapi pindahkan ke cron eksternal kalau mulai berisik.
async function expireStaleBookings() {
  try {
    const { rowCount } = await pool.query(
      `UPDATE bookings
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
        WHERE payment_status = 'pending' AND soft_lock_expires_at < now()`
    );

    if (rowCount) console.log(`[expiry] ${rowCount} pesanan kedaluwarsa`);
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
         b.event_date, to_char(b.start_time, 'HH24:MI') AS start_time, b.quantity,
         -- Rentang jam untuk MUA & fotografer (migrasi 016); NULL untuk
         -- kategori harian. Jeda perjalanan sengaja tidak ikut dihitung.
         b.durasi_menit, b.jam_tambahan,
         to_char(b.start_time + b.durasi_menit * interval '1 minute', 'HH24:MI') AS end_time,
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
    JOIN users    u         ON u.user_id     = b.user_id`;

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
        ORDER BY b.event_date ASC`,
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
         SELECT bk.booking_id, bk.payment_status, bk.confirm_status, bk.event_date
           FROM bookings bk
          WHERE bk.vendor_id IN (SELECT vendor_id FROM v)
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
             AND payment_status NOT IN ('cancelled', 'expired'))::int AS selesai_minggu_ini`,
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
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Kepemilikan ikut di WHERE: vendor lain tidak menemukan baris ini sama
    // sekali, jadi balasannya 404 dan ID pesanan yang valid tidak bocor.
    const bk = await client.query(
      `SELECT b.booking_id, b.confirm_status, b.payment_status, b.konsultasi_id,
              b.user_id, v.vendor_id, v.business_name, s.service_name,
              -- Tanggal + jam untuk pesan otomatis & email. MUA & fotografer
              -- ikut menyebut rentangnya (migrasi 016).
              to_char(b.event_date, 'DD/MM/YYYY') || ' pukul ' || to_char(b.start_time, 'HH24:MI')
                || COALESCE('–' || to_char(b.start_time + b.durasi_menit * interval '1 minute', 'HH24:MI'), '')
                AS tanggal,
              c.email AS customer_email, c.name AS customer_name
         FROM bookings b
         JOIN services s ON s.service_id = b.service_id
         JOIN vendors  v ON v.vendor_id  = s.vendor_id
         JOIN users    c ON c.user_id    = b.user_id
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
    }

    // Pemberitahuan ke customer (revisi PM: "taunya udah dikonfirmasi
    // gimana?"). Dua jalur, dengan sifat yang sengaja berbeda:
    //
    // 1. Pesan di ruang obrolan pesanan ini — DI DALAM transaksi. Kalau
    //    gagal, konfirmasinya ikut batal: lebih baik vendor menekan ulang
    //    daripada pesanan diterima diam-diam tanpa jejak di chat. Dikirim atas
    //    nama pemilik vendor, jadi lencana obrolan di navbar customer menyala
    //    lewat penghitung belum-dibaca yang sudah ada. Ruangnya dibuat kalau
    //    belum ada, pola ON CONFLICT yang sama dengan openConversation.
    const diterima = action === 'terima';
    const isi = [
      diterima
        ? `[Otomatis] Pesanan "${booking.service_name}" untuk ${booking.tanggal} sudah DITERIMA. `
          + 'Silakan bayar DP dalam 24 jam lewat menu Pesanan Saya, supaya jadwalnya tidak dilepas.'
        : `[Otomatis] Mohon maaf, pesanan "${booking.service_name}" untuk ${booking.tanggal} DITOLAK.`,
      note ? `Catatan vendor: ${note}` : '',
    ].filter(Boolean).join('\n');

    //    Pesanan dari konsultasi (migrasi 017) diberi tahu di ruang
    //    konsultasinya — tempat paketnya direkomendasikan — bukan di ruang
    //    pesanan baru.
    if (!booking.konsultasi_id) {
      await client.query(
        `INSERT INTO conversations (jenis, booking_id, user_id, vendor_id)
         VALUES ('klien_vendor', $1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [booking.booking_id, booking.user_id, booking.vendor_id]
      );
    }
    await client.query(
      `WITH c AS (
         UPDATE conversations SET last_message_at = now()
          WHERE conversation_id = COALESCE($4::uuid,
                  (SELECT conversation_id FROM conversations WHERE booking_id = $1))
          RETURNING conversation_id
       )
       INSERT INTO messages (conversation_id, sender_user_id, body)
       SELECT conversation_id, $2, $3 FROM c`,
      [booking.booking_id, req.user.user_id, isi, booking.konsultasi_id]
    );

    await client.query('COMMIT');

    // 2. Email — SESUDAH commit dan tidak ditunggu. Layanan luar yang lambat
    //    atau mati tidak boleh menahan jawaban vendor, apalagi membatalkannya.
    kirimEmail({
      ke: booking.customer_email,
      nama: booking.customer_name,
      subjek: diterima
        ? `Pesanan Anda di ${booking.business_name} diterima`
        : `Pesanan Anda di ${booking.business_name} ditolak`,
      teks: `Halo ${booking.customer_name},\n\n`
        + isi.replace('[Otomatis] ', '')
        + `\n\nLihat pesanan Anda: ${urlFrontend('/pesanan')}\n\nSalam,\nFesta Festum`,
    }).catch((e) => console.error('[email] konfirmasi gagal:', e.message));

    const { rows } = await pool.query(`${BOOKING_SELECT} WHERE b.booking_id = $1`, [booking.booking_id]);
    res.json({ booking: rows[0] });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client?.release();
  }
}

// POST /api/v1/bookings/:bookingId/batal  (login) — dibatalkan CUSTOMER.
//
// Hanya selama belum ada uang yang masuk. Begitu DP terbayar, pembatalan
// berarti pengembalian dana, dan refund tidak ada di lingkup proyek ini —
// lebih baik menolak dengan jujur daripada membatalkan pesanan lalu
// meninggalkan uang customer menggantung tanpa jalan pulang.
async function batalBooking(req, res, next) {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const bk = await client.query(
      `SELECT booking_id, payment_status
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

    await client.query('COMMIT');

    const { rows } = await pool.query(`${BOOKING_SELECT} WHERE b.booking_id = $1`, [booking.booking_id]);
    res.json({ booking: rows[0] });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client?.release();
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
