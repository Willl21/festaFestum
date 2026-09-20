-- 013: ketersediaan dibalik + kapasitas harian menggantikan kategori eksklusif.
--
-- DUA aturan baru:
--   1. Tidak ada baris vendor_schedules = vendor TERSEDIA. Tabel itu sekarang
--      menyimpan HANYA penutupan yang dibuat vendor. Sebelumnya kebalikannya,
--      sehingga 1.348 dari 1.353 barisnya cuma berisi kata 'available' — dan
--      vendor baru lahir dalam keadaan tidak bisa dipesan sampai dia membuka
--      slotnya satu per satu.
--   2. vendors.daily_capacity menggantikan EKSKLUSIF_HARIAN di lib/kategori.js.
--      "Mengunci satu tanggal penuh" ternyata cuma kapasitas = 1, jadi lima
--      kategori tidak lagi butuh dua cabang logika, cukup satu angka.
--
-- KENAPA tanggal pindah ke bookings: begitu florist boleh punya beberapa
-- pesanan di tanggal+shift yang sama, satu baris jadwal tidak bisa lagi
-- mewakili satu pesanan. Padahal event_date selama ini HANYA hidup di
-- vendor_schedules. Jadi tanggal, shift, dan vendor didenormalisasi ke
-- bookings — dan ±20 query yang selama ini nge-join cuma untuk mengambil
-- event_date jadi lebih pendek.
--
-- SEARAH. Migrasi ini menghapus baris dan membuang kolom; membaliknya berarti
-- membangkitkan ulang ketersediaan tiap vendor. Commit dulu sebelum jalan.

BEGIN;

-- ------------------------------------------------------------
-- 1. Kapasitas harian, nempel di VENDOR bukan di layanan.
--
-- Di layanan akan bocor: MUA dengan 2 kru dan 3 paket mengisi "2" di ketiga
-- paketnya, lalu menerima 2 pesanan paket A + 2 paket B = 4 acara sehari.
-- Yang habis itu krunya, dan kru milik vendor. Untuk florist angkanya jadi
-- lebih kasar (total per hari, bukan per produk) tapi tetap benar.
-- ponytail: satu angka per vendor. Kalau florist nanti benar-benar butuh
-- presisi per produk, tambah services.daily_capacity yang NULL = ikut vendor.
-- ------------------------------------------------------------
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS daily_capacity INT NOT NULL DEFAULT 1;
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_daily_capacity_check;
ALTER TABLE vendors ADD CONSTRAINT vendors_daily_capacity_check CHECK (daily_capacity >= 1);

-- Florist & sewa jas/kebaya: yang habis stok barang, bukan waktu orangnya.
-- 10 itu angka awal yang bisa diubah vendor sendiri, bukan hasil riset.
UPDATE vendors v SET daily_capacity = 10
 WHERE EXISTS (
   SELECT 1 FROM services s
    WHERE s.vendor_id = v.vendor_id
      AND s.category IN ('florist', 'attire_rental')
 );

-- ------------------------------------------------------------
-- 2. bookings memegang sendiri waktu & vendornya.
-- ------------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_quantity_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_quantity_check CHECK (quantity >= 1);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(vendor_id) ON DELETE RESTRICT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS event_date DATE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS time_slot time_slot;

-- kunci_shift memikul DUA tugas sekaligus: menentukan indeks unik per shift
-- berlaku atau tidak, DAN menentukan kapasitas dipotong COUNT(pesanan) atau
-- SUM(quantity). Untuk kelima kategori yang ada, keduanya selalu bernilai
-- sama — MUA yang merias 5 orang tetap memakai 1 kru, florist yang menjual
-- 5 buket memang memotong 5 stok.
-- ponytail: satu flag dua tugas. Pecah jadi dua kolom kalau nanti ada
-- kategori yang mengunci shift tapi dihitung per unit.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS kunci_shift BOOLEAN;

UPDATE bookings b
   SET vendor_id   = s.vendor_id,
       event_date  = vs.event_date,
       time_slot   = vs.time_slot,
       kunci_shift = (s.category IN ('event_organizer', 'makeup_artist', 'photographer'))
  FROM services s, vendor_schedules vs
 WHERE s.service_id = b.service_id
   AND vs.schedule_id = b.schedule_id;

-- Pagar: kalau ada satu saja pesanan yang tidak kebagian tanggal, seluruh
-- migrasi dibatalkan. Lebih baik gagal di sini daripada baru ketahuan waktu
-- vendor_schedules sudah dihapus dan tanggalnya hilang selamanya.
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM bookings
   WHERE vendor_id IS NULL OR event_date IS NULL OR time_slot IS NULL OR kunci_shift IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Backfill gagal: % pesanan tanpa tanggal/vendor. Migrasi dibatalkan.', n;
  END IF;
END $$;

ALTER TABLE bookings ALTER COLUMN vendor_id   SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN event_date  SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN time_slot   SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN kunci_shift SET NOT NULL;

-- ------------------------------------------------------------
-- 3. Lapis ketiga pertahanan pindah alamat, bukan hilang.
--
-- Dulu: UNIQUE (schedule_id) untuk pesanan aktif — satu slot satu pesanan,
-- berlaku untuk SEMUA kategori. Itu yang menghalangi florist menerima
-- beberapa pesanan sehari.
-- Sekarang: kunci yang sama, tapi hanya untuk kategori yang memang mengunci
-- shift. Florist lolos dari indeks ini dan dijaga kapasitas.
-- ------------------------------------------------------------
DROP INDEX IF EXISTS idx_booking_slot_aktif;

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_shift_aktif
  ON bookings (vendor_id, event_date, time_slot)
  WHERE payment_status NOT IN ('cancelled', 'expired') AND kunci_shift;

-- Dibaca tiap kali kapasitas dihitung, di dalam advisory lock.
CREATE INDEX IF NOT EXISTS idx_booking_kapasitas
  ON bookings (vendor_id, event_date)
  WHERE payment_status NOT IN ('cancelled', 'expired');

-- schedule_id dibuang, bukan dibiarkan NULL selamanya: semua informasinya
-- sudah pindah ke tiga kolom di atas. Dibuang juga berarti setiap kode lama
-- yang masih memakainya GAGAL KERAS, bukan diam-diam membaca NULL.
ALTER TABLE bookings DROP COLUMN IF EXISTS schedule_id;

-- ------------------------------------------------------------
-- 4. vendor_schedules jadi tabel penutupan.
--
-- FK dari bookings sudah lepas di langkah 3, jadi ON DELETE RESTRICT tidak
-- lagi menghalangi. 'available' tidak pernah disimpan lagi; 'held' dan
-- 'booked' tidak perlu karena status pesanan sudah jadi sumber kebenarannya.
-- ------------------------------------------------------------
DELETE FROM vendor_schedules;

ALTER TABLE vendor_schedules DROP CONSTRAINT IF EXISTS vendor_schedules_hanya_penutupan;
ALTER TABLE vendor_schedules ADD CONSTRAINT vendor_schedules_hanya_penutupan
  CHECK (status = 'blocked');

COMMIT;
