// Uji perantara Festa AI (POST /api/v1/ai/recommend) TANPA memanggil Gemini:
// layanan AI diganti tiruan lokal yang membalas persis bentuk main.py tim AI.
// Server app dinyalakan sendiri di port acak, jadi tidak perlu server hidup.
//   node tests/test-festa-ai.js
// Membuat satu akun vendor uji (@mail.com) dan menghapusnya lagi di akhir.
require('dotenv').config();
const assert = require('assert');
const http = require('http');
const pool = require('../src/config/db');

let balasanAi;
let userUji;
const tiruan = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    tiruan.terakhir = JSON.parse(body);
    res.writeHead(balasanAi.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(balasanAi.body));
  });
});

(async () => {
  await new Promise((r) => tiruan.listen(0, r));
  process.env.AI_API_URL = `http://localhost:${tiruan.address().port}`;
  const app = require('../src/app');
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const BASE = `http://localhost:${server.address().port}/api/v1/ai/recommend`;
  const kirim = (body) =>
    fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, body: await r.json() }));

  try {
    // Data uji sendiri, bukan katalog seed: CI berjalan di DB kosong. Nama
    // diberi akhiran acak supaya tidak mungkin cocok dengan vendor asli.
    const acak = Math.random().toString(36).slice(2, 8);
    const { rows: [u] } = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role)
       VALUES ('Uji AI', $1, '0800', '-', 'vendor_owner') RETURNING user_id`,
      [`ai-${acak}@mail.com`]
    );
    userUji = u.user_id;
    const buat = async (kategori, vendor, layanan, harga) => {
      const { rows: [r] } = await pool.query(
        `WITH v AS (
           INSERT INTO vendors (owner_user_id, business_name) VALUES ($1, $2)
           RETURNING vendor_id, business_name
         )
         INSERT INTO services (vendor_id, service_name, category, price, minimum_notice_days)
         SELECT vendor_id, $3, $4, $5, 3 FROM v
         RETURNING service_id, service_name, price,
                   (SELECT business_name FROM v) AS business_name`,
        [userUji, `${vendor} ${acak}`, layanan, kategori, harga]
      );
      return r;
    };
    const mua = await buat('makeup_artist', 'Rias Uji', 'Paket Rias Pengantin', 2500000);
    const fg = await buat('photographer', 'Foto Uji', 'Paket Dokumentasi', 4000000);
    const permintaan = { event_type: 'Pernikahan', budget: 50000000, guest_count: 100, location: 'jakarta_selatan' };

    // 1. Nama dicocokkan ke DB; karangan AI dibuang; harga dari DB, bukan dari AI.
    balasanAi = { status: 200, body: {
      pesan_pembuka: 'Estimasi untuk Pernikahan.',
      rincian_estimasi: [
        { kategori: 'makeup_artist', vendor_terpilih: `${mua.business_name} - ${mua.service_name}`, harga: 1 },
        { kategori: 'photographer', vendor_terpilih: `${fg.business_name.toUpperCase()} - ${fg.service_name}`, harga: 1 },
        { kategori: 'florist', vendor_terpilih: 'Toko Karangan AI - Buket Fiktif', harga: 999 },
      ],
      total_estimasi: 1001,
      saran_penghematan: 'Hemat.',
      rekomendasi_toko: [],
    } };
    let r = await kirim(permintaan);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.data.length, 2, 'item karangan AI harus terbuang');
    assert.strictEqual(r.body.dibuang, 1);
    assert.strictEqual(r.body.total, Number(mua.price) + Number(fg.price), 'total dari harga DB');
    assert.ok(r.body.data.every((d) => d.vendor_id && d.service_id));
    assert.strictEqual(tiruan.terakhir.location, 'jakarta_selatan');
    console.log('1. cocok nama + buang karangan + total dari DB: OK');

    // 2. Fokus Prioritas menyaring kategori, total ikut disaring.
    r = await kirim({ ...permintaan, kategori: ['photographer'] });
    assert.deepStrictEqual(r.body.data.map((d) => d.service_id), [fg.service_id]);
    assert.strictEqual(r.body.total, Number(fg.price));
    assert.deepStrictEqual(tiruan.terakhir.fokus_prioritas, ['photographer'], 'fokus ikut dikirim ke AI');
    console.log('2. saring kategori + fokus_prioritas ke AI: OK');

    // 2b. Tanggal acara HARI INI: kedua layanan butuh >= 1 hari pemesanan,
    // jadi dua-duanya dibuang dan dihitung sebagai `penuh`.
    r = await kirim({ ...permintaan, tanggal: new Date().toLocaleDateString('en-CA') });
    assert.strictEqual(r.body.data.length, 0, JSON.stringify(r.body));
    assert.strictEqual(r.body.penuh, 2);
    assert.strictEqual(r.body.total, 0);
    console.log('2b. saring tanggal (minimal hari pemesanan): OK');

    // 3. Validasi input: tidak sampai ke AI.
    for (const salah of [
      { ...permintaan, budget: '50jt' },
      { ...permintaan, location: '' },
      { ...permintaan, kategori: ['katering'] },
      { ...permintaan, tanggal: '2026-13-40' },
    ]) {
      assert.strictEqual((await kirim(salah)).status, 400);
    }
    console.log('3. validasi input 400: OK');

    // 4. AI error (mis. model Gemini dimatikan) -> 502 tanpa membocorkan detailnya.
    balasanAi = { status: 500, body: { error: '404 NOT_FOUND models/gemini-1.5-flash' } };
    r = await kirim(permintaan);
    assert.strictEqual(r.status, 502);
    assert.ok(!/gemini/i.test(r.body.message), 'detail galat AI tidak boleh bocor');
    console.log('4. AI error -> 502 tanpa bocor: OK');

    console.log('\nSemua lolos.');
  } finally {
    // Vendor & layanannya ikut terhapus (ON DELETE CASCADE).
    if (userUji) await pool.query('DELETE FROM users WHERE user_id = $1', [userUji]);
    server.close();
    tiruan.close();
    await pool.end();
    // src/app ikut membuka koneksi Redis; tanpa ini prosesnya tidak pernah keluar.
    await require('../src/config/redis').redis?.quit();
  }
})().catch((e) => { console.error(e); process.exit(1); });
