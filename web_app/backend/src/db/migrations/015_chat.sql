-- 015: obrolan. Tiga mockup (chat user, portal vendor, pusat kendali admin)
-- ternyata satu fitur dilihat dari tiga sisi, jadi tabelnya juga satu pasang.
--
-- Kenapa ada tabel percakapan, bukan messages berkolom booking_id saja:
-- dua dari tiga jenis obrolan TIDAK punya pesanan. Vendor mengeluh ke admin
-- dan klien bertanya ke admin di luar konteks pesanan mana pun, jadi
-- booking_id tidak bisa jadi kunci percakapan.
--
-- Jenisnya sebenarnya bisa diturunkan dari kolom mana yang NULL, tapi ditulis
-- eksplisit supaya daftar percakapan bisa disaring lewat satu indeks dan
-- supaya query-nya terbaca. Tiga bentuk yang sah dijaga CHECK:
--   klien_vendor : user + vendor + booking  (obrolan per pesanan)
--   admin_klien  : user saja                (tiket dari klien)
--   admin_vendor : vendor saja              (tiket dari vendor)
-- Semua admin berbagi satu sisi percakapan — tidak ada penugasan ke admin
-- tertentu, seperti halaman kurasi vendor yang juga tidak punya pemilik.
--
-- ponytail: tanpa lampiran berkas, tanpa websocket. Mockup memajang klip
-- kertas dan "Tersinkronisasi Realtime"; keduanya dilewati — halaman menarik
-- ulang tiap 10 detik selagi terbuka. Naikkan ke SSE kalau terasa lambat saat
-- demo, dan pakai pola data URL yang sama dengan foto kalau lampiran jadi
-- dibutuhkan.

BEGIN;

CREATE TABLE IF NOT EXISTS conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jenis           TEXT NOT NULL CHECK (jenis IN ('klien_vendor', 'admin_klien', 'admin_vendor')),
  booking_id      UUID REFERENCES bookings(booking_id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(user_id) ON DELETE CASCADE,
  vendor_id       UUID REFERENCES vendors(vendor_id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Disalin dari pesan terakhir supaya daftar percakapan bisa diurutkan tanpa
  -- subquery ke messages untuk tiap baris.
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bentuk_percakapan_sah CHECK (
    (jenis = 'klien_vendor' AND user_id IS NOT NULL AND vendor_id IS NOT NULL AND booking_id IS NOT NULL)
    OR (jenis = 'admin_klien' AND user_id IS NOT NULL AND vendor_id IS NULL AND booking_id IS NULL)
    OR (jenis = 'admin_vendor' AND vendor_id IS NOT NULL AND user_id IS NULL AND booking_id IS NULL)
  )
);

-- Satu pesanan = satu ruang obrolan, dan satu tiket admin per pihak. Ini yang
-- membuat "buka obrolan" bisa dipanggil berulang kali tanpa menumpuk ruang
-- kosong: ON CONFLICT DO NOTHING lalu SELECT.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_booking ON conversations (booking_id)
  WHERE booking_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_admin_klien ON conversations (user_id)
  WHERE jenis = 'admin_klien';
CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_admin_vendor ON conversations (vendor_id)
  WHERE jenis = 'admin_vendor';

CREATE INDEX IF NOT EXISTS idx_conv_daftar ON conversations (jenis, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  message_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  sender_user_id  UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  body            TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_percakapan ON messages (conversation_id, created_at);
-- Penghitung "belum dibaca" membaca ini: pesan belum terbaca, dikelompokkan
-- per percakapan, disaring "bukan dari saya" di aplikasi.
CREATE INDEX IF NOT EXISTS idx_messages_belum_dibaca ON messages (conversation_id, sender_user_id)
  WHERE read_at IS NULL;

COMMIT;
