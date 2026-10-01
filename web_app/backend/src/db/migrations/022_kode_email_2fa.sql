-- 022: kode 6 digit via email — lupa sandi & verifikasi dua langkah (1 Okt 2026).
--
-- Satu tabel untuk semua kode sekali pakai, dibedakan `tujuan`:
--   reset_sandi    — POST /auth/lupa-sandi -> /auth/reset-sandi
--   login          — langkah kedua masuk untuk akun ber-2FA (dan SEMUA admin)
--   aktifkan_2fa   — membuktikan emailnya memang menerima kode SEBELUM 2FA
--                    menyala; tanpa ini akun dengan email mati langsung terkunci
--
-- Kodenya tidak pernah disimpan polos: kode_hash = sha256(JWT_SECRET + kode).
-- Ruang kodenya cuma sejuta, jadi yang menjaga sebenarnya batas percobaan
-- (5 per kode) + umur pendek (10 menit), bukan hash-nya.
--
-- users.sesi_sejak: token yang terbit SEBELUM waktu ini ditolak requireAuth.
-- Diisi saat reset sandi, ganti sandi, dan menyalakan 2FA — "keluarkan semua
-- perangkat lain". NULL = belum pernah dicabut.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS dua_langkah BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sesi_sejak  TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS kode_otp (
  kode_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  tujuan       TEXT NOT NULL CHECK (tujuan IN ('reset_sandi', 'login', 'aktifkan_2fa')),
  kode_hash    TEXT NOT NULL,
  percobaan    INT  NOT NULL DEFAULT 0,
  kedaluwarsa  TIMESTAMPTZ NOT NULL,
  dipakai_at   TIMESTAMPTZ,
  dibuat_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kode_otp_user ON kode_otp (user_id, tujuan, dibuat_at DESC);

-- RLS menyala di semua tabel lain (0 policy; backend lewat koneksi langsung).
ALTER TABLE kode_otp ENABLE ROW LEVEL SECURITY;

COMMIT;
