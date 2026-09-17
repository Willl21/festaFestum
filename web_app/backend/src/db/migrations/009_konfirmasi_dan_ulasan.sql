-- 009: konfirmasi vendor atas pesanan, pembatalan, dan ulasan yang benar-benar
-- dihitung.
--
-- Dua hal yang sebelumnya bolong:
--
-- 1. KONFIRMASI. bookings cuma punya payment_status, jadi customer bisa
--    langsung bayar tanpa vendornya pernah menyetujui. Kolom confirm_status
--    dipisah dari payment_status, BUKAN ditambahkan sebagai nilai enum baru
--    di sana: dua hal ini berjalan sendiri-sendiri (pesanan bisa diterima tapi
--    belum dibayar, atau ditolak setelah DP masuk), dan menggabungkannya
--    memaksa tiap pembaca payment_status menebak mana yang sedang dimaksud.
--
-- 2. ULASAN. Tabel reviews sudah berdiri sejak skema awal tapi tidak pernah
--    ada jalan mengisinya, sementara vendors.rating_avg/rating_count diisi
--    karangan seed-vendors.js. Tidak ada kolom baru di sini — yang kurang
--    cuma endpoint. Yang ditambahkan: indeks supaya daftar ulasan per vendor
--    tidak memindai seluruh tabel, dan pengembalian rating ke nol untuk vendor
--    yang memang belum pernah diulas.

BEGIN;

CREATE TYPE booking_confirm_status AS ENUM ('menunggu', 'diterima', 'ditolak');

ALTER TABLE bookings
  ADD COLUMN confirm_status booking_confirm_status NOT NULL DEFAULT 'menunggu',
  ADD COLUMN confirm_note   TEXT,
  ADD COLUMN confirmed_at   TIMESTAMPTZ;

-- Pesanan yang sudah ada dianggap SUDAH diterima. Kalau tidak, seluruh data
-- demo yang sudah dibayar mendadak berstatus 'menunggu' dan alur lamanya
-- terlihat rusak — padahal yang berubah cuma aturannya, bukan pesanannya.
UPDATE bookings
   SET confirm_status = 'diterima',
       confirmed_at   = COALESCE(updated_at, created_at);

-- Daftar ulasan selalu dibaca per vendor dan diurutkan terbaru dulu.
CREATE INDEX IF NOT EXISTS idx_reviews_vendor_baru
  ON reviews (vendor_id, created_at DESC);

-- rating_avg/rating_count sebelum ini isinya karangan seed. Mulai sekarang
-- angkanya dihitung ulang dari tabel reviews tiap kali ulasan masuk, jadi
-- vendor yang belum punya ulasan harus jujur menampilkan 0 — bukan 4.8 dari
-- 120 ulasan yang tidak pernah ada.
UPDATE vendors v
   SET rating_avg   = COALESCE(r.avg_rating, 0),
       rating_count = COALESCE(r.n, 0)
  FROM (SELECT vendor_id, ROUND(AVG(rating)::numeric, 2) AS avg_rating, count(*)::int AS n
          FROM reviews GROUP BY vendor_id) r
 WHERE r.vendor_id = v.vendor_id;

UPDATE vendors
   SET rating_avg = 0, rating_count = 0
 WHERE vendor_id NOT IN (SELECT vendor_id FROM reviews);

COMMIT;
