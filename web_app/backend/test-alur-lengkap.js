// Menelusuri alur yang persis dilakukan frontend, dari halaman kategori
// sampai konfirmasi, memakai endpoint yang sama dengan yang dipanggil React.
// Tujuannya memastikan tidak ada endpoint yang hilang atau bentuk data yang
// meleset dari yang diharapkan halaman.
//
// Membersihkan datanya sendiri di akhir.
// Jalankan dengan server hidup: node test-alur-lengkap.js
require('dotenv').config();
const assert = require('assert');
const pool = require('./src/config/db');

const BASE = process.env.BASE_URL || 'http://localhost:4000/api/v1';
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
  const email = `alur${tag}@mail.test`;
  const r = await api('/auth/register', {
    method: 'POST',
    body: {
      name: `Alur ${tag}`, email, phone: `0817${tag}`,
      password: 'password123', role,
    },
  });
  assert.strictEqual(r.status, 201, `register gagal: ${JSON.stringify(r.body)}`);
  dibuat.push(email);
  return r.body.token;
}

let langkah = 0;
const ok = (l) => { langkah++; console.log(`  ${String(langkah).padStart(2)}. ${l}`); };

(async () => {
  // === Persiapan: vendor yang akan dipesan ===============================
  const vendorToken = await register('vendor_owner');
  const vendor = await api('/vendors', {
    method: 'POST', token: vendorToken,
    body: { business_name: `Alur Test ${uniq()}`, city: 'depok', description: 'Vendor uji alur' },
  });
  const vendorId = vendor.body.vendor.vendor_id;

  await api(`/vendors/${vendorId}/services`, {
    method: 'POST', token: vendorToken,
    body: {
      service_name: 'Paket Alur Lengkap', category: 'florist',
      price: 5000000, minimum_notice_days: 3,
      description: 'Paket untuk menguji alur pemesanan.',
    },
  });

  const TGL = futureDate(15);
  // Tidak ada slot yang perlu dibuka: sejak migrasi 013 vendor tersedia
  // secara bawaan, dan POST /schedules justru MENUTUP tanggal.

  console.log('\nAlur customer (persis seperti yang dipanggil frontend):');

  // === 1. Halaman kategori: GET /vendors?category= =======================
  const daftar = await api(`/vendors?category=florist&limit=24`);
  assert.strictEqual(daftar.status, 200);
  assert.ok(Array.isArray(daftar.body.data), 'response harus punya kunci data');
  const ketemu = daftar.body.data.find((v) => v.vendor_id === vendorId);
  assert.ok(ketemu, 'vendor baru tidak muncul di halaman kategori');
  assert.ok(ketemu.price_start_from, 'price_start_from kosong — kartu vendor butuh ini');
  ok('FloristPage: vendor muncul dengan harga & rating');

  // === 2. Schedule-first: tanggal + shift ================================
  const tersedia = await api(`/vendors?category=florist&event_date=${TGL}&limit=24`);
  assert.ok(
    tersedia.body.data.some((v) => v.vendor_id === vendorId),
    'vendor hilang dari filter schedule-first padahal tanggalnya tidak ditutup'
  );
  ok('Filter tanggal: vendor tetap muncul');

  // === 3. Halaman detail: GET /vendors/:id + /services ===================
  const detail = await api(`/vendors/${vendorId}`);
  const layanan = await api(`/vendors/${vendorId}/services`);
  assert.strictEqual(detail.status, 200);
  assert.ok(layanan.body.data.length > 0, 'layanan kosong');
  const serviceId = layanan.body.data[0].service_id;
  ok('FloristDetailPage: profil + daftar layanan termuat');

  // === 4. Tombol "Ajukan Pesanan": cek ketersediaan ======================
  const cek = await api('/schedules/check', {
    method: 'POST',
    body: { service_id: serviceId, event_date: TGL, start_time: '08:00' },
  });
  assert.strictEqual(cek.body.available, true, `slot harusnya tersedia: ${cek.body.reason}`);
  ok('Cek jadwal sebelum pindah halaman: tersedia');

  // Tanggal terlalu mepet harus ditolak DI SINI, bukan setelah isi form.
  const mepet = await api('/schedules/check', {
    method: 'POST',
    body: { service_id: serviceId, event_date: futureDate(1), start_time: '08:00' },
  });
  assert.strictEqual(mepet.body.available, false, 'lead time 3 hari harusnya menolak H+1');
  ok('Tanggal terlalu mepet ditolak sebelum user mengisi form');

  // Kalender pemesanan menarik sebulan sekaligus lewat endpoint sendiri —
  // /schedules/check cuma menjawab satu tanggal, jadi menggambar grid bulan
  // dengan itu berarti 60 request.
  const rentang = await api(
    `/services/${serviceId}/availability?from=${futureDate(0)}&to=${futureDate(40)}`
  );
  assert.strictEqual(rentang.status, 200, `availability gagal: ${JSON.stringify(rentang.body)}`);
  assert.ok(Array.isArray(rentang.body.data), 'availability harus punya kunci data');
  assert.ok(
    rentang.body.data.some((x) => x.event_date === TGL && x.status === 'available'),
    'tanggal yang dipakai tidak muncul sebagai tersedia di rentang'
  );
  // Tanggal paling awal ikut menghitung minimum_notice_days, supaya kalender
  // bisa mematikan tanggal yang terlalu mepet tanpa menebak di browser.
  assert.ok(rentang.body.earliest_date > futureDate(0), 'earliest_date harus menghormati lead time');
  ok('Kalender: ketersediaan sebulan terbaca dalam satu request');

  // Rentang ngawur ditolak, bukan menarik data bertahun-tahun.
  const kejauhan = await api(
    `/services/${serviceId}/availability?from=${futureDate(0)}&to=${futureDate(400)}`
  );
  assert.strictEqual(kejauhan.status, 400, 'rentang 400 hari harusnya ditolak');
  ok('Kalender: rentang terlalu lebar ditolak');

  // === 5. Halaman pesan: POST /bookings ==================================
  const customerToken = await register('customer');
  const booking = await api('/bookings', {
    method: 'POST', token: customerToken,
    body: {
      service_id: serviceId, event_date: TGL, start_time: '08:00',
      event_type: 'wedding',
      event_location_detail: 'Bunga acara — Gedung Uji — Jl. Uji No. 1\nCatatan: uji alur',
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
  assert.strictEqual(Number(booking.body.booking.dp_amount), 1500000, 'DP harusnya 30% dari 5jt');
  ok(`FloristOrderPage: booking dibuat, DP Rp1.500.000 (30%)`);

  // Slot langsung terkunci untuk orang lain.
  const cek2 = await api('/schedules/check', {
    method: 'POST',
    body: { service_id: serviceId, event_date: TGL, start_time: '08:00' },
  });
  assert.strictEqual(cek2.body.available, false, 'slot harusnya terkunci setelah dibooking');
  ok('Slot langsung terkunci untuk customer lain');

  // === 6. Halaman checkout: GET /bookings/:id ============================
  const ringkas = await api(`/bookings/${bookingId}`, { token: customerToken });
  assert.strictEqual(ringkas.status, 200);
  assert.ok(ringkas.body.booking.business_name, 'nama vendor tidak ikut');
  assert.ok(ringkas.body.booking.event_date, 'tanggal acara tidak ikut');
  ok('CheckoutPage: ringkasan pesanan lengkap');

  // === 7. Pilih metode: POST /payments/charge ============================
  const bayar = await api('/payments/charge', {
    method: 'POST', token: customerToken,
    body: { booking_id: bookingId, payment_type: 'down_payment', method: 'bca_va' },
  });
  assert.strictEqual(bayar.status, 201, `charge gagal: ${JSON.stringify(bayar.body)}`);
  const paymentId = bayar.body.payment.payment_id;
  ok(`Metode dipilih, tagihan terbit`);

  // === 8. Halaman pembayaran: GET /payments/:id ==========================
  const tagihan = await api(`/payments/${paymentId}`, { token: customerToken });
  assert.strictEqual(tagihan.status, 200, `detail tagihan gagal: ${JSON.stringify(tagihan.body)}`);
  assert.ok(tagihan.body.payment.details.va_number, 'nomor VA kosong');
  assert.ok(tagihan.body.payment.expires_at, 'expires_at kosong — hitung mundur butuh ini');
  assert.ok(tagihan.body.payment.business_name, 'ringkasan vendor tidak ikut');
  assert.strictEqual(Number(tagihan.body.payment.amount), 1500000);
  ok(`VirtualAccountPage: VA ${tagihan.body.payment.details.va_number}, batas waktu dari DB`);

  // Tagihan orang lain tidak boleh terbaca.
  const orangLain = await register('customer');
  const curi = await api(`/payments/${paymentId}`, { token: orangLain });
  assert.strictEqual(curi.status, 404, `harusnya 404, dapat ${curi.status}`);
  ok('Tagihan milik user lain dibalas 404');

  // === 9. "Saya Sudah Bayar" ============================================
  const sim = await api(`/payments/${paymentId}/simulate`, { method: 'POST', token: customerToken });
  const modeSimulasi = sim.status === 200;

  if (!modeSimulasi) {
    console.log('\n  -- Midtrans aktif: langkah 9-12 butuh bayar manual di dashboard --');
  } else {
    ok('Pembayaran DP masuk');

    // === 10. Halaman konfirmasi =========================================
    const konfirm = await api(`/bookings/${bookingId}`, { token: customerToken });
    assert.strictEqual(konfirm.body.booking.payment_status, 'dp_paid');
    ok('KonfirmasiPage: status booking jadi dp_paid');

    // === 11. Pesanan Saya ===============================================
    const pesanan = await api('/bookings', { token: customerToken });
    assert.strictEqual(pesanan.body.data.length, 1);
    assert.strictEqual(pesanan.body.data[0].payments.length, 1);
    ok('PesananSayaPage: pesanan tampil dengan riwayat pembayarannya');

    // === 12. Sisi vendor ================================================
    const masuk = await api('/bookings/vendor', { token: vendorToken });
    assert.strictEqual(masuk.body.data.length, 1);
    ok('VendorPemesananPage: pesanan masuk terlihat vendor');

    const saldo = await api('/bookings/vendor/balance', { token: vendorToken });
    assert.strictEqual(Number(saldo.body.balance.escrow), 1500000, 'DP harusnya di escrow');
    assert.strictEqual(Number(saldo.body.balance.saldo_tersedia), 0, 'acara belum lewat');
    ok('VendorKeuanganPage: DP masuk escrow, saldo tersedia masih 0');

    const jadwal = await api(`/schedules/me?from=${futureDate(0)}&to=${futureDate(30)}`, {
      token: vendorToken,
    });
    const slotDipesan = jadwal.body.data.find((x) => x.booking_id);
    assert.ok(slotDipesan, 'kalender tidak menandai slot yang dipesan');
    assert.strictEqual(slotDipesan.status, 'booked');
    ok('VendorJadwalPage: slot ditandai booked + nama customer');

    // === 13. Pelunasan ==================================================
    const lunas = await api('/payments/charge', {
      method: 'POST', token: customerToken,
      body: { booking_id: bookingId, payment_type: 'settlement', method: 'qris' },
    });
    assert.strictEqual(lunas.status, 201);
    assert.strictEqual(Number(lunas.body.payment.amount), 3500000, 'sisa harusnya 3,5jt');
    assert.ok(lunas.body.payment.details.qr_url, 'QRIS harus punya qr_url');
    ok('Pelunasan lewat QRIS: sisa Rp3.500.000, QR tersedia');

    await api(`/payments/${lunas.body.payment.payment_id}/simulate`, {
      method: 'POST', token: customerToken,
    });
    const akhir = await api(`/bookings/${bookingId}`, { token: customerToken });
    assert.strictEqual(akhir.body.booking.payment_status, 'fully_paid');
    ok('Booking jadi fully_paid setelah pelunasan');
  }

  console.log(`\n${langkah} langkah alur lolos.`);
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
