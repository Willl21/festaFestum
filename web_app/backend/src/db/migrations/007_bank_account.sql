-- 007: rekening bank tujuan pengembalian dana.
--
-- Bagian 03 di mockup halaman profil ("Rekening Bank & Pengembalian Dana")
-- tidak punya kolomnya sama sekali — dulu bagian itu sengaja tidak dibuat.
--
-- Satu rekening per user, bukan tabel sendiri: yang dipakai cuma satu tujuan
-- transfer, dan tabel terpisah berarti ikut memikirkan mana yang "utama",
-- riwayat, dan penghapusan — semuanya belum ada yang minta.
-- ponytail: satu rekening per user. Pindah ke tabel bank_accounts kalau nanti
-- perlu lebih dari satu atau butuh riwayat penggantian.
--
-- Kolomnya juga menutup lubang di 005: payout disetujui admin tapi tidak ada
-- satu pun tempat yang menyimpan ke mana uangnya ditransfer. Vendor adalah
-- user juga, jadi rekening ini yang dibaca.
--
-- Nomor rekening disimpan apa adanya (bukan hash): nomornya harus bisa dibaca
-- ulang saat admin melakukan transfer manual, jadi hash tidak ada gunanya.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bank_name           VARCHAR(30),
  ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bank_account_holder VARCHAR(60);

COMMIT;
