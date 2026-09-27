// Uji perantara Festa AI (POST /api/v1/ai/recommend) TANPA memanggil Gemini:
// layanan AI diganti tiruan lokal yang membalas persis bentuk main.py tim AI.
// Server app dinyalakan sendiri di port acak, jadi tidak perlu server hidup.
//   node test-festa-ai.js
// Tidak membuat data apa pun di DB (cuma SELECT), jadi tidak ada yang dibersihkan.
require('dotenv').config();
const assert = require('assert');
const http = require('http');
const pool = require('./src/config/db');

let balasanAi;
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
  const app = require('./src/app');
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const BASE = `http://localhost:${server.address().port}/api/v1/ai/recommend`;
  const kirim = (body) =>
    fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(async (r) => ({ status: r.status, body: await r.json() }));

  try {
    const { rows: [mua, fg] } = await pool.query(
      `(SELECT v.business_name, s.service_name, s.price, s.service_id FROM services s JOIN vendors v USING (vendor_id)
         WHERE s.is_active AND s.category = 'makeup_artist' LIMIT 1)
       UNION ALL
       (SELECT v.business_name, s.service_name, s.price, s.service_id FROM services s JOIN vendors v USING (vendor_id)
         WHERE s.is_active AND s.category = 'photographer' LIMIT 1)`
    );
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
    console.log('2. saring kategori: OK');

    // 3. Validasi input: tidak sampai ke AI.
    for (const salah of [
      { ...permintaan, budget: '50jt' },
      { ...permintaan, location: '' },
      { ...permintaan, kategori: ['katering'] },
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
    server.close();
    tiruan.close();
    await pool.end();
  }
})().catch((e) => { console.error(e); process.exit(1); });
