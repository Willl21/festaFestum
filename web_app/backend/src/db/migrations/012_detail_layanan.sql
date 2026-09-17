-- 012: field tambahan per kategori untuk layanan vendor.
--
-- Tiap kategori butuh keterangan yang berbeda: MUA perlu gaya makeup dan
-- jumlah orang, fotografer perlu output dan area layanan, sewa jas perlu
-- ukuran dan ketentuan sewa. Kalau tiap field jadi kolom sendiri, tabel
-- services tumbuh ~30 kolom yang 80%-nya NULL di baris mana pun.
--
-- Dipakai satu kolom JSONB, mengikuti pola yang sudah ada di tabel payments:
-- di sana `details` juga berisi bentuk yang beda-beda per metode (VA nomor,
-- QRIS URL, cstore kode). Daftar kunci yang sah dijaga di aplikasi, di
-- src/lib/layananDetail.js — bukan di DB, supaya menambah field baru tidak
-- menuntut migrasi lagi.
--
-- DEFAULT '{}' + NOT NULL berarti 17 layanan lama otomatis punya objek kosong
-- dan tidak ada satu pun yang perlu di-backfill; respons API-nya tetap valid.

BEGIN;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Menjaga isinya tetap objek. Tanpa ini sebuah bug di aplikasi bisa menyimpan
-- array atau string di sana, dan pembacanya baru meledak jauh di kemudian hari.
ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_details_objek;
ALTER TABLE services
  ADD CONSTRAINT services_details_objek
  CHECK (jsonb_typeof(details) = 'object');

COMMIT;
