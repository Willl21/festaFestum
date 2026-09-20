// Aturan kapasitas harian, pengganti aturan "kategori eksklusif" yang lama.
//
// Yang dibuktikan:
//   1. Kapasitas 1 (fotografer/EO/MUA bawaan) menutup SELURUH tanggal
//   2. Kapasitas > 1 menerima beberapa pesanan di tanggal yang sama
//   3. Pesanan MUA berisi banyak orang tetap memotong 1, bukan sejumlah orang
//   4. Pesanan florist memotong sejumlah barang
//   5. Tanggal yang ditutup vendor ditolak
//   6. Vendor tidak bisa menutup tanggal yang sudah dipesan
//   7. Lima orang berebut kapasitas 3: tepat 3 yang berhasil
//   8. Jam acara TIDAK mengunci apa pun (migrasi 014) — dua pesanan boleh
//      berbagi jam yang sama selama kapasitasnya masih sisa
//
// Jalankan dengan server hidup:  node test-booking-kapasitas.js
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

// Semua email yang dibuat run ini, supaya bisa disapu di akhir.
const DIBUAT = [];
let pass = 0;
const ok = (m) => { pass++; console.log(`  OK  ${m}`); };

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

async function siapkanVendor(category, kapasitas) {
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

  if (kapasitas !== undefined) {
    const u = await api(`/vendors/${vendorId}`, {
      method: 'PATCH', token, body: { daily_capacity: kapasitas },
    });
    assert.strictEqual(u.status, 200, `set kapasitas gagal: ${JSON.stringify(u.body)}`);
    assert.strictEqual(u.body.vendor.daily_capacity, kapasitas, 'kapasitas tidak tersimpan');
  }

  return { token, vendorId, serviceId: s.body.service.service_id };
}

function pesan(token, serviceId, event_date, start_time, quantity) {
  return api('/bookings', {
    method: 'POST', token,
    body: {
      service_id: serviceId, event_date, start_time,
      event_type: 'wedding', event_location_detail: 'Gedung Uji',
      ...(quantity ? { quantity } : {}),
    },
  });
}

(async () => {
  const TGL_A = futureDate(40);
  const TGL_B = futureDate(41);

  // --- 1. Kapasitas 1 mengunci seluruh tanggal --------------------------
  console.log('\nKapasitas 1 (bawaan fotografer/EO/MUA):');
  {
    const v = await siapkanVendor('photographer');
    const c = await register('customer');

    const a = await pesan(c, v.serviceId, TGL_A, '08:00');
    assert.strictEqual(a.status, 201, `pesanan pertama gagal: ${JSON.stringify(a.body)}`);
    assert.strictEqual(a.body.booking.slot_ke, 0, 'pesanan pertama harus memegang slot nomor 0');
    ok('pesanan pertama diterima, memegang slot 0');

    const b = await pesan(await register('customer'), v.serviceId, TGL_A, '19:00');
    assert.strictEqual(b.status, 409, 'jam lain di tanggal yang sama harusnya ditolak');
    assert.ok(/penuh/i.test(b.body.message), `pesan salah: ${b.body.message}`);
    ok('jam LAIN di tanggal itu ikut tertutup: yang habis kapasitas, bukan jam');

    const lain = await pesan(await register('customer'), v.serviceId, TGL_B, '08:00');
    assert.strictEqual(lain.status, 201, 'tanggal lain harusnya masih bisa');
    ok('tanggal lain tidak ikut terkunci');

    // Kalender harus setuju dengan createBooking, bukan menawarkan slot mati.
    const kal = await api(`/services/${v.serviceId}/availability?from=${TGL_A}&to=${TGL_A}`);
    assert.strictEqual(kal.status, 200);
    assert.ok(kal.body.data.every((s) => s.status !== 'available'),
      'kalender masih menawarkan tanggal yang sudah penuh');
    ok('kalender ikut menutup tanggal itu');
  }

  // --- 2 & 3. Kapasitas > 1, dan jumlah orang tidak memotong kapasitas ---
  console.log('\nKapasitas 2 (MUA dua tim):');
  {
    const v = await siapkanVendor('makeup_artist', 2);

    // Lima orang dalam satu pesanan tetap satu tim.
    const a = await pesan(await register('customer'), v.serviceId, TGL_A, '08:00', 5);
    assert.strictEqual(a.status, 201, `pesanan 5 orang gagal: ${JSON.stringify(a.body)}`);
    assert.strictEqual(Number(a.body.booking.total_price), 5000000, 'harga harus dikali jumlah orang');
    assert.strictEqual(Number(a.body.booking.dp_amount), 1500000, 'DP harus ikut jumlah orang');
    ok('pesanan 5 orang: harga dikali 5, kapasitas terpotong 1');

    const b = await pesan(await register('customer'), v.serviceId, TGL_A, '13:00');
    assert.strictEqual(b.status, 201, 'tim kedua harusnya masih bisa dipesan');
    assert.strictEqual(b.body.booking.slot_ke, 1, 'tim kedua harus memegang slot nomor 1');
    ok('tim kedua di tanggal yang sama tetap menerima pesanan');

    const c = await pesan(await register('customer'), v.serviceId, TGL_A, '19:00');
    assert.strictEqual(c.status, 409, 'pesanan ketiga harusnya melebihi kapasitas');
    ok('pesanan ketiga ditolak: kapasitas 2 habis');

    // --- 8. Jam yang SAMA boleh dipakai dua pesanan ---------------------
    // Kebalikan dari aturan sebelum migrasi 014. Dulu shift yang sama ditolak
    // walau kapasitas masih sisa — MUA berkru 3 tidak bisa menerima dua
    // pesanan sekaligus, padahal ketiga krunya bisa di tiga tempat.
    const v2 = await siapkanVendor('makeup_artist', 3);
    const p1 = await pesan(await register('customer'), v2.serviceId, TGL_B, '09:00');
    assert.strictEqual(p1.status, 201);
    const p2 = await pesan(await register('customer'), v2.serviceId, TGL_B, '09:00');
    assert.strictEqual(p2.status, 201, 'jam yang sama harusnya boleh selama kapasitas sisa');
    assert.notStrictEqual(p2.body.booking.slot_ke, p1.body.booking.slot_ke,
      'dua pesanan tidak boleh memegang nomor slot yang sama');
    ok('jam yang sama diterima dua kali, nomor slotnya berbeda');

    const p3 = await pesan(await register('customer'), v2.serviceId, TGL_B, '09:00');
    assert.strictEqual(p3.status, 201, 'kru ketiga harusnya masih muat');
    const p4 = await pesan(await register('customer'), v2.serviceId, TGL_B, '09:00');
    assert.strictEqual(p4.status, 409, 'kru keempat tidak ada');
    ok('berhenti tepat di kapasitas 3, bukan di jumlah jam');
  }

  // --- 4. Florist: kapasitas dipotong sejumlah barang -------------------
  console.log('\nKapasitas stok (florist):');
  {
    const v = await siapkanVendor('florist', 5);

    const a = await pesan(await register('customer'), v.serviceId, TGL_A, '08:00', 3);
    assert.strictEqual(a.status, 201, `pesan 3 buket gagal: ${JSON.stringify(a.body)}`);
    assert.strictEqual(a.body.booking.slot_ke, null, 'pesanan non per-tim tidak bernomor slot');
    ok('3 buket diterima');

    // Jam kirim yang SAMA, dan itu memang boleh: yang habis stok, bukan waktu.
    const b = await pesan(await register('customer'), v.serviceId, TGL_A, '08:00', 2);
    assert.strictEqual(b.status, 201, 'jam kirim yang sama harusnya boleh untuk florist');
    ok('pesanan kedua di jam kirim yang sama diterima (stok, bukan waktu)');

    const c = await pesan(await register('customer'), v.serviceId, TGL_A, '13:00', 1);
    assert.strictEqual(c.status, 409, 'stok harusnya habis');
    assert.strictEqual(c.body.sisa_kapasitas, 0, 'sisa kapasitas harus dilaporkan');
    ok('pesanan ketiga ditolak: 3 + 2 = 5 stok habis');
  }

  // --- 5 & 6. Penutupan oleh vendor -------------------------------------
  console.log('\nPenutupan tanggal oleh vendor:');
  {
    const v = await siapkanVendor('florist', 5);
    const tutup = await api('/schedules', {
      method: 'POST', token: v.token, body: { dates: [TGL_A] },
    });
    assert.strictEqual(tutup.status, 201, `tutup gagal: ${JSON.stringify(tutup.body)}`);
    assert.strictEqual(tutup.body.ditutup, 1);

    const a = await pesan(await register('customer'), v.serviceId, TGL_A, '08:00');
    assert.strictEqual(a.status, 409, 'tanggal yang ditutup harusnya ditolak');
    ok('pesanan di tanggal yang ditutup ditolak');

    // Penutupan sekarang SEHARI PENUH: jam lain pun ikut tertutup. Sebelum
    // migrasi 014 ini masih terbuka, karena yang ditutup cuma satu shift.
    const b = await pesan(await register('customer'), v.serviceId, TGL_A, '13:00');
    assert.strictEqual(b.status, 409, 'jam lain di tanggal tertutup harusnya ikut ditolak');
    ok('penutupan berlaku sehari penuh, bukan sepotong hari');

    const buka = await api(`/schedules/${tutup.body.schedules[0].schedule_id}`, {
      method: 'DELETE', token: v.token,
    });
    assert.strictEqual(buka.status, 200, 'membuka kembali harusnya berhasil');
    const c = await pesan(await register('customer'), v.serviceId, TGL_A, '08:00');
    assert.strictEqual(c.status, 201, 'sesudah dibuka harusnya bisa dipesan lagi');
    ok('penutupan dicabut, tanggalnya bisa dipesan lagi');

    // Menutup tanggal yang sudah dipesan akan membuat kalender berbohong.
    const bentrok = await api('/schedules', {
      method: 'POST', token: v.token, body: { dates: [TGL_A] },
    });
    assert.strictEqual(bentrok.status, 409, 'menutup tanggal terpesan harusnya ditolak');
    assert.ok(bentrok.body.bentrok.length > 0, 'tanggal bentroknya harus disebutkan');
    ok('vendor tidak bisa menutup tanggal yang sudah dipesan');
  }

  // --- 7. Balapan memperebutkan kapasitas -------------------------------
  console.log('\nLima orang berebut kapasitas 3:');
  {
    const v = await siapkanVendor('florist', 3);
    const tokens = [];
    for (let i = 0; i < 5; i++) tokens.push(await register('customer'));

    const hasil = await Promise.all(
      tokens.map((t) => pesan(t, v.serviceId, TGL_B, '08:00', 1))
    );
    const sukses = hasil.filter((r) => r.status === 201).length;
    const tolak = hasil.filter((r) => r.status === 409).length;
    console.log(`  201: ${sukses}  409: ${tolak}`);
    assert.strictEqual(sukses, 3, 'harus tepat 3 yang berhasil');
    assert.strictEqual(tolak, 2, 'sisanya harus ditolak 409');
    ok('kapasitas tidak bisa dilewati walau ditembak bersamaan');
  }

  console.log(`\n${pass} pemeriksaan lolos.`);
})()
  .catch((e) => {
    console.error('\nGAGAL:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // bookings punya ON DELETE RESTRICT ke users, jadi urutannya wajib:
    // payments -> bookings -> users (vendor, layanan, penutupan ikut CASCADE).
    if (DIBUAT.length) {
      const ids = await pool.query('SELECT user_id FROM users WHERE email = ANY($1)', [DIBUAT]);
      const list = ids.rows.map((r) => r.user_id);
      if (list.length) {
        await pool.query(
          'DELETE FROM payments WHERE booking_id IN (SELECT booking_id FROM bookings WHERE user_id = ANY($1) OR vendor_id IN (SELECT vendor_id FROM vendors WHERE owner_user_id = ANY($1)))',
          [list]
        );
        await pool.query(
          'DELETE FROM bookings WHERE user_id = ANY($1) OR vendor_id IN (SELECT vendor_id FROM vendors WHERE owner_user_id = ANY($1))',
          [list]
        );
        await pool.query('DELETE FROM users WHERE user_id = ANY($1)', [list]);
      }
      console.log(`Data uji dibersihkan: ${list.length} akun.`);
    }
    await pool.end();
  });
