-- 016: MUA & fotografer dipesan per RENTANG JAM, bukan per hari.
--
-- KENAPA (disepakati user 25 Sep 2026). Sejak migrasi 014 jam cuma
-- keterangan, dan kapasitas harian satu-satunya pengaman bentrok. Akibatnya
-- MUA dengan satu tim hanya bisa menerima SATU pesanan sehari, walau acaranya
-- cuma 06:00-09:00 dan sorenya kosong. Untuk MUA & fotografer, yang habis
-- sebenarnya JAM tim-nya, bukan harinya.
--
-- Aturan barunya, khusus MUA & fotografer:
--   * Layanan punya durasi paket (menit). Paket MUA boleh "per orang":
--     durasinya dikali jumlah orang. Dibulatkan ke atas ke jam penuh.
--   * Pelanggan boleh menambah jam (maks 6) kalau vendor mengisi harga per
--     jam tambahan.
--   * vendors.daily_capacity untuk dua kategori ini berarti JUMLAH TIM YANG
--     BISA JALAN BERSAMAAN, bukan pesanan per hari.
--   * Tiap pesanan mengunci [mulai, selesai + jeda perjalanan) di satu tim
--     (slot_ke). Jeda diisi vendor, bawaan 60 menit.
--
-- EO, florist, dan sewa jas/kebaya TIDAK berubah: EO tetap satu tim per
-- hari, florist & sewa jas tetap per stok.
--
-- Lapis ketiga pertahanan ikut pindah primitif: indeks unik cuma bisa
-- menjamin "tidak ada dua nomor sama di satu hari", tidak bisa "tidak ada dua
-- rentang bertumpuk". Untuk itu Postgres punya EXCLUDE ... USING gist, dan
-- itulah yang dipasang di bawah — tetap atomik di level DB, tetap benar walau
-- kode aplikasinya salah.

BEGIN;

-- EXCLUDE dengan `=` pada uuid/int butuh kelas operator gist dari btree_gist.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- ------------------------------------------------------------
-- 1. Layanan: durasi paket, per orang, harga jam tambahan.
-- NULL durasi = layanan tidak berbasis jam (EO, florist, sewa jas).
-- ------------------------------------------------------------
ALTER TABLE services ADD COLUMN IF NOT EXISTS durasi_menit INT
  CHECK (durasi_menit IS NULL OR durasi_menit BETWEEN 15 AND 1440);
ALTER TABLE services ADD COLUMN IF NOT EXISTS per_orang BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS harga_per_jam_tambahan NUMERIC(12,2)
  CHECK (harga_per_jam_tambahan IS NULL OR harga_per_jam_tambahan >= 0);

-- Backfill dari teks bebas details.durasi yang sudah ada sejak migrasi 012.
-- "45 menit per orang" / "30-40 menit per orang" -> per orang, angka terbesar.
-- "3-4 jam" / "12 jam"                            -> jam, angka terbesar.
-- Selain itu ("Sejak pagi sampai acara selesai", kosong) -> bawaan kategori.
WITH baca AS (
  SELECT service_id, category,
         regexp_match(details->>'durasi', '(\d+)(?:\s*-\s*(\d+))?\s*menit\s+per\s+orang', 'i') AS m,
         regexp_match(details->>'durasi', '(\d+)(?:\s*-\s*(\d+))?\s*jam', 'i') AS j
    FROM services
   WHERE category IN ('makeup_artist', 'photographer') AND durasi_menit IS NULL
)
UPDATE services s
   SET per_orang = (b.m IS NOT NULL),
       durasi_menit = CASE
         WHEN b.m IS NOT NULL THEN COALESCE(b.m[2], b.m[1])::int
         WHEN b.j IS NOT NULL THEN COALESCE(b.j[2], b.j[1])::int * 60
         WHEN b.category = 'makeup_artist' AND s.details->>'durasi' ILIKE '%sampai acara selesai%' THEN 480
         WHEN b.category = 'makeup_artist' THEN 180
         ELSE 240
       END
  FROM baca b
 WHERE b.service_id = s.service_id;

-- Harga jam tambahan untuk data seed: kira-kira harga paket dibagi jam
-- paketnya, dibulatkan ke 50 ribu, minimal 100 ribu. Paket per orang tidak
-- diberi jam tambahan — harganya per kepala, bukan per jam.
UPDATE services
   SET harga_per_jam_tambahan = GREATEST(
         100000, round(price / GREATEST(durasi_menit / 60.0, 1) / 50000) * 50000)
 WHERE category IN ('makeup_artist', 'photographer')
   AND durasi_menit IS NOT NULL AND NOT per_orang
   AND harga_per_jam_tambahan IS NULL;

-- ------------------------------------------------------------
-- 2. Vendor: jeda perjalanan antar-pesanan. Diisi vendor sendiri.
-- ------------------------------------------------------------
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS jeda_menit INT NOT NULL DEFAULT 60
  CHECK (jeda_menit BETWEEN 0 AND 480);

-- ------------------------------------------------------------
-- 3. Pesanan: salinan durasi & jeda saat memesan, lalu rentang kuncinya.
--
-- DISALIN, bukan dibaca ulang dari layanan/vendor: kalau vendor nanti
-- mengubah paket atau jedanya, pesanan yang sudah ada tidak boleh ikut
-- memanjang dan tiba-tiba bertabrakan dengan pesanan lain.
--
-- durasi_menit di sini = durasi TOTAL yang dipesan (paket x orang, dibulatkan
-- ke jam, + jam tambahan), TANPA jeda. Jeda cuma ikut di rentang kunci — dia
-- waktu tim di jalan, bukan waktu yang dibayar pelanggan.
-- ------------------------------------------------------------
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS durasi_menit INT
  CHECK (durasi_menit IS NULL OR durasi_menit > 0);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS jam_tambahan INT NOT NULL DEFAULT 0
  CHECK (jam_tambahan BETWEEN 0 AND 6);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS jeda_menit INT NOT NULL DEFAULT 0
  CHECK (jeda_menit >= 0);

UPDATE bookings b
   SET durasi_menit = ceil(
         s.durasi_menit * CASE WHEN s.per_orang THEN b.quantity ELSE 1 END / 60.0
       )::int * 60,
       jeda_menit = v.jeda_menit
  FROM services s, vendors v
 WHERE s.service_id = b.service_id AND v.vendor_id = b.vendor_id
   AND s.durasi_menit IS NOT NULL AND b.durasi_menit IS NULL;

-- Diturunkan DB sendiri supaya tidak mungkin tidak sinkron dengan kolom
-- asalnya. Boleh melewati tengah malam (last order 20:00 + 6 jam).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rentang tsrange
  GENERATED ALWAYS AS (
    CASE WHEN durasi_menit IS NULL THEN NULL
         ELSE tsrange(event_date + start_time,
                      event_date + start_time + (durasi_menit + jeda_menit) * interval '1 minute')
    END
  ) STORED;

-- ------------------------------------------------------------
-- 4. Lapis ketiga: nomor slot per HARI (014) hanya untuk yang tidak berbasis
-- jam, rentang tidak boleh bertumpuk untuk yang berbasis jam.
-- ------------------------------------------------------------
DROP INDEX IF EXISTS idx_booking_slot_ke_aktif;
CREATE UNIQUE INDEX idx_booking_slot_ke_aktif
  ON bookings (vendor_id, event_date, slot_ke)
  WHERE payment_status NOT IN ('cancelled', 'expired') AND per_tim AND durasi_menit IS NULL;

-- Pagar: pesanan aktif lama yang ternyata bertumpuk (mis. lewat tengah malam
-- ke pesanan hari berikutnya) disebutkan jelas, bukan sekadar pesan error
-- constraint yang membingungkan.
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n
    FROM bookings a JOIN bookings b
      ON a.vendor_id = b.vendor_id AND a.slot_ke = b.slot_ke
     AND a.booking_id < b.booking_id AND a.rentang && b.rentang
   WHERE a.payment_status NOT IN ('cancelled', 'expired')
     AND b.payment_status NOT IN ('cancelled', 'expired');
  IF n > 0 THEN
    RAISE EXCEPTION 'Ada % pasang pesanan aktif yang jamnya bertumpuk. Migrasi dibatalkan.', n;
  END IF;
END $$;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_rentang_tidak_bertumpuk;
ALTER TABLE bookings ADD CONSTRAINT bookings_rentang_tidak_bertumpuk
  EXCLUDE USING gist (vendor_id WITH =, slot_ke WITH =, rentang WITH &&)
  WHERE (rentang IS NOT NULL AND payment_status NOT IN ('cancelled', 'expired'));

COMMIT;
