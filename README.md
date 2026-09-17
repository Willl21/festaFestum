# Festa Festum

Marketplace vendor acara **formal** untuk Jabodetabek — Event Organizer, Florist,
Sewa Jas/Kebaya, Makeup Artist, dan Fotografer.

Dua hal yang jadi pembeda utamanya:

1. **Schedule-first discovery** — pilih tanggal, shift, dan lokasi dulu; yang
   ditampilkan hanya vendor yang benar-benar kosong di waktu itu.
2. **Conflict-free booking** — dua orang tidak bisa mengambil slot yang sama.
   Dijaga tiga lapis: Redis lock → `SELECT FOR UPDATE` → indeks unik di DB.

## Isi repo

| Folder | Isi | Pemilik |
|---|---|---|
| `web_app/backend` | API Express + PostgreSQL | tim fullstack |
| `web_app/frontend` | React + Vite + Tailwind | tim fullstack |
| `ai_service/` | layanan rekomendasi | AI Engineer |
| `data_science/` | dataset & scoring vendor | Data Scientist |

`ai_service/` dan `data_science/` milik anggota tim lain — **jangan diubah**
dari sisi web.

## Yang perlu disiapkan

- **Node 20.19+ atau 22+** (Vite 8 menolak versi yang lebih tua)
- **PostgreSQL** — proyek ini memakai Supabase, tapi Postgres lokal juga bisa
- Dua file `.env` yang **tidak ikut ke Git**; minta ke pemilik repo lewat jalur
  pribadi, jangan ditempel di GitHub atau grup chat

## Cara menjalankan

### 1. Pasang dependensi — DI DUA TEMPAT

Tidak ada `package.json` di root, jadi backend dan frontend dipasang terpisah:

```powershell
cd web_app\backend  ; npm install
cd ..\frontend      ; npm install
```

Pakai `npm install` biasa. Versi paket sudah di-pin (tanpa `^`) dan
`package-lock.json` ikut di-commit — **jangan jalankan `npm update`**.

### 2. Isi dua file `.env`

**`web_app/backend/.env`** — salin dari `.env.example` yang sudah ada di repo,
lalu isi nilainya. Yang wajib hanya dua:

| Kunci | Keterangan |
|---|---|
| `DATABASE_URL` | connection string PostgreSQL |
| `JWT_SECRET` | string acak apa saja, bebas |
| `PORT` | opsional, default `4000` |
| `CORS_ORIGINS` | opsional saat dev lokal |
| `REDIS_URL` | **opsional** — kosong = soft lock mati, constraint DB tetap jaga |
| `MIDTRANS_*` | **opsional** — kosong = mode simulasi, aplikasi tetap jalan penuh |

**`web_app/frontend/.env`** — satu baris:

```
VITE_API_URL=/api/v1
```

`vite.config.ts` sudah mem-proxy `/api` ke `localhost:4000`, jadi saat
pengembangan lokal alamat relatif itu sudah cukup dan tidak menyentuh CORS.

> **Dua jebakan garis miring.** Kalau `VITE_API_URL` diisi alamat penuh
> (misalnya saat berbagi lewat tunnel), dia **wajib** berakhir `/api/v1` dan
> **tanpa** garis miring di ujung — `lib/api.ts` menyambung mentah, jadi garis
> miring ekstra menghasilkan `//vendors`. Sebaliknya `CORS_ORIGINS` **tidak
> boleh** berakhir garis miring, karena `app.js` mencocokkannya persis. Gejala
> kedua kesalahan itu sama persis: *"Tidak bisa menghubungi server"*.

Vite membekukan `VITE_API_URL` ke dalam bundel saat start dan Express membaca
`CORS_ORIGINS` sekali saat boot — **restart keduanya** setiap habis mengubah
`.env`.

### 3. Siapkan database

**Kalau memakai database yang sudah ada** (Supabase tim), lewati langkah ini —
skemanya sudah jalan.

**Kalau memakai Postgres sendiri**, jalankan berurutan:

1. `web_app/backend/src/db/schema.sql`
2. lalu `src/db/migrations/001_*.sql` sampai `011_*.sql`, **urut nomornya**

Belum ada perintah otomatis untuk ini; tempelkan satu per satu lewat psql atau
SQL Editor.

Setelah itu isi data contoh:

```powershell
cd web_app\backend
node seed-vendors.js        # 3 vendor per kategori
node seed-vendors.js 10     # atau 10 per kategori
```

Skrip ini membaca `data_science/datasets/vendors.csv` (read-only, milik Data
Scientist) dan aman diulang. Tiap vendor dapat akun uji
`<nama-vendor-huruf-kecil-titik>@festafestum.test` dengan sandi `password123`,
satu layanan, dan 30 hari × 3 shift slot jadwal.

**Tanpa slot jadwal, vendor tidak akan muncul di discovery.**

Akun admin dibuat manual di DB (set `role = 'admin'` pada barisnya di tabel
`users`); tidak ada pendaftaran admin lewat UI.

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
| `/florist`, `/mua`, `/jas-kebaya`, `/fotografer`, `/event-organizer` | katalog per kategori |
| `/pesanan` | pesanan milik pengguna |
| `/masuk`, `/daftar` | autentikasi pelanggan |
| `/vendor/masuk` → `/vendor` | workspace vendor |
| `/admin/masuk` → `/admin` | pusat kendali admin |

Tiap area punya halaman masuknya sendiri. Sesi yang kedaluwarsa otomatis
melempar pengguna ke halaman masuk yang sesuai.

## Sebelum bilang "selesai"

**`vite build` TIDAK memeriksa TypeScript.** esbuild hanya membuang anotasi
tipe, jadi file yang identifier-nya tidak ada pun tetap "✓ built". Jalankan ini
dari `web_app/frontend` setiap habis mengubah frontend:

```powershell
npx tsc --noEmit -p tsconfig.app.json
npx eslint src
```

Ini bukan teori — perintah itu pernah menemukan tiga halaman yang sudah
ter-commit dalam keadaan rusak dan tidak ketahuan sama sekali dari build.

**Jangan jalankan `npx prettier --write`.** Tidak ada konfigurasi prettier di
repo ini, jadi default-nya (kutip ganda, 80 kolom) menulis ulang seluruh file
dan membuat diff-nya mustahil ditinjau.

## Uji backend

Jalankan dengan server hidup, dari `web_app/backend`:

```powershell
node test-alur-lengkap.js        # 13 langkah, menelusuri alur persis seperti frontend
node test-konfirmasi-ulasan.js   # konfirmasi vendor, pembatalan, ulasan
node test-booking-race.js        # 10 request bersamaan -> 1 sukses, 9 ditolak
node test-payment.js
node test-dashboard.js
node test-discovery.js
node test-profil-verifikasi.js
node test-keamanan-rekening.js
node test-vendor-portofolio.js
```

Semuanya membersihkan datanya sendiri **kecuali `test-booking-race.js`**, yang
meninggalkan vendor bernama "Race Test …" setiap dijalankan. Kalau memakai
database bersama, jangan menjalankannya berulang-ulang.

## Catatan penting

- **Gambar disimpan sebagai data URL di kolom TEXT** — proyek ini tidak punya
  object storage. Gambar dikecilkan di browser dulu
  (`frontend/src/lib/gambar.ts`), divalidasi di backend
  (`backend/src/lib/gambar.js`), dan **tidak pernah ikut di respons daftar**:
  listing hanya membalas penanda `has_photo`, gambarnya diambil terpisah lewat
  endpoint foto yang membalas berkas asli plus `Cache-Control`.
- **Endpoint daftar membalas kunci `data`**, bukan nama koleksinya —
  `GET /vendors` membalas `{ data, pagination }`, bukan `{ vendors }`. Endpoint
  satuan memakai nama bendanya (`{ vendor }`, `{ booking }`). Kalau sebuah
  halaman kosong tanpa error, periksa kunci ini lebih dulu.
- **Midtrans hanya sampai Sandbox.** Uang tidak pernah mengalir ke vendor lewat
  gateway; payout adalah ledger di database sendiri dengan persetujuan admin.
- **Nominal pembayaran selalu dihitung ulang di backend** dari data DB. Angka
  yang dikirim browser tidak dipercaya.
