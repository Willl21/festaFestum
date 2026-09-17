// Field tambahan per kategori (services.details, migrasi 012).
// Jalankan dengan server hidup: node test-detail-layanan.js
const assert = require('assert');
const pool = require('./src/config/db');

const BASE = process.env.BASE_URL || 'http://localhost:4000/api/v1';
const DIBUAT = [];

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const uniq = () => Math.random().toString(36).slice(2, 10);

async function register(role) {
  const tag = uniq();
  const r = await api('/auth/register', {
    method: 'POST',
    body: {
      name: `D ${tag}`, email: `d${tag}@mail.com`, phone: `0814${tag}`,
      password: 'password123', role,
    },
  });
  assert.strictEqual(r.status, 201, `register gagal: ${JSON.stringify(r.body)}`);
  DIBUAT.push(`d${tag}@mail.com`);
  return r.body.token;
}

// JSONB TIDAK menyimpan urutan kunci — Postgres mengurutkannya sendiri
// (panjang kunci lalu alfabet). Jadi perbandingannya harus tanpa urutan.
// Inilah sebabnya rincianLayanan() di frontend merender menurut urutan
// spesifikasi, bukan menurut urutan kunci yang datang dari DB.
const samaIsi = (a, b) => {
  const rapi = (o) => JSON.stringify(Object.entries(o || {}).sort());
  return rapi(a) === rapi(b);
};

let lolos = 0;
function cek(nama, syarat, detail = '') {
  assert.ok(syarat, `${nama} GAGAL ${detail}`);
  console.log(`  ok  ${nama}`);
  lolos++;
}

// Satu contoh isian per kategori, memakai kunci yang sama dengan
// frontend/src/data/layananFields.ts.
const CONTOH = {
  makeup_artist: {
    jenis_layanan: 'Makeup + hairdo', gaya_makeup: 'Natural',
    durasi: '3 jam', jumlah_orang: '2', fasilitas: 'Softlens, bulu mata',
  },
  event_organizer: {
    jenis_acara: 'Pernikahan', cakupan: 'Konsep, dekorasi, MC',
    durasi: '1 hari penuh', kapasitas: '200 tamu', tim: '1 koordinator, 5 kru',
  },
  photographer: {
    jenis_fotografi: 'Prewedding', gaya_fotografi: 'Cinematic', durasi: '4 jam',
    jumlah_fotografer: '2', output: '100 foto edit', estimasi_pengerjaan: '14 hari',
    area_layanan: 'Jabodetabek',
  },
  florist: {
    jenis_produk: 'Buket pengantin', jenis_bunga: 'Mawar, baby breath',
    warna: 'Putih', ukuran: 'Diameter 30 cm', bisa_custom: 'Bisa custom',
    estimasi_pengerjaan: '2 hari', fasilitas: 'Kartu ucapan',
  },
  attire_rental: {
    jenis_pakaian: 'Jas pria', model: 'Slim fit', ukuran: 'S, M, L',
    warna: 'Navy', durasi_sewa: '3 hari', fasilitas: 'Fitting 2x',
    ketentuan: 'Deposit Rp500.000',
  },
};

(async () => {
  for (const [kategori, details] of Object.entries(CONTOH)) {
    console.log(`\n[${kategori}]`);
    const token = await register('vendor_owner');
    const v = await api('/vendors', {
      method: 'POST', token,
      body: { business_name: `Detail ${kategori} ${uniq()}`, city: 'depok' },
    });
    assert.strictEqual(v.status, 201, `buat vendor gagal: ${JSON.stringify(v.body)}`);
    const vendorId = v.body.vendor.vendor_id;

    const s = await api(`/vendors/${vendorId}/services`, {
      method: 'POST', token,
      body: { service_name: `Paket ${kategori}`, category: kategori, price: 1000000, details },
    });
    cek('simpan layanan + details -> 201', s.status === 201, JSON.stringify(s.body));
    const svc = s.body.service;
    cek('details kembali utuh di respons', samaIsi(svc.details, details),
      JSON.stringify(svc.details));

    // Terbaca publik lewat endpoint yang dipakai halaman detail.
    const pub = await api(`/vendors/${vendorId}/services?category=${kategori}`);
    cek('GET /vendors/:id/services ikut membawa details',
      samaIsi(pub.body.data[0].details, details),
      JSON.stringify(pub.body.data[0]?.details));

    const det = await api(`/vendors/${vendorId}`);
    cek('GET /vendors/:id ikut membawa details',
      samaIsi(det.body.services[0].details, details),
      JSON.stringify(det.body.services[0]?.details));

    // Kunci asing ditolak, bukan disimpan diam-diam.
    const asing = await api(`/services/${svc.service_id}`, {
      method: 'PATCH', token, body: { details: { kunci_ngawur: 'x' } },
    });
    cek('kunci tak dikenal ditolak 400', asing.status === 400, JSON.stringify(asing.body));

    // Nilai bukan teks ditolak. Kuncinya diambil dari contoh kategori ini
    // sendiri, supaya yang diuji benar-benar tipenya — bukan kebetulan
    // tertolak karena kuncinya asing.
    const kunciSah = Object.keys(details)[0];
    const salahTipe = await api(`/services/${svc.service_id}`, {
      method: 'PATCH', token, body: { details: { [kunciSah]: 12 } },
    });
    cek('nilai bukan teks ditolak 400', salahTipe.status === 400,
      `dapat ${salahTipe.status} ${JSON.stringify(salahTipe.body)}`);

    // PATCH tanpa details tidak boleh menghapus yang sudah tersimpan.
    const lain = await api(`/services/${svc.service_id}`, {
      method: 'PATCH', token, body: { price: 2000000 },
    });
    cek('PATCH tanpa details -> details tetap utuh',
      samaIsi(lain.body.service.details, details),
      JSON.stringify(lain.body.service?.details));

    // Kirim {} = minta dikosongkan.
    const kosong = await api(`/services/${svc.service_id}`, {
      method: 'PATCH', token, body: { details: {} },
    });
    cek('PATCH details:{} -> dikosongkan',
      JSON.stringify(kosong.body.service.details) === '{}',
      JSON.stringify(kosong.body.service?.details));
  }

  // --- Layanan lama tanpa details tetap terbaca ---
  console.log('\n[kompatibilitas data lama]');
  {
    const lama = await pool.query(
      "SELECT details FROM services WHERE details = '{}'::jsonb LIMIT 1"
    );
    cek('layanan lama punya details {} (bukan null)',
      lama.rows.length > 0 && JSON.stringify(lama.rows[0].details) === '{}',
      JSON.stringify(lama.rows[0]));
  }

  console.log(`\nOK: ${lolos} pemeriksaan lolos.`);
})()
  .catch((err) => {
    console.error('\nGAGAL:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (DIBUAT.length) {
      await pool.query(
        `DELETE FROM bookings
          WHERE user_id IN (SELECT user_id FROM users WHERE email = ANY($1::text[]))`,
        [DIBUAT]
      );
      const r = await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [DIBUAT]);
      console.log(`Data uji dibersihkan: ${r.rowCount} akun.`);
    }
    await pool.end();
  });
