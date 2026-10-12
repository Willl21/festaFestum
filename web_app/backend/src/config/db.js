const { Pool, types } = require('pg');
require('dotenv').config();

// Kolom DATE (oid 1082) dikembalikan apa adanya sebagai 'YYYY-MM-DD'.
// Default-nya pg membungkusnya jadi objek Date tengah malam waktu LOKAL,
// lalu res.json() menulisnya dalam UTC — di WIB (+7) itu mundur jadi jam
// 17:00 hari sebelumnya, dan tiap pembaca yang memotong 10 karakter pertama
// dapat tanggal yang salah. Tabel jadwal, booking, dan pembayaran semuanya
// lewat sini, jadi diperbaiki sekali di satu tempat.
types.setTypeParser(1082, (v) => v);

// Pool koneksi ke PostgreSQL. Semua query di controller pakai pool.query(...)
// Postgres lokal (CI, laptop) tidak memakai SSL dan menolak koneksi yang
// memintanya. DB hosted tetap lewat SSL seperti sebelumnya.
const lokal = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: lokal ? false : { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Unexpected error pada PostgreSQL pool', err);
  process.exit(1);
});

module.exports = pool;
