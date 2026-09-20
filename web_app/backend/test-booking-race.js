// Uji inti conflict-free booking: 10 user menembak slot yang sama bersamaan,
// tepat satu harus berhasil. Jalankan dengan server hidup: node test-booking-race.js
const assert = require('assert');
const pool = require('./src/config/db');

const BASE = process.env.BASE_URL || 'http://localhost:4000/api/v1';
const CONCURRENCY = 10;

// Email yang dibuat run ini, untuk disapu di akhir. Dulu tes ini meninggalkan
// 11 akun + 1 vendor "Race Test …" tiap dijalankan.
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
      name: `T ${tag}`, email: `t${tag}@mail.com`, phone: `0812${tag}`,
      password: 'password123', role,
    },
  });
  assert.strictEqual(r.status, 201, `register ${role} gagal: ${JSON.stringify(r.body)}`);
  DIBUAT.push(`t${tag}@mail.com`);
  return r.token || r.body.token;
}

// Tanggal jauh di depan supaya lolos minimum_notice_days berapa pun.
function futureDate(daysAhead = 90) {
  return new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
}

(async () => {
  const vendorToken = await register('vendor_owner');

  const vendor = await api('/vendors', {
    method: 'POST', token: vendorToken,
    body: { business_name: `Race Test ${uniq()}`, city: 'depok' },
  });
  assert.strictEqual(vendor.status, 201, `buat vendor gagal: ${JSON.stringify(vendor.body)}`);

  const service = await api(`/vendors/${vendor.body.vendor.vendor_id}/services`, {
    method: 'POST', token: vendorToken,
    body: {
      service_name: 'Paket Uji Balapan', category: 'photographer',
      price: 1000000, minimum_notice_days: 1,
    },
  });
  assert.strictEqual(service.status, 201, `buat service gagal: ${JSON.stringify(service.body)}`);
  const serviceId = service.body.service.service_id;

  const eventDate = futureDate();
  // Tidak ada slot yang perlu dibuka: sejak migrasi 013 vendor tersedia secara
  // bawaan, dan POST /schedules justru MENUTUP tanggal.

  const check = await api('/schedules/check', {
    method: 'POST',
    body: { service_id: serviceId, event_date: eventDate, start_time: '08:00' },
  });
  assert.strictEqual(check.status, 200);
  assert.strictEqual(check.body.available, true, `slot harusnya tersedia: ${check.body.reason}`);

  // Sepuluh customer berbeda menembak slot yang sama, tanpa jeda.
  const tokens = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => register('customer'))
  );

  const results = await Promise.all(tokens.map((t) => api('/bookings', {
    method: 'POST', token: t,
    body: {
      service_id: serviceId, event_date: eventDate, start_time: '08:00',
      event_type: 'wedding', event_location_detail: 'Gedung Uji, Depok',
    },
  })));

  const created = results.filter((r) => r.status === 201);
  const rejected = results.filter((r) => r.status === 409);
  const other = results.filter((r) => r.status !== 201 && r.status !== 409);

  console.log(`201: ${created.length}  409: ${rejected.length}  lain: ${other.length}`);
  if (other.length) console.log('status lain:', other.map((r) => `${r.status} ${JSON.stringify(r.body)}`));

  // Penolakan lewat Redis bunyinya beda dari penolakan lewat DB. Dipisah supaya
  // kelihatan lapis mana yang benar-benar menangkap — kalau REDIS_URL kosong,
  // jumlah 'lock' pasti 0.
  const byLock = rejected.filter((r) => r.body?.message === 'Slot sedang diproses user lain').length;
  console.log(`  ditolak lock Redis: ${byLock}  ditolak constraint DB: ${rejected.length - byLock}`);

  assert.strictEqual(created.length, 1, `HARUS tepat 1 booking sukses, dapat ${created.length}`);
  assert.strictEqual(other.length, 0, 'tidak boleh ada status di luar 201/409');

  // Setelah dipesan, slot tidak boleh tampil available lagi.
  const after = await api('/schedules/check', {
    method: 'POST',
    body: { service_id: serviceId, event_date: eventDate, start_time: '08:00' },
  });
  assert.strictEqual(after.body.available, false, 'slot harusnya tidak available setelah dibooking');

  console.log('OK: conflict-free booking terbukti — 1 sukses, sisanya ditolak 409');
})()
  .catch((err) => {
    console.error('GAGAL:', err.message);
    process.exitCode = 1;
  })
  // Dijalankan lolos maupun gagal. bookings harus mati lebih dulu karena
  // ON DELETE RESTRICT ke users; vendor dan slotnya ikut CASCADE dari users.
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
