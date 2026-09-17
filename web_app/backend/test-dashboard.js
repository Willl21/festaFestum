// Uji endpoint yang dibutuhkan halaman Pesanan Saya + dashboard vendor:
// GET /bookings, /bookings/:id, /bookings/vendor, /vendor/stats,
// /vendor/balance, dan GET /schedules/me.
//
// Membersihkan datanya sendiri di akhir.
// Jalankan dengan server hidup: node test-dashboard.js
require('dotenv').config();
const assert = require('assert');
const pool = require('./src/config/db');

const BASE = process.env.BASE_URL || 'http://localhost:4000/api/v1';
const PRICE = 2000000;
const dibuat = [];

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

async function register(role) {
  const tag = uniq();
  const email = `dash${tag}@mail.test`;
  const r = await api('/auth/register', {
    method: 'POST',
    body: {
      name: `Dash ${tag}`, email, phone: `0819${tag}`,
      password: 'password123', role,
    },
  });
  assert.strictEqual(r.status, 201, `register gagal: ${JSON.stringify(r.body)}`);
  dibuat.push(email);
  return r.body.token;
}

let pass = 0;
const ok = (l) => { pass++; console.log(`  OK  ${l}`); };

(async () => {
  const vendorToken = await register('vendor_owner');
  const customerToken = await register('customer');

  const vendor = await api('/vendors', {
    method: 'POST', token: vendorToken,
    body: { business_name: `Dash Test ${uniq()}`, city: 'bekasi' },
  });
  const service = await api(`/vendors/${vendor.body.vendor.vendor_id}/services`, {
    method: 'POST', token: vendorToken,
    body: {
      service_name: 'Paket Uji Dashboard', category: 'event_organizer',
      price: PRICE, minimum_notice_days: 1,
    },
  });

  const TGL = futureDate(10);
  // Slot kedua sengaja di tanggal LAIN. Vendornya event_organizer, dan sejak
  // aturan kunci-seharian berlaku, memesan TGL menutup semua shift lain di
  // TGL juga — slot bebas yang dihitung stats harus datang dari tanggal lain.
  const TGL_LAIN = futureDate(11);
  await api('/schedules', {
    method: 'POST', token: vendorToken,
    body: { slots: [{ event_date: TGL, time_slot: 'pagi' }, { event_date: TGL_LAIN, time_slot: 'malam' }] },
  });

  const booking = await api('/bookings', {
    method: 'POST', token: customerToken,
    body: {
      service_id: service.body.service.service_id,
      event_date: TGL, time_slot: 'pagi',
      event_type: 'gala_dinner', event_location_detail: 'Ballroom Uji, Bekasi',
    },
  });
  assert.strictEqual(booking.status, 201, `booking gagal: ${JSON.stringify(booking.body)}`);
  const bookingId = booking.body.booking.booking_id;

  // Sejak migrasi 009 pesanan harus diterima vendornya dulu; charge menolak
  // 409 selama statusnya masih 'menunggu'.
  const diterima = await api(`/bookings/${bookingId}/konfirmasi`, {
    method: 'PATCH', token: vendorToken, body: { action: 'terima' },
  });
  assert.strictEqual(diterima.status, 200, `vendor gagal menerima pesanan: ${JSON.stringify(diterima.body)}`);

  console.log('\nEndpoint dashboard & pesanan:');

  // --- Sisi customer -----------------------------------------------------
  const mine = await api('/bookings', { token: customerToken });
  assert.strictEqual(mine.status, 200);
  assert.strictEqual(mine.body.data.length, 1, 'harusnya 1 pesanan');
  const b = mine.body.data[0];
  assert.ok(b.business_name, 'nama vendor tidak ikut');
  assert.ok(b.service_name, 'nama layanan tidak ikut');
  assert.ok(b.event_date, 'tanggal acara tidak ikut');
  assert.ok(Array.isArray(b.payments), 'payments bukan array');
  ok(`GET /bookings: 1 pesanan, lengkap dengan vendor + layanan + jadwal`);

  // --- Kebocoran lintas user --------------------------------------------
  const orangLain = await register('customer');
  const bocor = await api('/bookings', { token: orangLain });
  assert.strictEqual(bocor.body.data.length, 0, 'BOCOR: pesanan user lain ikut terbaca');
  ok('pesanan user lain tidak ikut terbaca');

  const curi = await api(`/bookings/${bookingId}`, { token: orangLain });
  assert.strictEqual(curi.status, 404, `harusnya 404, dapat ${curi.status}`);
  ok('detail pesanan orang lain dibalas 404, bukan 403');

  // --- Vendor boleh melihat pesanan yang masuk ke dia --------------------
  const detailVendor = await api(`/bookings/${bookingId}`, { token: vendorToken });
  assert.strictEqual(detailVendor.status, 200, 'vendor harusnya boleh lihat pesanan miliknya');
  ok('vendor yang dipesan boleh membuka detail pesanan itu');

  const masuk = await api('/bookings/vendor', { token: vendorToken });
  assert.strictEqual(masuk.status, 200);
  assert.strictEqual(masuk.body.data.length, 1);
  assert.ok(masuk.body.data[0].customer_name, 'nama customer tidak ikut');
  ok('GET /bookings/vendor: pesanan masuk + nama customer');

  const bukanVendor = await api('/bookings/vendor', { token: customerToken });
  assert.strictEqual(bukanVendor.status, 403, `role customer harusnya 403, dapat ${bukanVendor.status}`);
  ok('customer ditolak 403 di endpoint vendor (penolakan role, bukan kepemilikan)');

  // --- Statistik dashboard ----------------------------------------------
  const stats = await api('/bookings/vendor/stats', { token: vendorToken });
  assert.strictEqual(stats.status, 200, `stats gagal: ${JSON.stringify(stats.body)}`);
  assert.strictEqual(stats.body.stats.total_pesanan, 1);
  assert.strictEqual(stats.body.stats.menunggu_dp, 1);
  assert.ok(stats.body.stats.slot_tersedia >= 1, 'slot tersedia harusnya >= 1');
  ok(`stats: ${stats.body.stats.total_pesanan} pesanan, `
    + `${stats.body.stats.menunggu_dp} menunggu DP, `
    + `${stats.body.stats.slot_tersedia} slot bebas`);

  // --- Saldo: DP belum dibayar, jadi semuanya masih nol ------------------
  const saldo0 = await api('/bookings/vendor/balance', { token: vendorToken });
  assert.strictEqual(Number(saldo0.body.balance.total_masuk), 0, 'belum ada yang bayar');
  ok('saldo nol selama belum ada pembayaran sukses');

  // --- Bayar DP, saldo harus masuk ESCROW (acara belum lewat) ------------
  const charge = await api('/payments/charge', {
    method: 'POST', token: customerToken,
    body: { booking_id: bookingId, payment_type: 'down_payment', method: 'bca_va' },
  });
  assert.strictEqual(charge.status, 201, `charge gagal: ${JSON.stringify(charge.body)}`);

  const sim = await api(`/payments/${charge.body.payment.payment_id}/simulate`, {
    method: 'POST', token: customerToken,
  });

  if (sim.status === 200) {
    const saldo1 = await api('/bookings/vendor/balance', { token: vendorToken });
    const bal = saldo1.body.balance;
    assert.strictEqual(Number(bal.escrow), PRICE * 0.3, `escrow harusnya ${PRICE * 0.3}`);
    assert.strictEqual(Number(bal.saldo_tersedia), 0, 'acara belum lewat, saldo harus 0');
    ok(`DP masuk ESCROW (${bal.escrow}), saldo tersedia tetap 0 karena acara belum lewat`);

    const stats2 = await api('/bookings/vendor/stats', { token: vendorToken });
    assert.ok(Number(stats2.body.stats.revenue_bulan_ini) > 0, 'revenue harusnya terisi');
    ok(`revenue bulan ini terhitung: ${stats2.body.stats.revenue_bulan_ini}`);
  } else {
    console.log('  --  Midtrans aktif, langkah bayar dilewati (butuh simulator dashboard)');
  }

  // --- Kalender jadwal vendor -------------------------------------------
  const jadwal = await api(`/schedules/me?from=${futureDate(0)}&to=${futureDate(30)}`, {
    token: vendorToken,
  });
  assert.strictEqual(jadwal.status, 200, `jadwal gagal: ${JSON.stringify(jadwal.body)}`);
  assert.strictEqual(jadwal.body.data.length, 2, 'harusnya 2 slot');
  const dipesan = jadwal.body.data.find((s) => s.booking_id);
  assert.ok(dipesan, 'slot yang dipesan tidak membawa booking_id');
  assert.ok(dipesan.customer_name, 'nama customer tidak ikut di kalender');
  ok(`GET /schedules/me: 2 slot, yang dipesan membawa nama customer`);

  const tanpaRentang = await api('/schedules/me', { token: vendorToken });
  assert.strictEqual(tanpaRentang.status, 400, 'rentang tanggal harusnya wajib');
  ok('tanpa from/to ditolak 400 (cegah tarik ribuan baris)');

  console.log(`\n${pass} skenario lolos.`);
})()
  .catch((err) => {
    console.error('\nGAGAL:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.query(
      `DELETE FROM bookings b
        WHERE b.user_id IN (SELECT user_id FROM users WHERE email = ANY($1))
           OR b.service_id IN (
                SELECT s.service_id FROM services s
                  JOIN vendors v ON v.vendor_id = s.vendor_id
                 WHERE v.owner_user_id IN (SELECT user_id FROM users WHERE email = ANY($1)))`,
      [dibuat]
    );
    const r = await pool.query(
      'DELETE FROM users WHERE email = ANY($1) RETURNING email', [dibuat]
    );
    console.log(`Data uji dibersihkan: ${r.rows.length} akun.\n`);
    await pool.end();
  });
