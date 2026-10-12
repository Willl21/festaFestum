# Festa Festum

Marketplace vendor acara **formal** untuk Jabodetabek — Event Organizer, Florist,
Sewa Jas/Kebaya, Makeup Artist, dan Fotografer.

Dua hal yang jadi pembeda utamanya:

1. **Schedule-first discovery** — pilih tanggal dan lokasi dulu; yang
   ditampilkan hanya vendor yang benar-benar masih sanggup di hari itu.
2. **Conflict-free booking** — dua orang tidak bisa mengambil kapasitas vendor
   yang sama. Dijaga tiga lapis: Redis lock → `pg_advisory_xact_lock` per
   vendor+tanggal → constraint di DB (indeks unik nomor slot, dan `EXCLUDE`
   untuk rentang jam yang bertumpuk).

Versi yang sedang berjalan: frontend <https://festafestum.netlify.app>, backend
<https://festafestum-production.up.railway.app>.

## Isi repo

| Folder | Isi | Pemilik |
|---|---|---|
| `web_app/backend` | API Express + PostgreSQL | tim fullstack |
| `web_app/frontend` | React + Vite + Tailwind | tim fullstack |
| `ai_service/` | layanan rekomendasi Festa AI | AI Engineer |
| `data_science/` | dataset & scoring vendor | Data Scientist |

`ai_service/` dan `data_science/` milik anggota tim lain — **jangan diubah**
dari sisi web.

Isi `web_app/backend`:

| Folder | Isi |
|---|---|
| `src/routes`, `src/controllers` | satu pasang per kelompok endpoint (`/api/v1/auth`, `/bookings`, `/payments`, …) |
| `src/middleware` | login (`requireAuth`, `requireRole`), rate limit, error handler |
| `src/lib` | logika bersama: saldo vendor, kategori, email, notifikasi, gambar, kode OTP |
| `src/db` | `schema.sql` + `migrations/` |
| `tests/` | tes ujung-ke-ujung lewat HTTP, dijalankan `npm test` |
| `scripts/` | seed data, unduh foto, migrasi satuan, ekspor CSV |

## Yang perlu disiapkan

- **Node 20.19+ atau 22+** (Vite 8 menolak versi yang lebih tua; CI memakai 22)
- **PostgreSQL** — proyek ini memakai Supabase, tapi Postgres lokal juga bisa
- Dua file `.env` yang **tidak ikut ke Git**; minta ke pemilik repo lewat jalur
  pribadi, jangan ditempel di GitHub atau grup chat

## Cara menjalankan

### 1. Pasang dependensi — DI DUA TEMPAT

Tidak ada `package.json` di root, jadi backend dan frontend dipasang terpisah:

```powershell
cd web_app\backend  ; npm ci
cd ..\frontend      ; npm ci
```

Pakai **`npm ci`**, bukan `npm install`: `npm ci` memasang versi persis dari
`package-lock.json`. Sebagian versi di `package.json` masih memakai `^`, jadi
`npm install` bisa diam-diam menaikkan versi. **Jangan jalankan `npm update`.**

### 2. Isi dua file `.env`

**`web_app/backend/.env`** — salin dari `.env.example`, lalu isi nilainya.
Yang wajib hanya dua; sisanya mematikan fiturnya dengan rapi kalau kosong.

| Kunci | Keterangan |
|---|---|
| `DATABASE_URL` | **wajib** — connection string PostgreSQL. Host `localhost`/`127.0.0.1` otomatis tanpa SSL, selain itu lewat SSL |
| `JWT_SECRET` | **wajib** — string acak panjang |
| `JWT_EXPIRES_IN` | opsional, default `1d` |
| `PORT` | opsional, default `4000` |
| `CORS_ORIGINS` | origin frontend, pisah koma, **tanpa** garis miring di ujung. Yang **pertama** juga dipakai untuk menyusun URL foto absolut, jadi taruh domain frontend produksi paling depan |
| `TRUST_PROXY` | isi `1` **hanya** kalau di belakang proxy (Railway), supaya rate limit membaca IP asli |
| `REDIS_URL` | opsional — kosong = Redis lock mati, lapis DB tetap menjaga |
| `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION` | opsional — kosong = **mode simulasi**: VA dibuat lokal, lunas lewat tombol simulasi |
| `BREVO_API_KEY`, `EMAIL_PENGIRIM` | opsional — kosong = email mati, **kode OTP dicetak di terminal backend** |
| `GOOGLE_CLIENT_ID` | opsional — kosong = tombol login Google mati |
| `AI_API_URL` | opsional — alamat `ai_service`, default deploy Render tim AI |
| `PEXELS_KEY` | hanya untuk skrip `seed-foto` / `seed-layanan` |

**`web_app/frontend/.env`**:

```
VITE_API_URL=/api/v1
VITE_GOOGLE_CLIENT_ID=      # nilai yang SAMA dengan GOOGLE_CLIENT_ID backend, boleh kosong
```

`vite.config.ts` sudah mem-proxy `/api` ke `localhost:4000`, jadi saat
pengembangan lokal alamat relatif itu sudah cukup dan tidak menyentuh CORS.

> **Dua jebakan garis miring.** Kalau `VITE_API_URL` diisi alamat penuh
> (misalnya saat berbagi lewat tunnel atau di Netlify), dia **wajib** diawali
> `https://`, berakhir `/api/v1`, dan **tanpa** garis miring di ujung —
> `lib/api.ts` menyambung mentah, jadi garis miring ekstra menghasilkan
> `//vendors`. Sebaliknya `CORS_ORIGINS` **tidak boleh** berakhir garis miring,
> karena `app.js` mencocokkannya persis. Gejala kedua kesalahan itu sama
> persis: *"Tidak bisa menghubungi server"*.

Vite membekukan `VITE_API_URL` ke dalam bundel saat start dan Express membaca
`.env` sekali saat boot — **restart keduanya** setiap habis mengubah `.env`.

### 3. Siapkan database

**Kalau memakai database yang sudah ada** (Supabase tim), lewati langkah ini —
skemanya sudah jalan.

**Kalau memakai Postgres sendiri**, urutannya `schema.sql`, lalu migrasi
**002 sampai terakhir**. Migrasi **001 dilewati**: isinya sudah terlipat ke
`schema.sql` (lihat header berkasnya). Schema `extensions` dibuat dulu karena
migrasi 016 memasang `btree_gist` ke sana, mengikuti Supabase. Dari
`web_app/backend` (Git Bash):

```bash
q() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }
q -c 'CREATE SCHEMA IF NOT EXISTS extensions'
q -f src/db/schema.sql
for f in src/db/migrations/*.sql; do
  case "$f" in *001_*) continue ;; esac
  q -f "$f"
done
```

Langkah yang persis sama dijalankan CI di setiap push, jadi urutan ini selalu
teruji. Migrasi baru di DB yang sudah jalan cukup satu berkas:

```powershell
node scripts/jalankan-migrasi.js 024_jenis_acara_opsional.sql
```

Belum ada runner yang mencatat migrasi mana yang sudah dijalankan — catat
sendiri, dan jangan menjalankan berkas yang sama dua kali di DB bersama.

**Data contoh.** Di DB kosong, vendor dibuat lewat halaman `/vendor/daftar`,
lalu layanannya ditambahkan di `/vendor/layanan`. Skrip pengisi katalog bekerja
di atas vendor yang sudah ada:

```powershell
node scripts/seed-layanan.js --dry   # 5-6 layanan per vendor dari templat, --dry = lihat rencananya
node scripts/seed-foto.js --dry      # foto layanan & portofolio dari Pexels (butuh PEXELS_KEY)
node scripts/unduh-foto.js           # pulihkan berkas public/img/pexels-*.jpg dari id di namanya
node scripts/seed-ulasan.js          # 350 pesanan lunas + ulasan; --hapus untuk membersihkan
```

> `scripts/seed-vendors.js` **tidak bisa dipakai lagi**: CSV sumbernya
> (`data_science/datasets/vendors.csv`) sudah dihapus dari repo oleh tim Data
> Science.

Vendor bisa langsung dipesan tanpa menyiapkan jadwal apa pun: **tidak ada
baris di `vendor_schedules` berarti tersedia**. Tabel itu hanya menyimpan
tanggal yang ditutup vendor.

**Akun admin** dibuat manual di DB (set `role = 'admin'` pada barisnya di tabel
`users`); tidak ada pendaftaran admin lewat UI. Admin **wajib 2FA**: setelah
sandi benar, kode dikirim ke email — atau dicetak di terminal backend kalau
`BREVO_API_KEY` kosong.

### 4. Jalankan

Dua terminal:

```powershell
cd web_app\backend  ; npm run dev    # http://localhost:4000
cd web_app\frontend ; npm run dev    # http://localhost:5173
```

Atau satu perintah dari root, yang membuka dua jendela sekaligus:

```powershell
.\dev.ps1
```

Kalau kena *execution policy*, jalankan sekali:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## Halaman utama

| Alamat | Isi |
|---|---|
| `/` | landing |
| `/florist`, `/mua`, `/jas-kebaya`, `/fotografer`, `/event-organizer` | katalog per kategori, `/:id` detail, `/:id/pesan` form pesan |
| `/festa-ai` → `/festa-ai/pesan` | rekomendasi paket dari AI, lalu pesan semuanya sekaligus |
| `/pesanan` | pesanan milik pengguna (bayar, batal, ulasan, laporkan) |
| `/checkout/:bookingId` → `/pembayaran/:paymentId` → `/invoice/:bookingId` | alur bayar |
| `/masuk`, `/daftar`, `/lupa-sandi`, `/profil` | akun pelanggan |
| `/vendor/daftar`, `/vendor/masuk` → `/vendor` | workspace vendor: pemesanan, layanan, jadwal, keuangan, profil |
| `/admin/masuk` → `/admin` | pusat kendali admin: verifikasi vendor, escrow & pencairan, akun |

Tiap area punya halaman masuknya sendiri. Sesi yang kedaluwarsa otomatis
melempar pengguna ke halaman masuk yang sesuai.

## Alur pesanan & uang

1. **Pesan** — `POST /bookings`. Harga dihitung ulang dari DB; DP 30%. Pesanan
   lahir `menunggu` konfirmasi vendor dan langsung memakan kapasitas vendor.
2. **Vendor menjawab** — diterima atau ditolak. Tidak dijawab sampai batas
   waktunya = ditolak otomatis.
3. **Bayar DP** — hanya setelah vendor menerima. Batasnya 24 jam sejak
   diterima; lewat dari itu penyapu (tiap 5 menit) menandai pesanan `expired`
   dan kapasitasnya kembali. VA tidak pernah hidup lebih lama dari pesanannya,
   dan membatalkan pesanan ikut mematikan VA-nya di Midtrans.
4. **Lunas** — lewat webhook Midtrans, atau tombol "Saya Sudah Bayar" yang
   bertanya ke Midtrans (berguna saat backend di laptop dan webhook tidak bisa
   masuk). Keduanya lewat satu fungsi idempoten, jadi notifikasi berulang tidak
   menggandakan apa pun. Lalu pelunasan dengan cara yang sama.
5. **Escrow** — uang yang masuk ditahan sampai tanggal acara lewat, baru jadi
   saldo vendor, dipotong biaya platform 2,5%.
6. **Pencairan** — vendor mengajukan, admin menyetujui. Ini **ledger di DB**;
   transfer sungguhannya dilakukan di luar sistem.
7. **Sesudah acara** — pelanggan memberi ulasan (sekali per pesanan lunas), atau
   melapor / minta refund yang diputuskan admin.

**Kapasitas per kategori**: EO memakai nomor slot per hari; MUA dan fotografer
per rentang jam (tim yang sama boleh pagi dan sore); florist dan sewa jas/kebaya
memotong stok per unit, florist tanpa jam.

## Uji backend

Dari `web_app/backend`, dengan server hidup:

```powershell
npm test                                # semua tes di tests/, satu per satu, ringkasan di akhir
node tests/test-payment.js              # atau satu berkas saja
```

Tes menembak `http://localhost:4000/api/v1`; arahkan ke server lain dengan
`BASE_URL`. Semuanya **membersihkan datanya sendiri** — akun uji memakai domain
`@mail.com`, jangan dipakai untuk akun sungguhan.

> **Satu `npm test` per server segar.** Rate limit login menghitung kegagalan
> per IP selama 15 menit (di memori), dan beberapa tes sengaja salah memasukkan
> kode. Dua kali run berturut-turut di server yang sama bisa kena 429. Restart
> `npm run dev` dulu, atau tunggu 15 menit.

Tes memakai DB dari `.env`. Kalau itu DB bersama, datanya memang ditulis lalu
dihapus lagi — jangan menjalankannya bersamaan dengan orang lain.

## CI

`.github/workflows/ci.yml` jalan di setiap push ke `main` dan setiap pull
request:

- **frontend** — `npm ci`, `npm run lint`, `npm run build` (build sudah
  menjalankan `tsc -b`).
- **backend** — Postgres 17 dan Redis 7 sekali pakai, skema dibangun dari nol
  seperti langkah 3, server dinyalakan, lalu `npm test`. Midtrans dan Brevo
  sengaja kosong (mode simulasi), jadi tidak ada secret di CI dan **DB produksi
  tidak pernah disentuh**. Kalau merah, log server dicetak di langkah terakhir.

## Deploy

| | Backend | Frontend |
|---|---|---|
| Layanan | Railway | Netlify |
| Folder | Root Directory `/web_app/backend` | base `web_app/frontend`, build `npm run build`, publish `dist` |
| Env | isi seperti tabel `.env` backend, plus `TRUST_PROXY=1` dan `CORS_ORIGINS=https://festafestum.netlify.app` | `VITE_API_URL=https://festafestum-production.up.railway.app/api/v1` diisi di dashboard Netlify |

- `.env.production` frontend kena gitignore, jadi `VITE_API_URL` **harus** diisi
  di Netlify. Kalau kosong, frontend produksi menembak `localhost:4000` milik
  pengunjung.
- `public/_redirects` (`/* /index.html 200`) membuat rute React bisa dibuka
  langsung.
- Migrasi **tidak** jalan otomatis saat deploy. Jalankan ke DB produksi dulu
  sebelum mendorong kode yang membutuhkannya, dan dorong backend
  sebelum/bersamaan dengan frontend.
- Foto katalog (`public/img/pexels-*.jpg`, ±59 MB) ikut di-commit supaya build
  Netlify mendapatkannya.

## Sebelum bilang "selesai"

**`npm run dev` dan `vite build` saja TIDAK memeriksa TypeScript** — esbuild
hanya membuang anotasi tipe, jadi halaman yang rusak tetap tampil. Pemeriksaan
tipe baru terjadi di `npm run build` (lewat `tsc -b`). Jalankan ini dari
`web_app/frontend` setiap habis mengubah frontend:

```powershell
npx tsc --noEmit -p tsconfig.app.json
npx eslint src
```

Ini bukan teori — perintah itu pernah menemukan tiga halaman yang sudah
ter-commit dalam keadaan rusak dan tidak ketahuan sama sekali dari build.

Habis mengubah backend, jalankan `npm test` (lihat **Uji backend**). CI akan
menjalankan keduanya lagi, tapi lebih cepat ketahuan di laptop.

**Jangan jalankan `npx prettier --write`.** Tidak ada konfigurasi prettier di
repo ini, jadi default-nya (kutip ganda, 80 kolom) menulis ulang seluruh file
dan membuat diff-nya mustahil ditinjau.

## Catatan penting

- **Gambar disimpan sebagai data URL di kolom TEXT** — proyek ini tidak punya
  object storage. Gambar dikecilkan di browser dulu
  (`frontend/src/lib/gambar.ts`), divalidasi di backend
  (`backend/src/lib/gambar.js`), dan **tidak pernah ikut di respons daftar**:
  listing hanya membalas penanda `has_photo`, gambarnya diambil terpisah lewat
  endpoint foto yang membalas berkas asli plus `Cache-Control`. Foto katalog
  seed berupa path `/img/...` dan dibalas sebagai redirect.
- **Dokumen vendor (KTP/NPWP/SIUP) privat** — tidak pernah lewat URL publik,
  hanya lewat endpoint ber-token yang dibuka frontend sebagai blob.
- **Endpoint daftar membalas kunci `data`**, bukan nama koleksinya —
  `GET /vendors` membalas `{ data, pagination }`, bukan `{ vendors }`. Endpoint
  satuan memakai nama bendanya (`{ vendor }`, `{ booking }`). Kalau sebuah
  halaman kosong tanpa error, periksa kunci ini lebih dulu.
- **Midtrans hanya sampai Sandbox.** Uang tidak pernah mengalir ke vendor lewat
  gateway; payout adalah ledger di database sendiri dengan persetujuan admin.
- **Nominal pembayaran selalu dihitung ulang di backend** dari data DB. Angka
  yang dikirim browser tidak dipercaya.
- **Notifikasi lonceng ditulis di transaksi yang sama** dengan kejadiannya —
  kalau kejadiannya batal, notifikasinya ikut batal. Email dikirim sesudah
  commit dan tidak pernah ke `@mail.com` atau `.test`.
- **Festa AI dipanggil lewat backend** (`POST /api/v1/ai/recommend`), bukan
  langsung dari browser. Backend mencocokkan jawaban AI ke katalog DB, membuang
  nama karangan, dan memakai harga dari DB.
- **Ganti sandi, reset sandi, dan menyalakan 2FA mengeluarkan semua sesi lain**
  (`users.sesi_sejak`).
