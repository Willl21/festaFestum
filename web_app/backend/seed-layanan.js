// Melengkapi katalog tiap vendor: 5 layanan per vendor, lengkap dengan
// deskripsi, harga bertingkat, field tambahan per kategori, dan fotonya.
//
// Jalankan: node seed-layanan.js --dry     lihat rencananya, DB tidak disentuh
//           node seed-layanan.js           semua vendor yang belum lengkap
//           node seed-layanan.js florist   satu kategori saja
//
// Butuh PEXELS_KEY di .env kecuali dijalankan dengan --tanpa-foto.
//
// KENAPA ADA: seed-vendors.js cuma membuat SATU layanan per vendor, jadi
// halaman detail vendor mana pun cuma berisi satu kartu katalog. Itu sisa
// terbesar yang bikin demo terlihat setengah jadi.
//
// Aman diulang: layanan dikenali dari (vendor_id, service_name), jadi vendor
// yang sudah punya paket tertentu dilewati, bukan digandakan. Layanan asli
// buatan vendor tidak pernah disentuh.
require('dotenv').config();
const pool = require('./src/config/db');
const { TEMPLAT } = require('./src/db/layanan-seed');
const { periksaDetail } = require('./src/lib/layananDetail');
const { cariFoto } = require('./src/lib/pexels');

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const tanpaFoto = argv.includes('--tanpa-foto');
const hanya = argv.find((a) => !a.startsWith('--'));

// Dibulatkan supaya harganya terbaca seperti daftar harga sungguhan, bukan
// hasil perkalian desimal.
const bulatkan = (n) => Math.max(50000, Math.round(n / 50000) * 50000);

async function main() {
  if (hanya && !TEMPLAT[hanya]) {
    throw new Error(`kategori tidak dikenal: ${hanya}. Pilihan: ${Object.keys(TEMPLAT).join(', ')}`);
  }
  if (dry) console.log('== --dry: DB tidak akan disentuh ==\n');

  const kategori = hanya ? [hanya] : Object.keys(TEMPLAT);
  let dibuat = 0;
  let dilewati = 0;

  for (const kat of kategori) {
    // Harga dasar diambil dari layanan vendor yang SUDAH ada, bukan angka
    // seragam: vendor mahal harus tetap mahal di seluruh paketnya, dan urutan
    // harga antarvendor tidak boleh berubah gara-gara seed ini.
    const { rows: vendors } = await pool.query(
      `SELECT v.vendor_id, v.business_name, MIN(s.price)::numeric AS harga_dasar,
              array_agg(s.service_name) AS punya
         FROM vendors v
         JOIN services s ON s.vendor_id = v.vendor_id
        WHERE s.category = $1
        GROUP BY v.vendor_id, v.business_name
        ORDER BY v.business_name`,
      [kat]
    );

    if (vendors.length === 0) {
      console.log(`${kat}: tidak ada vendor, dilewati`);
      continue;
    }

    // Berapa layanan yang benar-benar perlu dibuat, per templat. Dihitung dulu
    // supaya jumlah foto yang diminta ke Pexels tepat, bukan ditebak.
    const rencana = [];
    for (const v of vendors) {
      for (const t of TEMPLAT[kat]) {
        if (v.punya.includes(t.nama)) { dilewati++; continue; }
        rencana.push({ vendor: v, templat: t });
      }
    }

    console.log(`${kat}: ${vendors.length} vendor, ${rencana.length} layanan baru`);
    if (dry || rencana.length === 0) continue;

    // Satu pencarian Pexels per TEMPLAT, bukan per kategori — supaya katalog
    // florist tidak berisi lima foto buket yang sama persis.
    const foto = {};
    if (!tanpaFoto) {
      for (const t of TEMPLAT[kat]) {
        const butuh = rencana.filter((r) => r.templat.nama === t.nama).length;
        if (butuh > 0) foto[t.nama] = await cariFoto(t.foto, butuh);
      }
    }

    const dipakai = {};
    for (const { vendor, templat } of rencana) {
      const { salah, nilai } = periksaDetail(templat.details, kat);
      if (salah) throw new Error(`Templat "${templat.nama}" ditolak: ${salah}`);

      let gambar = null;
      if (!tanpaFoto) {
        const stok = foto[templat.nama];
        const n = (dipakai[templat.nama] = (dipakai[templat.nama] || 0) + 1) - 1;
        gambar = stok[n % stok.length];
      }

      await pool.query(
        `INSERT INTO services
           (vendor_id, service_name, category, description, price,
            minimum_notice_days, details, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          vendor.vendor_id,
          templat.nama,
          kat,
          templat.deskripsi,
          bulatkan(Number(vendor.harga_dasar) * templat.faktor),
          templat.hariMinimal,
          JSON.stringify(nilai),
          gambar,
        ]
      );
      dibuat++;
    }
    console.log(`  ${rencana.length} layanan dibuat`);
  }

  console.log(`\n${dibuat} layanan dibuat, ${dilewati} dilewati (sudah ada).`);
}

main()
  .catch((e) => { console.error('GAGAL:', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
