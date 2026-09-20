// Uji konfirmasi vendor atas pesanan, pembatalan, dan ulasan.
// Jalankan dengan server hidup:  node test-konfirmasi-ulasan.js
//
// Yang dijaga di sini, urut dari yang paling mahal kalau bocor:
//   1. Pesanan TIDAK bisa dibayar sebelum vendornya menerima.
//   2. Menolak & membatalkan membebaskan slotnya kembali (menyentuh
//      conflict-free booking).
//   3. Ulasan hanya dari pemilik pesanan, hanya kalau lunas, hanya sesudah
//      acaranya lewat, dan hanya sekali.
//   4. rating_avg/rating_count vendor ikut berubah setiap ulasan masuk.
require('dotenv').config();
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
const emails = [];
let vendorId = null;

async function daftar(role) {
  const tag = uniq();
  const email = `t${tag}@mail.com`;
  const r = await api('/auth/register', {
    method: 'POST',
    body: { name: `T ${tag}`, email, phone: `0812${tag}`, password: 'password123', role },
  });
  assert.strictEqual(r.status, 201, `register gagal: ${JSON.stringify(r.body)}`);
  emails.push(email);
  return { token: r.body.token, email, user_id: r.body.user.user_id };
}

/** Tanggal YYYY-MM-DD n hari dari hari ini. n negatif = masa lalu. */
function tanggal(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

(async () => {
  // --- Siapkan vendor + layanan + slot ---
  const vendor = await daftar('vendor_owner');
  const v = await api('/vendors', {
    method: 'POST', token: vendor.token,
    body: { business_name: `Uji Konfirmasi ${uniq()}`, city: 'jakarta_selatan', description: 'uji' },
  });
  assert.strictEqual(v.status, 201, `buat vendor gagal: ${JSON.stringify(v.body)}`);
  vendorId = v.body.vendor.vendor_id;

  const svc = await api(`/vendors/${vendorId}/services`, {
    method: 'POST', token: vendor.token,
    body: {
      service_name: 'Paket Uji', category: 'florist', price: 1000000,
      minimum_notice_days: 0, description: 'uji',
    },
  });
  assert.strictEqual(svc.status, 201, `buat layanan gagal: ${JSON.stringify(svc.body)}`);
  const serviceId = svc.body.service.service_id;

  const hariH = tanggal(30);
  // Sejak migrasi 013 vendor tersedia secara bawaan — tidak ada slot yang
  // perlu dibuka lebih dulu.

  const customer = await daftar();

  const pesan = () => api('/bookings', {
    method: 'POST', token: customer.token,
    body: {
      service_id: serviceId, event_date: hariH, start_time: '08:00',
      event_type: 'wedding', event_location_detail: 'Uji lokasi',
    },
  });

  // --- 1. Pesanan baru = menunggu, dan belum bisa dibayar ---
  const b1 = await pesan();
  assert.strictEqual(b1.status, 201, `booking gagal: ${JSON.stringify(b1.body)}`);
  assert.strictEqual(b1.body.booking.confirm_status, 'menunggu', 'pesanan baru harus menunggu');

  const bayarDini = await api('/payments/charge', {
    method: 'POST', token: customer.token,
    body: { booking_id: b1.body.booking.booking_id, payment_type: 'down_payment', method: 'bca_va' },
  });
  assert.strictEqual(bayarDini.status, 409, 'pesanan yang belum diterima tidak boleh bisa dibayar');

  // --- 2. Vendor lain tidak boleh menjawab pesanan ini (404, bukan 403) ---
  const orangLain = await daftar('vendor_owner');
  const nyolong = await api(`/bookings/${b1.body.booking.booking_id}/konfirmasi`, {
    method: 'PATCH', token: orangLain.token, body: { action: 'terima' },
  });
  assert.strictEqual(nyolong.status, 404, 'pesanan vendor lain harus 404, bukan 403');

  // --- 3. Tolak membebaskan slotnya ---
  const tolak = await api(`/bookings/${b1.body.booking.booking_id}/konfirmasi`, {
    method: 'PATCH', token: vendor.token, body: { action: 'tolak', note: 'Sedang penuh' },
  });
  assert.strictEqual(tolak.status, 200, `tolak gagal: ${JSON.stringify(tolak.body)}`);
  assert.strictEqual(tolak.body.booking.confirm_status, 'ditolak');
  assert.strictEqual(tolak.body.booking.payment_status, 'cancelled');

  const dua = await api(`/bookings/${b1.body.booking.booking_id}/konfirmasi`, {
    method: 'PATCH', token: vendor.token, body: { action: 'terima' },
  });
  assert.strictEqual(dua.status, 409, 'pesanan yang sudah diputuskan tidak boleh dijawab dua kali');

  // Slot yang ditolak harus bisa dipesan lagi — ini inti conflict-free booking.
  const b2 = await pesan();
  assert.strictEqual(b2.status, 201, 'slot yang ditolak harus bebas lagi');
  const bookingId = b2.body.booking.booking_id;

  // --- 4. Customer batal juga membebaskan slot ---
  const batal = await api(`/bookings/${bookingId}/batal`, { method: 'POST', token: customer.token });
  assert.strictEqual(batal.status, 200, `batal gagal: ${JSON.stringify(batal.body)}`);
  assert.strictEqual(batal.body.booking.payment_status, 'cancelled');

  const b3 = await pesan();
  assert.strictEqual(b3.status, 201, 'slot yang dibatalkan harus bebas lagi');
  const hidup = b3.body.booking.booking_id;

  // --- 5. Diterima -> baru boleh bayar ---
  const terima = await api(`/bookings/${hidup}/konfirmasi`, {
    method: 'PATCH', token: vendor.token, body: { action: 'terima' },
  });
  assert.strictEqual(terima.status, 200, `terima gagal: ${JSON.stringify(terima.body)}`);
  assert.strictEqual(terima.body.booking.confirm_status, 'diterima');

  const bayar = await api('/payments/charge', {
    method: 'POST', token: customer.token,
    body: { booking_id: hidup, payment_type: 'down_payment', method: 'bca_va' },
  });
  assert.strictEqual(bayar.status, 201, `charge gagal sesudah diterima: ${JSON.stringify(bayar.body)}`);

  // --- 6. Ulasan: ditolak selama syaratnya belum terpenuhi ---
  const dini = await api(`/bookings/${hidup}/ulasan`, {
    method: 'POST', token: customer.token, body: { rating: 5 },
  });
  assert.strictEqual(dini.status, 409, 'ulasan sebelum lunas harus ditolak');

  // Lunaskan dan majukan acaranya ke masa lalu lewat DB — dua hal yang di
  // dunia nyata butuh webhook Midtrans dan menunggu sebulan.
  await pool.query(`UPDATE bookings SET payment_status = 'fully_paid' WHERE booking_id = $1`, [hidup]);

  const belumLewat = await api(`/bookings/${hidup}/ulasan`, {
    method: 'POST', token: customer.token, body: { rating: 5 },
  });
  assert.strictEqual(belumLewat.status, 409, 'ulasan sebelum acara berlangsung harus ditolak');

  await pool.query(
    'UPDATE bookings SET event_date = $2 WHERE booking_id = $1',
    [hidup, tanggal(-1)]
  );

  for (const buruk of [0, 6, 2.5, 'lima']) {
    const r = await api(`/bookings/${hidup}/ulasan`, {
      method: 'POST', token: customer.token, body: { rating: buruk },
    });
    assert.strictEqual(r.status, 400, `rating ${buruk} seharusnya ditolak`);
  }

  // --- 7. Ulasan sah, sekali saja, dan ratingnya ikut terhitung ---
  const ulas = await api(`/bookings/${hidup}/ulasan`, {
    method: 'POST', token: customer.token, body: { rating: 4, comment: 'Rapi dan tepat waktu.' },
  });
  assert.strictEqual(ulas.status, 201, `ulasan gagal: ${JSON.stringify(ulas.body)}`);

  const lagi = await api(`/bookings/${hidup}/ulasan`, {
    method: 'POST', token: customer.token, body: { rating: 1 },
  });
  assert.strictEqual(lagi.status, 409, 'satu pesanan hanya boleh satu ulasan');

  const orangLuar = await daftar();
  const nebeng = await api(`/bookings/${hidup}/ulasan`, {
    method: 'POST', token: orangLuar.token, body: { rating: 5 },
  });
  assert.strictEqual(nebeng.status, 404, 'orang yang tidak memesan tidak boleh mengulas');

  const { rows } = await pool.query(
    'SELECT rating_avg, rating_count FROM vendors WHERE vendor_id = $1', [vendorId]
  );
  assert.strictEqual(Number(rows[0].rating_avg), 4, 'rating_avg vendor tidak ikut dihitung ulang');
  assert.strictEqual(rows[0].rating_count, 1, 'rating_count vendor tidak ikut dihitung ulang');

  const publik = await api(`/vendors/${vendorId}/ulasan`);
  assert.strictEqual(publik.status, 200, 'daftar ulasan harus bisa dibuka tanpa token');
  assert.strictEqual(publik.body.data.length, 1);
  assert.strictEqual(publik.body.ringkasan.b4, 1, 'sebaran bintang salah');
  assert.ok(
    !JSON.stringify(publik.body).includes('data:image'),
    'respons ulasan tidak boleh membawa data URL gambar'
  );

  console.log('SEMUA LOLOS');
})()
  .catch((e) => {
    console.error('GAGAL:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Urutannya tetap penting: payments menahan bookings, bookings menahan
    // services. Yang hilang cuma lompatan lewat vendor_schedules — bookings
    // sekarang membawa vendor_id sendiri.
    if (vendorId) {
      await pool.query(
        'DELETE FROM payments WHERE booking_id IN (SELECT booking_id FROM bookings WHERE vendor_id = $1)',
        [vendorId]
      );
      await pool.query('DELETE FROM bookings WHERE vendor_id = $1', [vendorId]);
      await pool.query('DELETE FROM vendor_schedules WHERE vendor_id = $1', [vendorId]);
      await pool.query('DELETE FROM services WHERE vendor_id = $1', [vendorId]);
      await pool.query('DELETE FROM vendors WHERE vendor_id = $1', [vendorId]);
    }
    if (emails.length) {
      await pool.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
    }
    await pool.end();
  });
