// Mengisi DB dari dataset Data Scientist: data_science/datasets/vendors.csv
// Jalankan: node seed-vendors.js          (3 vendor per kategori)
//           node seed-vendors.js 10       (10 vendor per kategori)
//
// Aman diulang: vendor yang email akunnya sudah ada akan dilewati, jadi
// menjalankan dua kali tidak menggandakan data.
//
// CSV itu milik Data Scientist (folder data_science/ bukan punya kita) — file
// ini HANYA MEMBACA, tidak pernah menulis ke sana.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./src/config/db');

const CSV = path.join(__dirname, '..', '..', 'data_science', 'datasets', 'vendors.csv');
const PER_KATEGORI = Number(process.argv[2]) || 3;

// Sejak migrasi 013 tidak ada lagi ketersediaan yang perlu diseed: tidak ada
// baris vendor_schedules berarti vendor TERSEDIA. Dulu skrip ini harus
// mengarang 30 hari x 3 shift per vendor — 9.200 baris untuk 102 vendor —
// semata supaya vendornya muncul di pencarian.

// Password sama untuk semua akun seed, supaya gampang dipakai saat demo.
const PASSWORD_SEED = 'password123';

const KATEGORI = {
  'Event Organizer': 'event_organizer',
  Florist: 'florist',
  'Sewa Jas/Kebaya': 'attire_rental',
  'Hair and MakeUp': 'makeup_artist',
  Fotografer: 'photographer',
};

// CSV cuma menulis "Jakarta", padahal enum punya lima wilayah. Disebar
// bergiliran supaya filter kota kelihatan bekerja saat demo. Ini KARANGAN
// kita, bukan data asli — kalau Data Scientist nanti menambah kolom wilayah,
// ganti bagian ini.
const JAKARTA = [
  'jakarta_pusat', 'jakarta_utara', 'jakarta_barat', 'jakarta_selatan', 'jakarta_timur',
];
const KOTA = { Bogor: 'bogor', Depok: 'depok', Bekasi: 'bekasi', Tangerang: 'tangerang' };

// Parser CSV kecil: cukup untuk menangani field berkutip yang mengandung koma
// (kolom style_tags), tanpa menambah dependensi baru.
function parseCsv(teks) {
  const baris = teks.trim().split(/\r?\n/);
  const head = baris[0].split(',');
  return baris.slice(1).map((b) => {
    const nilai = [];
    let buf = '';
    let dalamKutip = false;
    for (const ch of b) {
      if (ch === '"') dalamKutip = !dalamKutip;
      else if (ch === ',' && !dalamKutip) { nilai.push(buf); buf = ''; }
      else buf += ch;
    }
    nilai.push(buf);
    return Object.fromEntries(head.map((h, i) => [h, (nilai[i] || '').trim()]));
  });
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

(async () => {
  const rows = parseCsv(fs.readFileSync(CSV, 'utf8'));

  // Ambil N pertama per kategori.
  const terpilih = [];
  const hitung = {};
  let jakartaKe = 0;

  for (const r of rows) {
    const kategori = KATEGORI[r.category];
    if (!kategori) continue;
    hitung[kategori] = (hitung[kategori] || 0) + 1;
    if (hitung[kategori] > PER_KATEGORI) continue;

    const kota = r.city === 'Jakarta'
      ? JAKARTA[jakartaKe++ % JAKARTA.length]
      : KOTA[r.city];
    if (!kota) continue;

    terpilih.push({ ...r, kategori, kota });
  }

  console.log(`Dataset: ${rows.length} baris, diambil ${terpilih.length} vendor `
    + `(${PER_KATEGORI} per kategori)\n`);

  const hash = await bcrypt.hash(PASSWORD_SEED, 10);
  const client = await pool.connect();

  let dibuat = 0;
  let dilewati = 0;

  try {
    for (const v of terpilih) {
      const email = `${slug(v.vendor_name)}@festafestum.test`;

      await client.query('BEGIN');

      // Satu akun user per vendor, karena vendors.owner_user_id NOT NULL.
      // ON CONFLICT DO NOTHING bikin skrip ini aman dijalankan berulang.
      const u = await client.query(
        `INSERT INTO users (name, email, phone, password_hash, role)
         VALUES ($1, $2, $3, $4, 'vendor_owner')
         ON CONFLICT (email) DO NOTHING
         RETURNING user_id`,
        [v.vendor_name, email, `08${v.vendor_id.replace(/\D/g, '')}0000`.slice(0, 15), hash]
      );

      if (u.rows.length === 0) {
        await client.query('ROLLBACK');
        dilewati++;
        continue;
      }

      const vend = await client.query(
        `INSERT INTO vendors
           (owner_user_id, business_name, city, description, is_verified, rating_avg)
         VALUES ($1, $2, $3, $4, TRUE, $5)
         RETURNING vendor_id`,
        [u.rows[0].user_id, v.vendor_name, v.kota, v.style_tags, Number(v.rating) || 0]
      );
      const vendorId = vend.rows[0].vendor_id;

      // CSV punya rentang harga (price_start..price_end), sedangkan services
      // cuma punya satu angka. Dipakai price_start karena kartu vendor di
      // frontend memang menampilkan "mulai dari".
      await client.query(
        `INSERT INTO services
           (vendor_id, service_name, category, description, price, minimum_notice_days)
         VALUES ($1, $2, $3, $4, $5, 7)`,
        [
          vendorId,
          `Paket ${v.category}`,
          v.kategori,
          `${v.style_tags}. Kisaran harga Rp${Number(v.price_start).toLocaleString('id-ID')}`
            + ` - Rp${Number(v.price_end).toLocaleString('id-ID')}.`,
          Number(v.price_start),
        ]
      );

      await client.query('COMMIT');
      dibuat++;
      console.log(`  + ${v.vendor_name.padEnd(28)} ${v.kategori.padEnd(16)} ${v.kota}`);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nGAGAL:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }

  const total = await pool.query(
    `SELECT (SELECT count(*) FROM vendors)::int AS vendor,
            (SELECT count(*) FROM services)::int AS layanan`
  );

  console.log(`\n${dibuat} vendor dibuat, ${dilewati} dilewati (sudah ada).`);
  console.log('Isi DB sekarang:', JSON.stringify(total.rows[0]));
  console.log(`Login vendor seed: <email>@festafestum.test / ${PASSWORD_SEED}`);
  process.exit(0);
})();
