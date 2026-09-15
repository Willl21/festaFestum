-- 006: verifikasi akun pengguna + foto profil.
--
-- Mockup halaman profil menampilkan badge "Pengguna Terverifikasi" dan foto
-- profil, tapi tabel users tidak punya penandanya. Tanpa kolom ini badge itu
-- cuma hiasan yang selalu menyala — menyesatkan saat demo.
--
-- Alurnya menumpang kurasi yang sudah ada: admin yang memutuskan dari Pusat
-- Kendali, sama seperti verifikasi vendor (lihat 004). Tidak ada kirim email
-- atau OTP SMS — dua-duanya butuh layanan pihak ketiga yang di luar lingkup
-- lomba.
-- ponytail: keputusan terakhir saja, tanpa riwayat. Kalau nanti butuh
-- verifikasi mandiri lewat email, tambah kolom token + kedaluwarsa.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url  TEXT,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(user_id) ON DELETE SET NULL;

COMMIT;
