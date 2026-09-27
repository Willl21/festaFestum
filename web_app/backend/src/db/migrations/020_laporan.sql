-- 020: pengajuan refund & laporan vendor (revisi PM, 26 Sep 2026).
--
-- Tombol "Refund/Laporkan Vendor" di Pesanan Saya. Klien mengajukan, admin
-- memutuskan di Pusat Escrow & Penyelesaian — pola yang sama dengan payout.
--
-- Uang TIDAK benar-benar dikembalikan lewat gateway (refund Midtrans di luar
-- lingkup sandbox). Refund yang disetujui menandai pembayaran pesanan itu
-- 'refunded' — nilai yang sudah ada di enum payment_status sejak skema awal —
-- sehingga otomatis keluar dari saldo & escrow vendor (lib/saldo.js cuma
-- menghitung 'success'), dan pesanannya 'cancelled' supaya slotnya lepas.
-- Laporan tanpa refund cuma dicatat + diputuskan; sanksinya urusan admin.

BEGIN;

CREATE TABLE IF NOT EXISTS laporan (
  laporan_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  jenis          TEXT NOT NULL CHECK (jenis IN ('refund', 'laporan')),
  alasan         TEXT NOT NULL CHECK (length(btrim(alasan)) BETWEEN 10 AND 1000),
  status         TEXT NOT NULL DEFAULT 'menunggu'
                   CHECK (status IN ('menunggu', 'disetujui', 'ditolak')),
  catatan_admin  TEXT,
  dibuat_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  diputuskan_at  TIMESTAMPTZ,
  diputuskan_oleh UUID REFERENCES users(user_id) ON DELETE SET NULL
);

-- Satu pengajuan yang masih menunggu per pesanan. Sesudah diputuskan boleh
-- mengajukan lagi (mis. laporan ditolak, lalu ada bukti baru).
CREATE UNIQUE INDEX IF NOT EXISTS idx_laporan_satu_menunggu
  ON laporan (booking_id) WHERE status = 'menunggu';

CREATE INDEX IF NOT EXISTS idx_laporan_status ON laporan (status, dibuat_at DESC);

ALTER TABLE laporan ENABLE ROW LEVEL SECURITY;

COMMIT;
