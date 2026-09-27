-- 018: florist memesan tanpa jam (revisi PM, 26 Sep 2026).
--
-- Di florist jam tidak pernah mengunci apa pun (kapasitasnya harian, per
-- stok), jadi PM minta pilihannya dibuang dari form. Daripada menyimpan jam
-- karangan yang lalu tampil di invoice, kolomnya boleh NULL.
--
-- CHECK-nya menjaga yang penting: pesanan berbasis jam (MUA & fotografer,
-- durasi_menit terisi) TETAP wajib punya jam — kolom `rentang` dan constraint
-- EXCLUDE dari migrasi 016 dihitung dari situ.

BEGIN;

ALTER TABLE bookings ALTER COLUMN start_time DROP NOT NULL;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS jam_wajib_untuk_berbasis_jam;
ALTER TABLE bookings ADD CONSTRAINT jam_wajib_untuk_berbasis_jam
  CHECK (start_time IS NOT NULL OR durasi_menit IS NULL);

COMMIT;
