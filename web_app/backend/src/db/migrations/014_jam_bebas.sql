-- 014: shift dibuang, diganti jam bebas. Kapasitas harian jadi SATU-SATUNYA
-- mekanisme anti-bentrok.
--
-- KENAPA. Sesudah migrasi 013 shift tinggal memikul satu tugas: indeks unik
-- per (vendor, tanggal, shift) untuk kategori kunci_shift. Tugas itu ternyata
--   * MUBAZIR untuk vendor daily_capacity = 1 — kapasitas sudah menolak
--     duluan, indeksnya tidak pernah menolak apa pun yang belum ditolak;
--   * SALAH untuk vendor daily_capacity > 1 — MUA berkapasitas 3 dengan 3 kru
--     tetap tidak bisa menerima dua pesanan di shift yang sama, padahal
--     ketiga krunya bisa di tiga tempat sekaligus. Menaikkan kapasitas itu
--     fitur yang sengaja dibuka di migrasi 013, jadi dua bagian dari
--     keputusan yang sama saling bertabrakan.
--
-- Lagi pula jam tiap shift (08-12 / 12-16 / 16-22) itu KARANGAN kita, bukan
-- angka dari PM, dan kelima mockup "Isi data diri" memang meminta WAKTU MULAI
-- sebagai input bebas — bukan tiga pilihan.
--
-- Jadi waktu turun pangkat: dari kunci penjadwalan jadi keterangan biasa.
-- Untuk florist & sewa jas dia jam kirim, untuk EO/MUA/fotografer jam mulai
-- acara. Tidak ada satu pun query yang memakainya untuk memutuskan bentrok.
--
-- SEARAH. Membalikkannya berarti menebak shift dari jam, dan jam yang
-- dimasukkan customer sesudah migrasi ini tidak selalu jatuh rapi ke salah
-- satu dari tiga kotak lama.

BEGIN;

-- ------------------------------------------------------------
-- 1. Jam acara menggantikan shift di bookings.
--
-- Backfill memakai jam MULAI tiap shift lama. Ini menggeser makna sedikit —
-- "pagi" itu rentang 08-12, bukan tepat 08:00 — tapi lima pesanan yang ada
-- semuanya belum jalan, dan tidak ada cara lebih tepat tanpa bertanya ke
-- pemesannya satu per satu.
-- ------------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_time TIME;

UPDATE bookings SET start_time = CASE time_slot
  WHEN 'pagi'  THEN TIME '08:00'
  WHEN 'siang' THEN TIME '12:00'
  WHEN 'malam' THEN TIME '16:00'
END
WHERE start_time IS NULL;

-- Pagar: lebih baik gagal di sini daripada sesudah time_slot dibuang dan
-- jamnya hilang selamanya.
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM bookings WHERE start_time IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Backfill gagal: % pesanan tanpa start_time. Migrasi dibatalkan.', n;
  END IF;
END $$;

ALTER TABLE bookings ALTER COLUMN start_time SET NOT NULL;

-- ------------------------------------------------------------
-- 2. kunci_shift -> per_tim.
--
-- Kolomnya dulu memikul dua tugas (lihat migrasi 013): menandai shift
-- eksklusif, DAN menentukan kapasitas dipotong per pesanan atau per unit.
-- Tugas pertama hilang bersama shift; yang tersisa cuma yang kedua, dan
-- nama lamanya jadi berbohong.
-- ------------------------------------------------------------
ALTER TABLE bookings RENAME COLUMN kunci_shift TO per_tim;

-- ------------------------------------------------------------
-- 3. Penutupan vendor jadi per TANGGAL, bukan per shift.
--
-- Baris kembar diringkas dulu: vendor yang dulu menutup dua shift di satu
-- tanggal sekarang punya satu baris. Ini MELEBARKAN arti penutupan lama —
-- menutup shift pagi saja jadi menutup satu hari penuh. Disengaja: tanpa
-- shift tidak ada lagi bagian hari yang bisa ditutup sendirian, dan menutup
-- terlalu banyak jauh lebih aman daripada menerima pesanan yang tidak bisa
-- dilayani.
-- ------------------------------------------------------------
DELETE FROM vendor_schedules a
 USING vendor_schedules b
 WHERE a.vendor_id = b.vendor_id
   AND a.event_date = b.event_date
   AND a.schedule_id > b.schedule_id;

DROP INDEX IF EXISTS idx_schedules_search;
ALTER TABLE vendor_schedules DROP CONSTRAINT IF EXISTS vendor_schedules_vendor_id_event_date_time_slot_key;
ALTER TABLE vendor_schedules DROP COLUMN IF EXISTS time_slot;
ALTER TABLE vendor_schedules ADD CONSTRAINT vendor_schedules_vendor_tanggal_key
  UNIQUE (vendor_id, event_date);

-- ------------------------------------------------------------
-- 4. Lapis ketiga pertahanan: shift diganti NOMOR URUT slot.
--
-- Indeks unik cuma bisa menjamin "paling banyak SATU", tidak bisa
-- "paling banyak N". Memindahkannya begitu saja ke (vendor, tanggal) akan
-- MENGULANG bug yang migrasi ini perbaiki: vendor per_tim berkapasitas 3
-- kembali cuma boleh satu pesanan sehari.
--
-- Yang dulu dilakukan shift, sebenarnya, adalah menomori slot: tiga kotak
-- per hari, kebetulan diberi label jam. Jadi labelnya dibuang, penomorannya
-- disimpan. slot_ke diisi aplikasi di dalam pg_advisory_xact_lock dengan
-- angka bebas terkecil di [0, daily_capacity).
--
-- Pembagian tugasnya jadi jelas:
--   indeks unik  -> tidak ada dua pesanan memegang nomor yang sama (atomik,
--                   tetap benar walau kode di atasnya salah)
--   aplikasi     -> nomor yang diberikan selalu < daily_capacity
--
-- Untuk kapasitas 1, slot_ke selalu 0 dan jaminannya sama persis dengan
-- sebelumnya. Florist & sewa jas tetap di luar indeks ini seperti sebelumnya
-- (kapasitasnya per unit, bukan per pesanan) — penjaganya advisory lock.
-- ------------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS slot_ke INT;

-- Pesanan lama dinomori ulang per (vendor, tanggal). Urutan waktu dibuat,
-- supaya yang memesan duluan dapat nomor kecil.
WITH urut AS (
  SELECT booking_id,
         row_number() OVER (PARTITION BY vendor_id, event_date
                                ORDER BY created_at, booking_id) - 1 AS n
    FROM bookings
   WHERE per_tim AND payment_status NOT IN ('cancelled', 'expired')
)
UPDATE bookings b SET slot_ke = urut.n FROM urut WHERE urut.booking_id = b.booking_id;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_slot_ke_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_slot_ke_check
  CHECK (slot_ke IS NULL OR slot_ke >= 0);

DROP INDEX IF EXISTS idx_booking_shift_aktif;

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_slot_ke_aktif
  ON bookings (vendor_id, event_date, slot_ke)
  WHERE payment_status NOT IN ('cancelled', 'expired') AND per_tim;

-- ------------------------------------------------------------
-- 5. time_slot dibuang beserta enum-nya.
--
-- Dibuang, bukan dibiarkan: kode lama yang masih memakainya harus GAGAL
-- KERAS, bukan diam-diam membaca kolom yang tidak pernah diisi lagi.
-- ------------------------------------------------------------
ALTER TABLE bookings DROP COLUMN IF EXISTS time_slot;
DROP TYPE IF EXISTS time_slot;

COMMIT;
