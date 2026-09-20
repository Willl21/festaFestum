// Menjalankan satu berkas migrasi. Dipakai ad-hoc, seperti 12 migrasi
// sebelumnya — proyek ini memang belum punya runner yang mencatat riwayat.
//
// Jalankan: node jalankan-migrasi.js 013_kapasitas_harian.sql
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./src/config/db');

const nama = process.argv[2];
if (!nama) {
  console.error('Sebutkan nama berkasnya, mis. 013_kapasitas_harian.sql');
  process.exit(1);
}

const berkas = path.join(__dirname, 'src', 'db', 'migrations', nama);

(async () => {
  try {
    const sql = fs.readFileSync(berkas, 'utf8');
    await pool.query(sql);
    console.log(`${nama} berhasil dijalankan.`);
  } catch (err) {
    console.error(`${nama} GAGAL:`, err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
