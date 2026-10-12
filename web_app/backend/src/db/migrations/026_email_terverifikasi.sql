-- Migrasi 026 — penanda "pemilik akun pernah membuktikan memegang emailnya"
-- (audit keamanan 12 Okt 2026).
--
-- Celahnya: daftar dengan email tidak memverifikasi email. Penyerang bisa
-- mendaftar korban@gmail.com dengan sandinya sendiri; saat korban kelak
-- "Masuk dengan Google", ia masuk ke akun buatan penyerang yang sandinya masih
-- dipegang penyerang. Login Google ke akun yang belum terverifikasi kini
-- mengganti sandinya dulu (googleLogin), dan kolom ini yang menandai bedanya.
--
-- TRUE begitu pemilik membuktikan email: login Google, kode OTP login,
-- reset sandi, atau menyalakan 2FA.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_terverifikasi BOOLEAN NOT NULL DEFAULT FALSE;

-- Akun yang lahir dari login Google (nomor HP kosong, lihat googleLogin)
-- sudah dibuktikan Google sejak awal.
UPDATE users SET email_terverifikasi = TRUE WHERE phone = '';
