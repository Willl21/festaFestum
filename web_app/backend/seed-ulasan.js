// Mengisi ulasan & rating vendor. Jalankan: node seed-ulasan.js [--hapus]
//
// KENAPA PERLU. rating_avg semua vendor 0 sejak migrasi 009 — angka 4.8 yang
// dulu terlihat itu karangan seed-vendors.js, dan begitu rating jadi turunan
// sungguhan dari tabel reviews, karangan itu hilang. Demo lomba jadi kosong
// bintang di semua kartu.
//
// KENAPA LEWAT DB, BUKAN API. POST /bookings/:id/ulasan mensyaratkan pesanan
// LUNAS dengan tanggal acara yang SUDAH LEWAT. Lewat API berarti membuat
// pesanan di masa depan, membayarnya di sandbox Midtrans satu per satu, lalu
// menunggu tanggalnya lewat. Tidak mungkin. Jadi barisnya disusun langsung,
// tapi MENGIKUTI aturan yang sama supaya datanya tidak saling bertentangan:
// tiap ulasan punya pesanan sungguhan, lunas, tanggalnya lampau, satu ulasan
// per pesanan.
//
// Pembayarannya ikut dibuat (DP + pelunasan, dua-duanya 'success'). Tanpa itu
// /vendor/keuangan membaca Rp0 sementara /vendor/pemesanan memperlihatkan
// pesanan lunas — saldo dihitung dari tabel payments, bukan dari status
// booking. Lihat src/lib/saldo.js.
//
// Bisa dijalankan berulang: run berikutnya menghapus dulu hasil run
// sebelumnya (dikenali dari email pengulasnya), jadi ulasannya tidak menumpuk.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./src/config/db');
const { perTim } = require('./src/lib/kategori');

// Domain seed, BUKAN @mail.com. Penanda @mail.com dipakai skrip tes dan
// disapu habis tiap habis menguji — pengulas ini harus selamat dari itu.
// Lihat memori test-data-cleanup.
const DOMAIN = '@festafestum.test';
const PASSWORD_SEED = 'password123';

const PENGULAS = [
  'Ayu Prameswari', 'Bagas Nugroho', 'Citra Halim', 'Dimas Wicaksono',
  'Elsa Maharani', 'Fajar Ramadhan', 'Gita Larasati', 'Hendra Kusuma',
  'Intan Permata', 'Joko Saputra', 'Kirana Dewi', 'Lukman Hakim',
  'Maya Anggraini', 'Nanda Pratama',
];

// Komentar per kategori. Sengaja menyebut hal yang spesifik ke bidangnya —
// kalau semua vendor dapat kalimat generik yang sama, halaman ulasan terbaca
// palsu dari jauh.
const KOMENTAR = {
  makeup_artist: [
    'Riasannya tahan dari akad sampai resepsi selesai, tidak luntur sama sekali.',
    'Hasilnya natural persis seperti yang saya minta waktu trial.',
    'Datang tepat waktu dan bawa tim lengkap. Ibu saya juga ikut dirias.',
    'Komunikatif dari awal, mau revisi look sampai saya cocok.',
    'Bagus, cuma jadwal trial-nya agak susah dicocokkan.',
  ],
  event_organizer: [
    'Rundown dijalankan rapi, tidak ada satu pun sesi yang molor.',
    'Koordinasi dengan vendor lain diurus semua, saya tinggal terima beres.',
    'Tim on-site responsif, ada kendala sound langsung ditangani.',
    'Perencanaannya matang, sampai hal kecil seperti alur tamu dipikirkan.',
    'Secara umum memuaskan, meski briefing awal sempat beberapa kali berubah.',
  ],
  photographer: [
    'Hasil fotonya tajam dan momennya dapat semua, termasuk yang candid.',
    'File mentah dikirim cepat, editan akhir tidak sampai dua minggu.',
    'Fotografernya luwes mengarahkan gaya, jadi tidak kaku.',
    'Dokumentasi video sinematiknya di luar ekspektasi.',
    'Bagus, tapi jumlah foto yang dikurasi agak lebih sedikit dari perkiraan.',
  ],
  florist: [
    'Buketnya segar dan tahan lama, warnanya sesuai contoh.',
    'Dekorasi meja pelaminan rapi dan sesuai tema yang saya kirim.',
    'Pengiriman tepat waktu, bunga sampai dalam kondisi sempurna.',
    'Rangkaiannya cantik, banyak tamu yang menanyakan floristnya.',
    'Puas, walau ada satu jenis bunga yang diganti karena stok kosong.',
  ],
  attire_rental: [
    'Kebayanya jatuh sempurna di badan, fitting cuma sekali sudah pas.',
    'Koleksinya banyak dan kondisinya terawat semua.',
    'Jas pengantin pria rapi, penjahitnya teliti waktu penyesuaian.',
    'Proses sewa gampang, pengembalian juga tidak dipersulit.',
    'Bahannya nyaman dipakai seharian, tidak gerah.',
  ],
};

const JENIS_ACARA = {
  makeup_artist: ['wedding', 'engagement', 'graduation'],
  event_organizer: ['wedding', 'gala_dinner', 'corporate_seminar'],
  photographer: ['wedding', 'graduation', 'engagement'],
  florist: ['wedding', 'graduation', 'engagement'],
  attire_rental: ['wedding', 'engagement', 'graduation'],
};

const LOKASI = [
  'Gedung Serbaguna Cikini, Jakarta Pusat',
  'Balai Kartini, Jakarta Selatan',
  'Hotel Grand Mercure, Kemayoran',
  'Aula Universitas, Depok',
  'Gedung Pernikahan Harmoni, Bekasi',
  'Rumah pribadi, Bintaro',
];

// Bintang condong ke atas: 5 dan 4 jauh lebih sering, 3 sesekali, 1-2 tidak
// pernah. Ini seed demo, bukan simulasi pasar — vendor yang ditampilkan di
// katalog memang vendor terverifikasi.
const BINTANG = [5, 5, 5, 5, 4, 4, 4, 5, 3, 4];

const acak = (arr) => arr[Math.floor(Math.random() * arr.length)];
const acakInt = (min, maks) => min + Math.floor(Math.random() * (maks - min + 1));

/** Tanggal lampau, 10-400 hari lalu. Ulasan wajib untuk acara yang sudah
 *  lewat — aturan yang sama dengan buatUlasan di review.controller.js. */
function tanggalLampau(offsetHari) {
  const d = new Date();
  d.setDate(d.getDate() - offsetHari);
  return d.toISOString().slice(0, 10);
}

async function hapusSeedLama(client) {
  // bookings dihapus lebih dulu: reviews & payments ikut CASCADE dari sana,
  // sedangkan bookings sendiri ON DELETE RESTRICT ke users. Urutan yang sama
  // dengan aturan di memori test-data-cleanup.
  const { rows } = await client.query(
    `SELECT user_id FROM users WHERE email LIKE 'ulasan-%' || $1`,
    [DOMAIN]
  );
  if (rows.length === 0) return 0;

  const ids = rows.map((r) => r.user_id);
  const b = await client.query('DELETE FROM bookings WHERE user_id = ANY($1::uuid[])', [ids]);
  await client.query('DELETE FROM users WHERE user_id = ANY($1::uuid[])', [ids]);
  return b.rowCount;
}

(async () => {
  const hanyaHapus = process.argv.includes('--hapus');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const dibuang = await hapusSeedLama(client);
    if (dibuang) console.log(`Seed ulasan lama dibersihkan: ${dibuang} pesanan.`);

    if (hanyaHapus) {
      await client.query(
        `UPDATE vendors v
            SET rating_avg = COALESCE(r.avg, 0), rating_count = COALESCE(r.n, 0)
           FROM (SELECT vendor_id, ROUND(AVG(rating)::numeric, 2) avg, count(*)::int n
                   FROM reviews GROUP BY vendor_id) r
          WHERE v.vendor_id = r.vendor_id`
      );
      await client.query(
        `UPDATE vendors SET rating_avg = 0, rating_count = 0
          WHERE NOT EXISTS (SELECT 1 FROM reviews WHERE reviews.vendor_id = vendors.vendor_id)`
      );
      await client.query('COMMIT');
      console.log('Selesai — hanya menghapus.');
      return;
    }

    // --- Pengulas -------------------------------------------------------
    const hash = await bcrypt.hash(PASSWORD_SEED, 10);
    const pengulas = [];
    for (let i = 0; i < PENGULAS.length; i++) {
      const r = await client.query(
        `INSERT INTO users (name, email, phone, password_hash, role)
         VALUES ($1, $2, $3, $4, 'customer')
         RETURNING user_id`,
        [PENGULAS[i], `ulasan-${i + 1}${DOMAIN}`, `0811000${String(i + 1).padStart(4, '0')}`, hash]
      );
      pengulas.push(r.rows[0].user_id);
    }
    console.log(`${pengulas.length} akun pengulas dibuat.`);

    // --- Vendor + layanan aktifnya --------------------------------------
    const vendors = await client.query(
      `SELECT v.vendor_id, v.daily_capacity,
              json_agg(json_build_object(
                'service_id', s.service_id, 'price', s.price, 'category', s.category
              )) AS layanan
         FROM vendors v
         JOIN services s ON s.vendor_id = v.vendor_id AND s.is_active = TRUE
        GROUP BY v.vendor_id`
    );

    let nBooking = 0;
    let nUlasan = 0;

    for (const v of vendors.rows) {
      // 2-5 ulasan per vendor. Tiap ulasan memakai TANGGAL yang berbeda:
      // untuk vendor per_tim, idx_booking_slot_ke_aktif melarang dua pesanan
      // aktif memegang slot yang sama di tanggal yang sama, dan seed ini
      // tidak perlu memamerkan kapasitas — cukup tidak melanggarnya.
      const jumlah = acakInt(2, 5);
      const tanggalDipakai = new Set();
      // Pengulas diacak tanpa pengulangan supaya satu vendor tidak diulas
      // orang yang sama dua kali.
      const urutan = [...pengulas].sort(() => Math.random() - 0.5).slice(0, jumlah);

      for (const userId of urutan) {
        const layanan = acak(v.layanan);
        const kategori = layanan.category;

        let tgl;
        do {
          tgl = tanggalLampau(acakInt(10, 400));
        } while (tanggalDipakai.has(tgl));
        tanggalDipakai.add(tgl);

        const tim = perTim(kategori);
        const qty = tim ? acakInt(1, 4) : acakInt(1, 3);
        const total = (Number(layanan.price) * qty).toFixed(2);
        const dp = (Number(total) * 0.3).toFixed(2);
        const jam = `${String(acakInt(8, 18)).padStart(2, '0')}:00`;

        const bk = await client.query(
          `INSERT INTO bookings
             (user_id, service_id, vendor_id, event_date, start_time, per_tim,
              slot_ke, quantity, event_type, event_location_detail, total_price,
              dp_amount, payment_status, confirm_status, confirmed_at,
              soft_lock_expires_at, created_at)
           VALUES ($1, $2, $3, $4::date, $5::time, $6, $7, $8, $9, $10, $11, $12,
                   'fully_paid', 'diterima',
                   $4::date - interval '20 days',
                   $4::date - interval '19 days',
                   $4::date - interval '21 days')
           RETURNING booking_id`,
          [
            userId, layanan.service_id, v.vendor_id, tgl, jam, tim,
            tim ? 0 : null, qty, acak(JENIS_ACARA[kategori] || ['wedding']),
            acak(LOKASI), total, dp,
          ]
        );
        const bookingId = bk.rows[0].booking_id;
        nBooking++;

        // DP lalu pelunasan, dua-duanya sukses. Sisa pelunasan = total - DP,
        // supaya jumlah kedua baris persis sama dengan total_price dan saldo
        // vendor tidak melenceng.
        const sisa = (Number(total) - Number(dp)).toFixed(2);
        await client.query(
          `INSERT INTO payments
             (booking_id, payment_type, amount, gateway_status, method, paid_at, created_at)
           VALUES
             ($1, 'down_payment', $2, 'success', 'bca_va',
              $4::date - interval '19 days', $4::date - interval '19 days'),
             ($1, 'settlement',   $3, 'success', 'qris',
              $4::date - interval '2 days',  $4::date - interval '2 days')`,
          [bookingId, dp, sisa, tgl]
        );

        await client.query(
          `INSERT INTO reviews (booking_id, user_id, vendor_id, rating, comment, created_at)
           VALUES ($1, $2, $3, $4, $5, $6::date + interval '2 days')`,
          [
            bookingId, userId, v.vendor_id, acak(BINTANG),
            acak(KOMENTAR[kategori] || KOMENTAR.event_organizer), tgl,
          ]
        );
        nUlasan++;
      }
    }

    // Rumus yang SAMA PERSIS dengan hitungUlangRating di review.controller.js.
    // Kalau dua tempat ini berbeda, bintang hasil seed tidak akan cocok dengan
    // bintang hasil ulasan sungguhan.
    await client.query(
      `UPDATE vendors v
          SET rating_avg = COALESCE(r.avg, 0), rating_count = COALESCE(r.n, 0), updated_at = now()
         FROM (SELECT vendor_id, ROUND(AVG(rating)::numeric, 2) avg, count(*)::int n
                 FROM reviews GROUP BY vendor_id) r
        WHERE v.vendor_id = r.vendor_id`
    );

    await client.query('COMMIT');

    const cek = await pool.query(
      `SELECT count(*) FILTER (WHERE rating_count = 0) AS nol,
              count(*) AS total,
              ROUND(AVG(rating_avg) FILTER (WHERE rating_count > 0), 2) AS rata
         FROM vendors`
    );
    console.log(`${nBooking} pesanan + ${nUlasan} ulasan dibuat.`);
    console.log(`Vendor tanpa rating: ${cek.rows[0].nol} dari ${cek.rows[0].total}`);
    console.log(`Rata-rata bintang: ${cek.rows[0].rata}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('GAGAL:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
