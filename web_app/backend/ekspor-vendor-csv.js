// Mengekspor vendor & layanan yang ADA DI DB sekarang ke CSV, untuk dikirim ke
// AI Engineer. Jalankan: node ekspor-vendor-csv.js [folder-tujuan]
//
// KENAPA PERLU. Model rekomendasinya masih dilatih dari dataset Data
// Scientist, yang vendornya tidak kita pakai. Rekomendasi yang menunjuk
// vendor yang tidak ada di katalog tidak bisa dipesan, jadi datanya harus
// dari sini.
//
// Dua berkas, disambung lewat vendor_id:
//   vendor.csv  — satu baris per vendor (kategori, kota, rating, rentang harga)
//   layanan.csv — satu baris per layanan AKTIF (harga, lead time, details)
//
// Yang ikut hanya yang TAMPIL DI KATALOG: vendor dengan minimal satu layanan
// aktif. Layanan nonaktif tidak bisa dipesan, jadi tidak ada gunanya
// direkomendasikan. `details` ditulis sebagai teks JSON karena kuncinya beda
// per kategori — lihat src/lib/layananDetail.js.
//
// Hanya membaca, tidak menulis apa pun ke DB.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./src/config/db');

const tujuan = process.argv[2] || 'ekspor-csv';

/** Semua sel dikutip, supaya koma/baris baru di deskripsi tidak memecah kolom. */
function keCsv(rows) {
  if (!rows.length) return '';
  const kolom = Object.keys(rows[0]);
  const sel = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [kolom.join(','), ...rows.map((r) => kolom.map((k) => sel(r[k])).join(','))].join('\n') + '\n';
}

async function main() {
  const vendor = await pool.query(`
    SELECT v.vendor_id, v.business_name,
           -- Satu vendor = satu kategori (keputusan desain no. 2).
           (SELECT s.category::text FROM services s
             WHERE s.vendor_id = v.vendor_id AND s.is_active LIMIT 1) AS category,
           v.city::text AS city, v.address, v.description,
           v.is_verified, v.rating_avg, v.rating_count, v.daily_capacity,
           (SELECT MIN(price) FROM services s WHERE s.vendor_id = v.vendor_id AND s.is_active) AS harga_min,
           (SELECT MAX(price) FROM services s WHERE s.vendor_id = v.vendor_id AND s.is_active) AS harga_max,
           (SELECT COUNT(*) FROM services s WHERE s.vendor_id = v.vendor_id AND s.is_active) AS jumlah_layanan
      FROM vendors v
     WHERE EXISTS (SELECT 1 FROM services s WHERE s.vendor_id = v.vendor_id AND s.is_active)
     ORDER BY category, v.rating_avg DESC, v.business_name`);

  const layanan = await pool.query(`
    SELECT s.service_id, s.vendor_id, v.business_name, s.category::text AS category,
           s.service_name, s.description, s.price, s.minimum_notice_days, s.details
      FROM services s
      JOIN vendors v ON v.vendor_id = s.vendor_id
     WHERE s.is_active
     ORDER BY s.category, v.business_name, s.price`);

  fs.mkdirSync(tujuan, { recursive: true });
  fs.writeFileSync(path.join(tujuan, 'vendor.csv'), keCsv(vendor.rows));
  fs.writeFileSync(path.join(tujuan, 'layanan.csv'), keCsv(layanan.rows));

  const perKategori = {};
  for (const r of vendor.rows) perKategori[r.category] = (perKategori[r.category] || 0) + 1;
  console.log(`${vendor.rows.length} vendor, ${layanan.rows.length} layanan -> ${path.resolve(tujuan)}`);
  console.table(perKategori);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => pool.end());
