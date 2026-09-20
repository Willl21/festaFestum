// Mengunduh foto yang sekarang masih berupa URL CDN Pexels ke
// frontend/public/img/, lalu menulis ulang nilainya di DB jadi '/img/...'.
//
// Jalankan: node unduh-foto.js --dry   hitung dulu, tidak mengunduh apa pun
//           node unduh-foto.js         unduh dan tulis ulang DB
//
// KENAPA TERPISAH dari seed-foto.js dan seed-layanan.js: menyeed katalog dan
// mengunduh 700-an berkas adalah dua pekerjaan dengan kecepatan dan risiko
// yang berbeda. Dipisah, seed tetap cepat dan langkah unduhnya bisa diulang
// sendiri kalau koneksi putus di tengah.
//
// Aman diulang: berkas yang sudah ada tidak diunduh lagi, dan baris yang sudah
// '/img/...' tidak disentuh. Foto yang bukan dari Pexels (mis. tiga foto asli
// Bloom & Co.) tidak ikut terbawa karena penyaringnya URL images.pexels.com.
//
// Konsekuensi yang perlu diingat: berkasnya disajikan Vite dari public/img,
// jadi jalur ini benar selama demo lewat satu port (proxy Vite). Kalau nanti
// backend diakses langsung di :4000, redirect '/img/...' tidak akan ketemu.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./src/config/db');

const IMG = path.join(__dirname, '..', 'frontend', 'public', 'img');
const dry = process.argv.includes('--dry');

// Berapa unduhan jalan bersamaan. Cukup untuk 700 berkas tanpa membuat CDN
// menutup koneksi; dinaikkan lagi tidak menambah kecepatan berarti.
const PARALEL = 8;

// Nama berkas diambil dari id foto di URL-nya, jadi foto yang dipakai dua
// tempat cuma diunduh sekali dan namanya stabil antar-run.
function namaBerkas(url) {
  const m = /\/photos\/(\d+)\//.exec(url);
  if (!m) return null;
  return `pexels-${m[1]}.jpg`;
}

// Ukuran yang sama dengan yang dipakai saat seed. Disalin dari lib pexels
// lewat impor supaya tidak bisa melenceng diam-diam.
const { UKURAN } = require('./src/lib/pexels');

/** Menyusun ulang URL CDN dari NAMA BERKASNYA.
 *
 *  Ini yang bikin berkas gambar tidak wajib ikut masuk git: sesudah DB berisi
 *  '/img/pexels-123.jpg', id fotonya masih tersimpan di nama berkas itu, jadi
 *  clone baru yang belum punya gambarnya bisa mengunduh ulang tanpa perlu
 *  menyimpan URL aslinya di mana pun. Tanpa ini, sekali DB ditulis ulang,
 *  gambarnya hanya ada di mesin yang menjalankan skrip ini. */
function urlDariNama(nama) {
  const m = /^pexels-(\d+)\.jpg$/.exec(nama);
  if (!m) return null;
  return `https://images.pexels.com/photos/${m[1]}/pexels-photo-${m[1]}.jpeg?${UKURAN}`;
}

async function unduh(url, tujuan) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} untuk ${url}`);
  fs.writeFileSync(tujuan, Buffer.from(await r.arrayBuffer()));
  return fs.statSync(tujuan).size;
}

async function main() {
  if (!fs.existsSync(IMG)) throw new Error(`Folder tidak ada: ${IMG}`);

  // Dua bentuk sekaligus: yang masih URL CDN (baru diseed) DAN yang sudah
  // '/img/...' tapi berkasnya hilang (clone baru, atau folder img dihapus).
  const { rows } = await pool.query(
    `SELECT image_url AS url FROM services         WHERE image_url LIKE 'https://images.pexels.com/%'
                                                      OR image_url LIKE '/img/pexels-%'
      UNION
     SELECT image_url        FROM portfolio_images WHERE image_url LIKE 'https://images.pexels.com/%'
                                                      OR image_url LIKE '/img/pexels-%'`
  );

  const peta = new Map(); // url CDN -> nama berkas
  for (const { url } of rows) {
    if (url.startsWith('/img/')) {
      const nama = url.slice(5);
      const asal = urlDariNama(nama);
      if (asal) peta.set(asal, nama);
      continue;
    }
    const nama = namaBerkas(url);
    if (!nama) {
      console.warn(`  ! tidak bisa membaca id foto dari: ${url}`);
      continue;
    }
    peta.set(url, nama);
  }

  const perluUnduh = [...peta].filter(([, nama]) => !fs.existsSync(path.join(IMG, nama)));
  console.log(`${peta.size} foto unik, ${perluUnduh.length} belum ada di public/img/`);
  if (dry) return console.log('--dry: berhenti di sini.');

  let byte = 0;
  let selesai = 0;
  const antre = [...perluUnduh];

  // Pekerja sederhana: PARALEL promise yang sama-sama mengambil dari satu
  // antrean sampai habis. Tanpa dependensi, dan gagalnya satu berkas tidak
  // membatalkan sisanya.
  const gagal = [];
  await Promise.all(
    Array.from({ length: PARALEL }, async () => {
      for (;;) {
        const item = antre.shift();
        if (!item) return;
        const [url, nama] = item;
        try {
          // Ditampung dulu, BARU ditambahkan. `byte += await ...` membaca
          // `byte` sebelum menunggu, jadi delapan pekerja paralel saling
          // menimpa dan totalnya jauh lebih kecil dari yang sebenarnya.
          const n = await unduh(url, path.join(IMG, nama));
          byte += n;
        } catch (e) {
          gagal.push(`${nama}: ${e.message}`);
        }
        if (++selesai % 50 === 0) console.log(`  ${selesai}/${perluUnduh.length}`);
      }
    })
  );

  if (gagal.length) {
    console.warn(`\n${gagal.length} gagal diunduh (baris DB-nya TIDAK diubah):`);
    for (const g of gagal.slice(0, 10)) console.warn('  ' + g);
  }

  // Baru sesudah berkasnya benar-benar ada, DB ditulis ulang. Urutan ini yang
  // mencegah DB menunjuk ke berkas yang gagal diunduh.
  let layanan = 0;
  let portofolio = 0;
  for (const [url, nama] of peta) {
    if (!fs.existsSync(path.join(IMG, nama))) continue;
    const lokal = `/img/${nama}`;
    layanan += (await pool.query(
      'UPDATE services SET image_url = $2 WHERE image_url = $1', [url, lokal]
    )).rowCount;
    portofolio += (await pool.query(
      'UPDATE portfolio_images SET image_url = $2 WHERE image_url = $1', [url, lokal]
    )).rowCount;
  }

  const mb = (byte / 1048576).toFixed(1);
  console.log(`\n${selesai - gagal.length} berkas diunduh (${mb} MB).`);
  console.log(`DB ditulis ulang: ${layanan} layanan, ${portofolio} foto portofolio.`);
}

main()
  .catch((e) => { console.error('GAGAL:', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
