-- 023: paket MUA per orang = harga paket untuk N orang + tarif orang tambahan
-- (5 Okt 2026, model "A" yang dipilih user).
--
-- Sampai 022, paket per orang ditagih `price x jumlah orang`, padahal
-- deskripsinya menulis "Mulai dari 2 orang" dan harga di kartu terbaca harga
-- paket. Menambah satu orang langsung menggandakan totalnya.
--
-- Sekarang:
--   - min_orang                = berapa orang yang SUDAH termasuk harga paket,
--   - harga_per_orang_tambahan = tarif tiap orang di atas itu. NULL = paket
--     tidak menerima tambahan orang (pola yang sama dengan
--     harga_per_jam_tambahan).
-- Durasi tetap durasi_menit x jumlah orang (minimal min_orang).
-- Kedua kolom cuma berarti untuk per_orang = true; selain itu NULL.

BEGIN;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS min_orang                SMALLINT,
  ADD COLUMN IF NOT EXISTS harga_per_orang_tambahan NUMERIC(12, 2);

ALTER TABLE services DROP CONSTRAINT IF EXISTS services_orang_tambahan_sah;
ALTER TABLE services ADD CONSTRAINT services_orang_tambahan_sah CHECK (
  (min_orang IS NULL OR min_orang BETWEEN 1 AND 50)
  AND (harga_per_orang_tambahan IS NULL OR harga_per_orang_tambahan >= 0)
);

-- Isi awal dari teks deskripsi yang sudah ada ("Mulai dari 3 orang"), dan
-- tarif orang tambahan = harga paket dibagi jumlah orang dasar, dibulatkan
-- ke ribuan. Vendor bisa mengubah keduanya di form layanan.
UPDATE services
   SET min_orang = COALESCE(
         (substring(details->>'jumlah_orang' FROM 'Mulai dari ([0-9]+)'))::smallint, 1)
 WHERE per_orang AND min_orang IS NULL;

UPDATE services
   SET harga_per_orang_tambahan = ROUND(price / min_orang, -3)
 WHERE per_orang AND harga_per_orang_tambahan IS NULL;

COMMIT;
