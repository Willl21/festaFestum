-- 011: satu foto per LAYANAN.
--
-- Sebelum menambah kolom ini, tabel gambar yang sudah ada dicek dulu — pelajaran
-- dari migrasi 008, waktu kolom vendors.gallery dibuat untuk hal yang ternyata
-- sudah dipegang portfolio_images.
--
-- portfolio_images TIDAK bisa dipakai di sini: kuncinya (vendor_id, sort_order)
-- mengikat foto ke VENDOR dalam tiga slot tetap — hero, 1, 2 — bukan ke salah
-- satu layanannya. Sebuah vendor bisa punya belasan layanan, dan yang dibutuhkan
-- adalah foto yang melekat pada masing-masing. Memaksakannya ke sana berarti
-- mengubah arti sort_order jadi "kadang slot, kadang service" — persis jenis
-- kebingungan yang dihindari migrasi 008.
--
-- Bentuk penyimpanannya mengikuti pola yang sudah dipakai users.avatar_url dan
-- portfolio_images.image_url: data URL di kolom TEXT, karena proyek ini tidak
-- punya object storage. Aturan penyajiannya juga ikut: kolom ini TIDAK pernah
-- ikut di respons daftar — listing membalas penanda has_photo, gambarnya
-- diambil terpisah lewat GET /services/:serviceId/photo yang membalas berkas
-- asli plus Cache-Control.
-- ponytail: data URL di kolom TEXT. Pindah ke object storage dan simpan URL
-- aslinya di kolom yang sama kalau baris services mulai berat dibaca.

BEGIN;

ALTER TABLE services ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMIT;
