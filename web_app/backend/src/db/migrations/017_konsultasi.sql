-- 017: konsultasi sebelum memesan (detail EO, "Mulai Rencanakan Acara Anda").
--
-- KENAPA. Form konsultasi di halaman detail EO selama ini mati — onSubmit-nya
-- cuma preventDefault. Alur yang disepakati user (25 Sep 2026):
--   klien isi form -> ruang chat konsultasi dengan vendor -> diskusi ->
--   vendor mengirim REKOMENDASI PAKET di chat -> klien memesan paket itu ->
--   vendor tetap harus MENERIMA pesanannya (alur konfirmasi yang sudah ada).
--
-- Tiga tambahan, semuanya menempel ke tabel yang sudah ada:
--
-- 1. conversations.jenis = 'konsultasi' — klien + vendor TANPA pesanan. Obrolan
--    'klien_vendor' dari migrasi 015 wajib terikat ke satu pesanan, jadi
--    diskusi sebelum memesan memang belum punya tempat. Satu ruang per
--    pasangan klien-vendor: mengirim form dua kali melanjutkan ruang yang sama.
--
-- 2. messages.service_id — pesan yang merupakan rekomendasi paket. NULL untuk
--    pesan biasa. SET NULL kalau layanannya dihapus permanen: riwayat
--    obrolannya tetap ada, cuma kartunya kehilangan paket.
--
-- 3. bookings.konsultasi_id — pesanan yang lahir dari konsultasi. Arahnya dari
--    PESANAN ke ruang, bukan conversations.booking_id, karena satu ruang
--    konsultasi boleh melahirkan lebih dari satu pesanan (klien memesan dua
--    paket). Obrolan pesanan itu lalu tetap di ruang konsultasi — tidak ada
--    ruang kedua untuk urusan yang sama.

BEGIN;

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_jenis_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_jenis_check
  CHECK (jenis IN ('klien_vendor', 'admin_klien', 'admin_vendor', 'konsultasi'));

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS bentuk_percakapan_sah;
ALTER TABLE conversations ADD CONSTRAINT bentuk_percakapan_sah CHECK (
  (jenis = 'klien_vendor' AND user_id IS NOT NULL AND vendor_id IS NOT NULL AND booking_id IS NOT NULL)
  OR (jenis = 'admin_klien' AND user_id IS NOT NULL AND vendor_id IS NULL AND booking_id IS NULL)
  OR (jenis = 'admin_vendor' AND vendor_id IS NOT NULL AND user_id IS NULL AND booking_id IS NULL)
  OR (jenis = 'konsultasi' AND user_id IS NOT NULL AND vendor_id IS NOT NULL AND booking_id IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_konsultasi ON conversations (user_id, vendor_id)
  WHERE jenis = 'konsultasi';

ALTER TABLE messages ADD COLUMN IF NOT EXISTS service_id UUID
  REFERENCES services(service_id) ON DELETE SET NULL;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS konsultasi_id UUID
  REFERENCES conversations(conversation_id) ON DELETE SET NULL;

COMMIT;
