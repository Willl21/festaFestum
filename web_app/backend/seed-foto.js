// Mengisi foto portofolio vendor + foto layanan dari Pexels.
//
// Jalankan: node seed-foto.js --dry        lihat rencananya, DB tidak disentuh
//           node seed-foto.js              semua vendor yang belum punya foto
//           node seed-foto.js florist      satu kategori saja
//
// Butuh PEXELS_KEY di .env — gratis di https://www.pexels.com/api/
// Lisensi Pexels: boleh komersial, tanpa atribusi.
//
// Gambarnya TIDAK diunduh: yang disimpan cuma URL CDN Pexels, jadi nol berkas
// di repo dan nol byte gambar di Supabase. Endpoint foto vendor & layanan sudah
// meneruskan URL non-data sebagai redirect 302, jadi tidak ada perubahan kode
// lain. Konsekuensinya demo BUTUH internet — kalau nanti mau offline, unduh ke
// frontend/public/img/ dan simpan '/img/<nama>.jpg' di kolom yang sama.
//
// Aman diulang: vendor yang sudah punya baris portfolio_images dilewati utuh
// (ini yang melindungi 3 foto asli Bloom & Co.), begitu juga layanan yang
// image_url-nya sudah terisi.
require('dotenv').config();
const pool = require('./src/config/db');
const { cariFoto } = require('./src/lib/pexels');

const SLOT_FOTO = 3;

// Kueri per kategori untuk foto PORTOFOLIO vendor (suasana dan alat, bukan
// potret). Foto per LAYANAN tidak diurus di sini — itu punya kuerinya
// sendiri per paket di src/db/layanan-seed.js, dijalankan seed-layanan.js.
const KUERI = {
  event_organizer: { foto: 'elegant wedding reception decoration', layanan: 'event table setting flowers' },
  florist:         { foto: 'flower shop interior',                 layanan: 'wedding bouquet flowers' },
  attire_rental:   { foto: 'formal suits clothing rack',           layanan: 'wedding gown dress detail' },
  makeup_artist:   { foto: 'makeup brushes cosmetics flatlay',     layanan: 'bridal makeup products' },
  photographer:    { foto: 'camera photography equipment',         layanan: 'wedding photography details' },
};

async function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry');
  const hanya = argv.find((a) => !a.startsWith('--'));
  if (hanya && !KUERI[hanya]) throw new Error(`kategori tidak dikenal: ${hanya}`);
  // --dry tidak memanggil Pexels, jadi tidak butuh key — lib-nya yang
  // memeriksa PEXELS_KEY, dan itu baru terjadi saat benar-benar mencari.
  if (dry) console.log('== --dry: DB tidak akan disentuh ==');

  for (const kat of hanya ? [hanya] : Object.keys(KUERI)) {
    // Vendor dikenali lewat kategori layanannya — satu vendor satu kategori.
    // Yang sudah punya foto dilewati seluruhnya, bukan ditambal per slot.
    const { rows: vendors } = await pool.query(
      `SELECT DISTINCT v.vendor_id, v.business_name
         FROM vendors v JOIN services s ON s.vendor_id = v.vendor_id
        WHERE s.category = $1
          AND NOT EXISTS (SELECT 1 FROM portfolio_images pi WHERE pi.vendor_id = v.vendor_id)
        ORDER BY v.business_name`,
      [kat]
    );
    const { rows: layanan } = await pool.query(
      `SELECT service_id, service_name FROM services WHERE category = $1 AND image_url IS NULL ORDER BY service_name`,
      [kat]
    );

    if (vendors.length === 0 && layanan.length === 0) {
      console.log(`${kat}: sudah lengkap, dilewati`);
      continue;
    }
    console.log(`${kat}: ${vendors.length} vendor (${vendors.length * SLOT_FOTO} foto), ${layanan.length} layanan`);
    if (dry) continue;

    const stokFoto = await cariFoto(KUERI[kat].foto, vendors.length * SLOT_FOTO);
    const stokLayanan = layanan.length ? await cariFoto(KUERI[kat].layanan, layanan.length) : [];

    let n = 0;
    for (const v of vendors) {
      // Tiga slot satu vendor ditulis dalam satu statement: kalau salah satu
      // gagal, jangan tinggalkan vendor dengan portofolio setengah jadi.
      const urls = Array.from({ length: SLOT_FOTO }, () => stokFoto[n++ % stokFoto.length]);
      await pool.query(
        `INSERT INTO portfolio_images (vendor_id, image_url, sort_order)
         SELECT $1, url, (idx - 1) FROM unnest($2::text[]) WITH ORDINALITY AS t(url, idx)`,
        [v.vendor_id, urls]
      );
      console.log(`  ${v.business_name}: ${SLOT_FOTO} foto`);
    }

    let m = 0;
    for (const s of layanan) {
      await pool.query('UPDATE services SET image_url = $1 WHERE service_id = $2', [stokLayanan[m++ % stokLayanan.length], s.service_id]);
      console.log(`  layanan "${s.service_name}"`);
    }
  }
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => pool.end());
