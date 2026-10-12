-- Migrasi 025 — RLS untuk tiga tabel yang terlewat (audit keamanan 12 Okt 2026).
--
-- Supabase membuka REST API (PostgREST) untuk setiap tabel di schema public,
-- dan role `anon` punya hak SELECT bawaan. Anon key memang dirancang publik,
-- jadi tabel tanpa RLS bisa dibaca siapa pun lewat /rest/v1/<tabel>:
--   conversations, messages  -> seluruh isi chat (015, 017)
--   payouts                  -> nomor rekening & nama pemilik vendor (005, 021)
--
-- RLS tanpa policy = anon/authenticated ditolak semua, sama seperti 12 tabel
-- lainnya. Backend tidak terpengaruh: ia masuk sebagai `postgres`, pemilik
-- tabel dengan BYPASSRLS.
--
-- ATURAN KE DEPAN: setiap CREATE TABLE di migrasi wajib diikuti baris ini.

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts       ENABLE ROW LEVEL SECURITY;
