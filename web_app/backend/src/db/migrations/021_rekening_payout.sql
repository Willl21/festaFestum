-- 021: salinan rekening tujuan di tiap pengajuan pencairan (1 Okt 2026).
--
-- Sampai 020, admin yang menyetujui payout tidak melihat rekening tujuan sama
-- sekali, dan vendor boleh mengajukan tanpa rekening. Rekeningnya sendiri
-- sudah ada di users sejak 007; yang ditambahkan di sini SALINANNYA, diambil
-- saat vendor mengajukan:
--   - vendor yang mengganti rekening sesudah mengajukan tidak membelokkan
--     pengajuan yang sudah antre,
--   - riwayat tetap mencatat ke rekening mana uangnya ditransfer.
--
-- Baris lama (sebelum migrasi ini) dibiarkan NULL — admin melihat rekening
-- vendor saat ini sebagai gantinya, ditandai begitu di layar.

BEGIN;

ALTER TABLE payouts
  ADD COLUMN IF NOT EXISTS bank_name           VARCHAR(30),
  ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bank_account_holder VARCHAR(60);

-- Setengah terisi tidak bisa ditransfer ke mana-mana: ketiganya ada, atau
-- ketiganya kosong (baris lama).
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_rekening_utuh;
ALTER TABLE payouts ADD CONSTRAINT payouts_rekening_utuh CHECK (
  (bank_name IS NULL) = (bank_account_number IS NULL)
  AND (bank_name IS NULL) = (bank_account_holder IS NULL)
);

COMMIT;
