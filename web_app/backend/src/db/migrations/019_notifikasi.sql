-- 019: notifikasi di lonceng (revisi PM, 26 Sep 2026).
--
-- Lonceng di header vendor & navbar klien selama ini cuma hiasan. Tiap
-- kejadian penting (pesanan baru, diterima/ditolak, pembayaran masuk, payout
-- diputuskan, laporan) menulis satu baris di sini, DI DALAM transaksi yang
-- sama dengan kejadiannya — tidak ada notifikasi untuk perubahan yang batal.
--
-- Satu tabel per PENERIMA (user_id), bukan per peran: vendor dan klien sama-
-- sama akun di tabel users, jadi satu endpoint melayani keduanya.
-- `tautan` = path frontend tujuan klik, mis. '/pesanan-saya'.

BEGIN;

CREATE TABLE IF NOT EXISTS notifikasi (
  notifikasi_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  judul         TEXT NOT NULL CHECK (length(judul) BETWEEN 1 AND 120),
  isi           TEXT NOT NULL CHECK (length(isi) <= 500),
  tautan        TEXT,
  dibaca        BOOLEAN NOT NULL DEFAULT FALSE,
  dibuat_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifikasi_user ON notifikasi (user_id, dibuat_at DESC);

ALTER TABLE notifikasi ENABLE ROW LEVEL SECURITY;

COMMIT;
