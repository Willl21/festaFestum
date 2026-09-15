-- 008: foto portofolio vendor bisa diunggah dari onboarding.
--
-- Tabelnya SUDAH ADA sejak schema awal (portfolio_images) dan sudah dibaca
-- getVendorDetail — yang belum ada cuma jalan untuk mengisinya, jadi tabelnya
-- selalu kosong. Ini melengkapi itu, bukan membuat tempat penyimpanan baru.
--
-- Yang ditambahkan cuma satu: indeks unik (vendor_id, sort_order). Onboarding
-- punya tiga slot tetap — 0 hero, 1, 2 — dan tanpa batasan ini, mengunggah
-- ulang Foto 2 akan MENAMBAH baris, bukan mengganti, sehingga vendor pelan-
-- pelan mengumpulkan foto hantu yang tidak bisa dihapus dari UI. Dengan indeks
-- ini, slot bisa dipakai sebagai kunci ON CONFLICT.
--
-- image_url diisi data URL, sama seperti users.avatar_url (migrasi 006):
-- proyek ini tidak punya object storage. Namanya tetap image_url karena
-- data URL memang URL, dan mengganti namanya berarti mengubah pembaca yang
-- sudah jalan.
-- ponytail: data URL di kolom TEXT. Pindah ke Supabase Storage dan simpan URL
-- aslinya di kolom yang sama kalau baris ini mulai berat dibaca.

BEGIN;

-- Membatalkan percobaan pertama: kolom gallery di vendors adalah mekanisme
-- kedua untuk hal yang sama persis. Dibuang supaya tidak ada dua sumber
-- kebenaran soal foto vendor.
ALTER TABLE vendors DROP COLUMN IF EXISTS gallery;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_slot
  ON portfolio_images (vendor_id, sort_order);

COMMIT;
