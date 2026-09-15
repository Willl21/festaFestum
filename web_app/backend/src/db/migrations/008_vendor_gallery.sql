-- 008: foto portofolio vendor.
--
-- Kotak unggah di langkah 3 onboarding selama ini tampil mati karena tidak ada
-- tempat menyimpannya. Ini kolomnya.
--
-- TEXT[], bukan tiga kolom photo_1..photo_3: urutannya bermakna (elemen
-- pertama = hero) dan jumlahnya bisa berubah tanpa migrasi baru. Bukan tabel
-- sendiri juga — tabel terpisah berarti ikut memikirkan urutan, penghapusan,
-- dan foto yatim, padahal yang dibutuhkan cuma daftar pendek milik satu vendor.
--
-- Isinya data URL, sama seperti users.avatar_url (migrasi 006): proyek ini
-- tidak punya object storage. Batas ukurannya dijaga di controller.
-- ponytail: data URL di DB. Baris vendors jadi berat dibaca kalau galerinya
-- penuh — pindah ke Supabase Storage dan simpan URL-nya di kolom yang sama
-- kalau sudah mulai terasa.

BEGIN;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS gallery TEXT[] NOT NULL DEFAULT '{}';

COMMIT;
