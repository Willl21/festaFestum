// Aturan ketersediaan per kategori: MUA/EO/fotografer mengunci SATU TANGGAL
// penuh, florist & sewa jas/kebaya tetap boleh menerima beberapa pesanan di
// tanggal yang sama. Jalankan dengan server hidup:
//   node test-booking-kategori.js
const assert = require('assert');
const pool = require('./src/config/db');

const BASE = process.env.BASE_URL || 'http://localhost:4000/api/v1';

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
const futureDate = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

// Semua email yang dibuat run ini, supaya bisa disapu di akhir. Tanpa ini,
// sekali jalan meninggalkan 22 akun + 10 vendor menumpuk di DB.
const DIBUAT = [];

async function register(role) {
  const tag = uniq();
  const r = await api('/auth/register', {
    method: 'POST',
    body: {
      name: `K ${tag}`, email: `k${tag}@mail.com`, phone: `0813${tag}`,
      password: 'password123', role,
    },
  });
  assert.strictEqual(r.status, 201, `register gagal: ${JSON.stringify(r.body)}`);
  DIBUAT.push(`k${tag}@mail.com`);
  return r.body.token;
}

// Vendor + satu layanan + tiga shift di dua tanggal berturut-turut.
async function siapkanVendor(category, tglA, tglB) {
  const token = await register('vendor_owner');
  const v = await api('/vendors', {
    method: 'POST', token,
    body: { business_name: `Uji ${category} ${uniq()}`, city: 'depok' },
  });
  assert.strictEqual(v.status, 201, `buat vendor gagal: ${JSON.stringify(v.body)}`);
  const vendorId = v.body.vendor.vendor_id;

  const s = await api(`/vendors/${vendorId}/services`, {
    method: 'POST', token,
    body: {
      service_name: `Paket ${category}`, category,
      price: 1000000, minimum_notice_days: 1,
    },
  });
  assert.strictEqual(s.status, 201, `buat layanan gagal: ${JSON.stringify(s.body)}`);

  const slots = [];
  for (const d of [tglA, tglB]) {
    for (const t of ['pagi', 'siang', 'malam']) slots.push({ event_date: d, time_slot: t });
  }
  const sch = await api('/schedules', { method: 'POST', token, body: { slots } });
  assert.strictEqual(sch.status, 201, `buat slot gagal: ${JSON.stringify(sch.body)}`);

  return { token, vendorId, serviceId: s.body.service.service_id };
}

const pesan = (token, serviceId, event_date, time_slot) => api('/bookings', {
  method: 'POST', token,
  body: {
    service_id: serviceId, event_date, time_slot,
    event_type: 'wedding', event_location_detail: 'Gedung Uji, Depok',
  },
});

let lolos = 0;
function cek(nama, syarat, detail = '') {
  assert.ok(syarat, `${nama} GAGAL ${detail}`);
  console.log(`  ok  ${nama}`);
  lolos++;
}

(async () => {
  const tglA = futureDate(80);
  const tglB = futureDate(81);

  // ---- 1. Kategori eksklusif: satu pesanan mengunci seluruh tanggal ----
  for (const kategori of ['makeup_artist', 'event_organizer', 'photographer']) {
    console.log(`\n[${kategori}] — harus mengunci seharian`);
    const v1 = await siapkanVendor(kategori, tglA, tglB);
    const v2 = await siapkanVendor(kategori, tglA, tglB);
    const a = await register('customer');
    const b = await register('customer');

    const r1 = await pesan(a, v1.serviceId, tglA, 'pagi');
    cek('user A pesan tanggal A shift pagi -> 201', r1.status === 201, JSON.stringify(r1.body));

    const r2 = await pesan(b, v1.serviceId, tglA, 'siang');
    cek('user B vendor SAMA tanggal SAMA shift lain -> 409',
      r2.status === 409, `dapat ${r2.status} ${JSON.stringify(r2.body)}`);

    const r3 = await pesan(b, v2.serviceId, tglA, 'pagi');
    cek('user B vendor LAIN tanggal sama -> 201',
      r3.status === 201, `dapat ${r3.status} ${JSON.stringify(r3.body)}`);

    const r4 = await pesan(b, v1.serviceId, tglB, 'pagi');
    cek('user B vendor sama tanggal LAIN -> 201',
      r4.status === 201, `dapat ${r4.status} ${JSON.stringify(r4.body)}`);

    // Kalender ikut menutup shift lain di tanggal yang terkunci.
    const c = await api('/schedules/check', {
      method: 'POST',
      body: { service_id: v1.serviceId, event_date: tglA, time_slot: 'malam' },
    });
    cek('checkAvailability menutup shift lain di tanggal terkunci',
      c.body.available === false, JSON.stringify(c.body));

    // ---- pembatalan membuka tanggalnya lagi ----
    const batal = await api(`/bookings/${r1.body.booking.booking_id}/batal`, {
      method: 'POST', token: a,
    });
    cek('customer membatalkan pesanan -> 200', batal.status === 200, JSON.stringify(batal.body));

    const r5 = await pesan(b, v1.serviceId, tglA, 'siang');
    cek('sesudah dibatalkan, tanggal bisa dipesan lagi -> 201',
      r5.status === 201, `dapat ${r5.status} ${JSON.stringify(r5.body)}`);
  }

  // ---- 2. Kategori non-eksklusif: beberapa pesanan sehari tetap boleh ----
  for (const kategori of ['florist', 'attire_rental']) {
    console.log(`\n[${kategori}] — TIDAK boleh mengunci seharian`);
    const v = await siapkanVendor(kategori, tglA, tglB);
    const a = await register('customer');
    const b = await register('customer');

    const r1 = await pesan(a, v.serviceId, tglA, 'pagi');
    cek('user A pesan tanggal A shift pagi -> 201', r1.status === 201, JSON.stringify(r1.body));

    const r2 = await pesan(b, v.serviceId, tglA, 'siang');
    cek('user B vendor sama TANGGAL SAMA shift lain -> 201 (tidak diblokir)',
      r2.status === 201, `dapat ${r2.status} ${JSON.stringify(r2.body)}`);

    const r3 = await pesan(b, v.serviceId, tglA, 'pagi');
    cek('shift yang SUDAH terisi tetap ditolak -> 409',
      r3.status === 409, `dapat ${r3.status} ${JSON.stringify(r3.body)}`);
  }

  // ---- 3. Dua request hampir bersamaan di tanggal yang sama ----
  console.log('\n[balapan] dua shift berbeda, tanggal sama, kategori eksklusif');
  {
    const v = await siapkanVendor('makeup_artist', tglA, tglB);
    const a = await register('customer');
    const b = await register('customer');

    const [x, y] = await Promise.all([
      pesan(a, v.serviceId, tglA, 'pagi'),
      pesan(b, v.serviceId, tglA, 'malam'),
    ]);
    const sukses = [x, y].filter((r) => r.status === 201).length;
    const tolak = [x, y].filter((r) => r.status === 409).length;
    cek('tepat 1 sukses, 1 ditolak 409 (tanpa 500/deadlock)',
      sukses === 1 && tolak === 1,
      `sukses=${sukses} tolak=${tolak} -> ${x.status} ${y.status} ${JSON.stringify([x.body, y.body])}`);
  }

  // ---- 4. Satu vendor satu kategori ----
  console.log('\n[satu vendor satu kategori]');
  {
    const v = await siapkanVendor('florist', tglA, tglB);
    const beda = await api(`/vendors/${v.vendorId}/services`, {
      method: 'POST', token: v.token,
      body: { service_name: 'Paket Selundupan', category: 'makeup_artist', price: 500000 },
    });
    cek('tambah layanan kategori lain -> 409',
      beda.status === 409, `dapat ${beda.status} ${JSON.stringify(beda.body)}`);

    const sama = await api(`/vendors/${v.vendorId}/services`, {
      method: 'POST', token: v.token,
      body: { service_name: 'Buket Kedua', category: 'florist', price: 500000 },
    });
    cek('tambah layanan kategori SAMA -> 201',
      sama.status === 201, `dapat ${sama.status} ${JSON.stringify(sama.body)}`);

    const pindah = await api(`/services/${sama.body.service.service_id}`, {
      method: 'PATCH', token: v.token, body: { category: 'photographer' },
    });
    cek('ubah kategori satu layanan saja -> 409',
      pindah.status === 409, `dapat ${pindah.status} ${JSON.stringify(pindah.body)}`);
  }

  console.log(`\nOK: ${lolos} pemeriksaan lolos.`);
})()
  .catch((err) => {
    console.error('\nGAGAL:', err.message);
    process.exitCode = 1;
  })
  // Dijalankan lolos maupun gagal. bookings harus mati lebih dulu karena
  // ON DELETE RESTRICT ke users; vendor, layanan, dan slotnya ikut CASCADE
  // dari users.
  .finally(async () => {
    if (DIBUAT.length) {
      await pool.query(
        `DELETE FROM bookings
          WHERE user_id IN (SELECT user_id FROM users WHERE email = ANY($1::text[]))`,
        [DIBUAT]
      );
      const r = await pool.query(
        'DELETE FROM users WHERE email = ANY($1::text[])', [DIBUAT]
      );
      console.log(`Data uji dibersihkan: ${r.rowCount} akun.`);
    }
    await pool.end();
  });
