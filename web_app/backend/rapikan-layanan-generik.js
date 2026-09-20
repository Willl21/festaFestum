// Menyembunyikan layanan generik bawaan seed-vendors.js ("Paket <kategori>").
// Sejak seed-layanan.js mengisi 6 layanan berfoto per vendor, baris-baris ini
// muncul sebagai kartu kosong di katalog: nol field detail, nol foto, dan
// harganya sering kembar dengan paket utama.
//
// Soft delete, bukan DELETE: sebagian di antaranya masih ditunjuk pesanan
// lama, dan bookings punya ON DELETE RESTRICT ke services.
//
// Jalankan: node rapikan-layanan-generik.js [--balikkan]
require('dotenv').config();
const pool = require('./src/config/db');

// Daftar eksplisit, bukan LIKE 'Paket %' — pola itu ikut menyeret templat
// asli seperti "Paket Lamaran & Engagement". Sumbernya KATEGORI di
// seed-vendors.js; kalau di sana bertambah, tambahkan di sini juga.
const NAMA_GENERIK = [
  'Paket Event Organizer',
  'Paket Florist',
  'Paket Sewa Jas/Kebaya',
  'Paket Hair and MakeUp',
  'Paket Fotografer',
];

const balikkan = process.argv.includes('--balikkan');

(async () => {
  try {
    // Penandanya `details` kosong. Foto TIDAK bisa dipakai sebagai penanda:
    // seed-foto.js terlanjur memberi foto ke semuanya, jadi 100 baris sisa
    // seed pun punya image_url. Vendor yang benar-benar memakai barisnya
    // pasti mengisi setidaknya satu field detail lewat ServiceDialog.
    const { rows } = await pool.query(
      `UPDATE services
          SET is_active = $2
        WHERE service_name = ANY($1)
          AND is_active = NOT $2
          AND details = '{}'::jsonb
        RETURNING service_id, vendor_id, service_name`,
      [NAMA_GENERIK, balikkan]
    );

    console.log(`${rows.length} layanan generik ${balikkan ? 'dimunculkan lagi' : 'disembunyikan'}.`);

    const sisa = await pool.query(
      `SELECT count(*) FILTER (WHERE details <> '{}'::jsonb) AS disunting
         FROM services WHERE service_name = ANY($1)`,
      [NAMA_GENERIK]
    );
    const disunting = Number(sisa.rows[0].disunting);
    if (disunting) console.log(`${disunting} dilewati karena sudah disunting vendornya.`);
  } catch (err) {
    console.error('GAGAL:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
