// Menukar foto katalog jas & kebaya dengan kumpulan yang sudah ditinjau satu
// per satu. Kuerinya sendiri sudah diperbaiki di src/db/layanan-seed.js;
// skrip ini membereskan 100 baris yang terlanjur memakai kueri lama —
// 'Kebaya Pengantin Modern' isinya gaun pengantin BARAT, bukan kebaya.
//
// Jalankan: node tukar-foto-attire.js --dry   lihat rencananya
//           node tukar-foto-attire.js         unduh + tulis DB
//
// Fotonya diunduh ke frontend/public/img seperti unduh-foto.js, jadi demo
// tidak nebeng CDN Pexels saat dinilai.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./src/config/db');

const IMG = path.join(__dirname, '..', 'frontend', 'public', 'img');
const UKURAN = 'auto=compress&cs=tinysrgb&w=900&h=600&fit=crop';
const dry = process.argv.includes('--dry');

// Id foto Pexels, sudah dilihat satu per satu lewat contact sheet. Jumlahnya
// lebih sedikit dari 20 vendor per produk, jadi dibagikan berputar — satu
// foto bisa dipakai beberapa vendor, dan itu lebih baik daripada foto ke-18
// hasil pencarian yang sudah melenceng dari temanya.
const PILIHAN = {
  'Kebaya Pengantin Modern': ['38677871','992711','5902754','13656968','29194950','35367133','36232568','36546794','36798359','32173149','33412347'],
  // Sengaja lebih sedikit dari sebelumnya: enam di antaranya ternyata satu
  // pemotretan yang sama (model dan pohon yang sama), jadi katalognya
  // terlihat mengulang orang yang itu-itu juga. Disisakan satu wakil per
  // pemotretan, lalu ditambah foto ibu-ibu dan rombongan berkebaya.
  'Kebaya Keluarga & Ibu':   ['35217249','33402414','38406235','33432190','5799764','29194910','29194878','33402499','33402401'],
  'Beskap Adat Jawa':        ['32541817','33864201','33396273','29194906','35366668','29194928','29194926','35339046','14813518','38375146'],
  'Jas Pengantin Pria':      ['11839036','37987847','18195750','11839021','17286664','177328','5157111','12031205','12706255','17257390','3023658','34203781'],
  'Gaun Malam Gala':         ['19983904','12731122','34362959','39023439','15591488','39023432','39023429','15354765','8467350','39526896','6236637','18816320'],
};

async function unduh(id) {
  const nama = `pexels-${id}.jpg`;
  const tujuan = path.join(IMG, nama);
  if (fs.existsSync(tujuan)) return nama;
  const r = await fetch(`https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?${UKURAN}`);
  if (!r.ok) throw new Error(`${r.status} untuk foto ${id}`);
  fs.writeFileSync(tujuan, Buffer.from(await r.arrayBuffer()));
  return nama;
}

(async () => {
  let total = 0;
  for (const [nama, ids] of Object.entries(PILIHAN)) {
    const { rows } = await pool.query(
      `SELECT s.service_id, v.business_name
         FROM services s JOIN vendors v ON v.vendor_id = s.vendor_id
        WHERE s.category = 'attire_rental' AND s.service_name = $1 AND s.is_active
        ORDER BY v.business_name`, [nama]);

    console.log(`\n== ${nama}: ${rows.length} layanan, ${ids.length} foto ==`);
    if (dry) { console.log(rows.slice(0, 3).map((r) => r.business_name).join(', '), '...'); continue }

    for (let i = 0; i < rows.length; i++) {
      const berkas = await unduh(ids[i % ids.length]);
      await pool.query('UPDATE services SET image_url = $1 WHERE service_id = $2',
        [`/img/${berkas}`, rows[i].service_id]);
      total++;
    }
    console.log(`selesai, ${rows.length} baris diperbarui`);
  }
  console.log(`\nTotal ${total} layanan dapat foto baru.`);
})().finally(() => pool.end());
