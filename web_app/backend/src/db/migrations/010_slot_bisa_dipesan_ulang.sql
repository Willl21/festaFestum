-- 010: slot dari pesanan yang batal harus bisa dipesan lagi.
--
-- BUG LAMA, ketahuan waktu menguji penolakan vendor (migrasi 009).
--
-- bookings punya UNIQUE (schedule_id) sebagai lapis ketiga pertahanan
-- conflict-free booking. Masalahnya batasan itu tidak mengenal waktu: baris
-- booking yang sudah 'cancelled' atau 'expired' tetap memegang schedule_id-nya
-- selamanya, jadi slot itu tidak akan pernah bisa dipesan lagi oleh siapa pun.
--
-- Akibatnya bukan cuma pada fitur baru. expireStaleBookings sudah sejak lama
-- mengembalikan vendor_schedules ke 'available' setelah 24 jam tanpa DP —
-- slotnya terlihat kosong di kalender, tapi setiap percobaan memesannya
-- ditolak 500 oleh constraint ini. Vendor kehilangan slot itu diam-diam.
--
-- Perbaikannya: batasannya dipersempit jadi hanya berlaku untuk pesanan yang
-- MASIH HIDUP. Ini tetap indeks unik di level DB, jadi lapis ketiganya utuh —
-- yang berubah cuma cakupannya, dari "selamanya" jadi "selama pesanannya
-- belum batal".

BEGIN;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_schedule_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_slot_aktif
  ON bookings (schedule_id)
  WHERE payment_status NOT IN ('cancelled', 'expired');

COMMIT;
