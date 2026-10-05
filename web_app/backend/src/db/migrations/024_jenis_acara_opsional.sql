-- 024: jenis acara di pesanan jadi opsional (5 Okt 2026).
--
-- Form "Lengkapi Detail Pesanan" tidak lagi menanyakan jenis acara: user
-- menilai pilihan layanan sudah cukup menjelaskan pesanannya, dan kolom ini
-- tidak dipakai logika apa pun (cuma ditampilkan ke vendor & di invoice).
-- Pesanan dari Festa AI tetap mengisinya karena form AI memang menanyakannya.
-- Pesanan baru tanpa jenis acara disimpan NULL, bukan ditebak.

BEGIN;

ALTER TABLE bookings ALTER COLUMN event_type DROP NOT NULL;

COMMIT;
