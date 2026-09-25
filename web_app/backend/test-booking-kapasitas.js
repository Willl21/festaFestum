// Aturan kapasitas & jadwal pemesanan.
//
// Yang dibuktikan:
//   1. EO berkapasitas 1 menutup SELURUH tanggal (kapasitas harian)
//   2. MUA & fotografer dikunci per RENTANG JAM (migrasi 016):
//      - rentang yang bertumpuk ditolak, termasuk jeda perjalanan
//      - tim yang sama boleh dapat pesanan pagi DAN sore di hari yang sama
//      - jam tambahan ikut memperpanjang rentang dan menambah harga
//      - jeda disalin ke pesanan, mengubahnya tidak menggeser pesanan lama
//      - rentang yang menyeberang tengah malam ikut memblok besok pagi
//      - constraint EXCLUDE di DB menolak tumpang tindih walau aplikasi dilewati
//   3. Paket MUA per orang: durasi = menit x orang, dibulatkan ke jam penuh;
//      kapasitas = jumlah tim yang jalan bersamaan
//   4. Pesanan florist memotong sejumlah barang
//   5. Tanggal yang ditutup vendor ditolak
//   6. Vendor tidak bisa menutup tanggal yang sudah dipesan
//   7. Lima orang berebut kapasitas 3: tepat 3 yang berhasil
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

function pesan(token, serviceId, event_date, start_time, quantity, jam_tambahan) {
  return api('/bookings', {
    method: 'POST', token,
    body: {
      service_id: serviceId, event_date, start_time,
      event_type: 'wedding', event_location_detail: 'Gedung Uji',
      ...(quantity ? { quantity } : {}),
      ...(jam_tambahan ? { jam_tambahan } : {}),
    },
  });
}

function aturPaket(v, body) {
  return api(`/services/${v.serviceId}`, { method: 'PATCH', token: v.token, body });
}

(async () => {
  const TGL_A = futureDate(40);
  const TGL_B = futureDate(41);

  const TGL_C = futureDate(42);

  // --- 1. EO: kapasitas 1 mengunci seluruh tanggal ----------------------
  console.log('\nKapasitas harian (EO):');
  {
    const v = await siapkanVendor('event_organizer');
    const a = await pesan(await register('customer'), v.serviceId, TGL_A, '08:00');
    assert.strictEqual(a.status, 201, `pesanan pertama gagal: ${JSON.stringify(a.body)}`);
    assert.strictEqual(a.body.booking.slot_ke, 0, 'pesanan pertama harus memegang slot nomor 0');
    assert.strictEqual(a.body.booking.durasi_menit, null, 'EO tidak berbasis jam');
    ok('pesanan pertama diterima, memegang slot 0');

    const b = await pesan(await register('customer'), v.serviceId, TGL_A, '19:00');
    assert.strictEqual(b.status, 409, 'jam lain di tanggal yang sama harusnya ditolak');
    assert.ok(/penuh/i.test(b.body.message), `pesan salah: ${b.body.message}`);
    ok('jam LAIN di tanggal itu ikut tertutup: EO habis per hari');

    const kal = await api(`/services/${v.serviceId}/availability?from=${TGL_A}&to=${TGL_A}`);
    assert.ok(kal.body.data.every((s) => s.status !== 'available'),
      'kalender masih menawarkan tanggal yang sudah penuh');
    ok('kalender ikut menutup tanggal itu');
  }

  // --- 2. Fotografer: dikunci per rentang jam ---------------------------
  console.log('\nRentang jam (fotografer, 1 tim, paket bawaan 4 jam, jeda 1 jam):');
  {
    const v = await siapkanVendor('photographer');

    const a = await pesan(await register('customer'), v.serviceId, TGL_A, '08:00');
    assert.strictEqual(a.status, 201, `pesanan 08:00 gagal: ${JSON.stringify(a.body)}`);
    assert.strictEqual(a.body.booking.durasi_menit, 240, 'durasi paket bawaan fotografer 4 jam');
    ok('08:00-12:00 diterima');

    const tumpuk = await pesan(await register('customer'), v.serviceId, TGL_A, '10:00');
    assert.strictEqual(tumpuk.status, 409, 'rentang bertumpuk harusnya ditolak');
    ok('10:00 ditolak: bertumpuk dengan 08:00-12:00');

    const jeda = await pesan(await register('customer'), v.serviceId, TGL_A, '12:00');
    assert.strictEqual(jeda.status, 409, 'jam dalam jeda perjalanan harusnya ditolak');
    ok('12:00 ditolak: masih di jeda perjalanan (terkunci sampai 13:00)');

    const sore = await pesan(await register('customer'), v.serviceId, TGL_A, '13:00');
    assert.strictEqual(sore.status, 201, `13:00 harusnya boleh: ${JSON.stringify(sore.body)}`);
    assert.strictEqual(sore.body.booking.slot_ke, 0, 'tim yang sama dipakai lagi');
    ok('13:00 diterima di tim yang SAMA — hari tidak habis oleh satu pesanan');

    const menit = await pesan(await register('customer'), v.serviceId, TGL_B, '08:30');
    assert.strictEqual(menit.status, 400, 'jam mulai harus jam penuh');
    ok('08:30 ditolak 400: jadwal per jam penuh');

    const kal = await api(`/services/${v.serviceId}/availability?from=${TGL_A}&to=${TGL_A}`);
    assert.strictEqual(kal.body.data[0].status, 'available', 'tanggal berbasis jam tidak boleh jadi penuh');
    const jam = await api(`/services/${v.serviceId}/jam?date=${TGL_A}`);
    assert.strictEqual(jam.status, 200);
    assert.deepStrictEqual(jam.body.terisi.map((t) => [t.mulai, t.selesai]), [[480, 780], [780, 1080]],
      `rentang terisi salah: ${JSON.stringify(jam.body.terisi)}`);
    ok('/services/:id/jam membalas rentang terkunci termasuk jeda');

    const cekBentrok = await api('/schedules/check', {
      method: 'POST', body: { service_id: v.serviceId, event_date: TGL_A, start_time: '10:00' },
    });
    const cekKosong = await api('/schedules/check', {
      method: 'POST', body: { service_id: v.serviceId, event_date: TGL_A, start_time: '18:00' },
    });
    assert.strictEqual(cekBentrok.body.available, false);
    assert.strictEqual(cekKosong.body.available, true, JSON.stringify(cekKosong.body));
    ok('/schedules/check sepakat dengan createBooking soal jam');

    // Jam tambahan: ditolak selama vendor belum memasang harganya.
    const tanpaHarga = await pesan(await register('customer'), v.serviceId, TGL_B, '08:00', 1, 2);
    assert.strictEqual(tanpaHarga.status, 400, 'jam tambahan tanpa harga harusnya ditolak');
    const atur = await aturPaket(v, { durasi_menit: 240, per_orang: false, harga_per_jam_tambahan: 200000 });
    assert.strictEqual(atur.status, 200, JSON.stringify(atur.body));
    const tambah = await pesan(await register('customer'), v.serviceId, TGL_B, '08:00', 1, 2);
    assert.strictEqual(tambah.status, 201, JSON.stringify(tambah.body));
    assert.strictEqual(tambah.body.booking.durasi_menit, 360, '4 jam + 2 jam tambahan');
    assert.strictEqual(Number(tambah.body.booking.total_price), 1400000, 'harga paket + 2 x 200 ribu');
    ok('jam tambahan: rentang jadi 6 jam, harga + 2 x Rp200.000');

    // Jeda disalin ke pesanan: mengubahnya tidak memendekkan kunci pesanan lama.
    const u = await api(`/vendors/${v.vendorId}`, { method: 'PATCH', token: v.token, body: { jeda_menit: 0 } });
    assert.strictEqual(u.body.vendor.jeda_menit, 0);
    const masihJeda = await pesan(await register('customer'), v.serviceId, TGL_A, '17:00');
    assert.strictEqual(masihJeda.status, 409, 'pesanan 13:00 masih menyimpan jeda 60 menitnya');
    ok('jeda baru tidak menggeser pesanan lama (17:00 tetap terkunci)');

    // Menyeberang tengah malam: 20:00 + 4 jam + 6 jam tambahan = 06:00 besok.
    const malam = await pesan(await register('customer'), v.serviceId, TGL_B, '20:00', 1, 6);
    assert.strictEqual(malam.status, 201, JSON.stringify(malam.body));
    const subuh = await pesan(await register('customer'), v.serviceId, TGL_C, '05:00');
    assert.strictEqual(subuh.status, 409, 'rentang semalam harusnya memblok besok subuh');
    const pagi = await pesan(await register('customer'), v.serviceId, TGL_C, '06:00');
    assert.strictEqual(pagi.status, 201, 'sesudah 06:00 (jeda 0) harusnya bebas');
    ok('rentang lewat tengah malam memblok 05:00 besoknya, 06:00 bebas');

    // Lapis ketiga: sisipkan langsung ke tabel, melewati aplikasi sama sekali.
    let kode = null;
    try {
      await pool.query(
        `INSERT INTO bookings (user_id, service_id, vendor_id, event_date, start_time, per_tim,
                               slot_ke, quantity, event_type, event_location_detail, total_price,
                               dp_amount, soft_lock_expires_at, durasi_menit, jam_tambahan, jeda_menit)
         SELECT user_id, service_id, vendor_id, event_date, '09:00', per_tim, slot_ke, quantity,
                event_type, event_location_detail, total_price, dp_amount, soft_lock_expires_at,
                60, 0, 0
           FROM bookings WHERE booking_id = $1`,
        [a.body.booking.booking_id]
      );
    } catch (e) {
      kode = e.code;
    }
    assert.strictEqual(kode, '23P01', 'constraint EXCLUDE harusnya menolak rentang bertumpuk');
    ok('constraint DB menolak tumpang tindih walau aplikasi dilewati (23P01)');
  }

  // --- 3. MUA per orang, dua tim ----------------------------------------
  console.log('\nPaket per orang (MUA, 45 menit/orang, 2 tim):');
  {
    const v = await siapkanVendor('makeup_artist', 2);
    const atur = await aturPaket(v, { durasi_menit: 45, per_orang: true, harga_per_jam_tambahan: null });
    assert.strictEqual(atur.status, 200, JSON.stringify(atur.body));
    assert.strictEqual(atur.body.service.per_orang, true);

    const a = await pesan(await register('customer'), v.serviceId, TGL_A, '08:00', 5);
    assert.strictEqual(a.status, 201, `pesanan 5 orang gagal: ${JSON.stringify(a.body)}`);
    assert.strictEqual(a.body.booking.durasi_menit, 240, '5 x 45 menit = 225, dibulatkan 4 jam');
    assert.strictEqual(Number(a.body.booking.total_price), 5000000, 'harga harus dikali jumlah orang');
    assert.strictEqual(Number(a.body.booking.dp_amount), 1500000, 'DP harus ikut jumlah orang');
    ok('5 orang: 4 jam (225 menit dibulatkan), harga x 5');

    const b = await pesan(await register('customer'), v.serviceId, TGL_A, '08:00', 1);
    assert.strictEqual(b.status, 201, 'tim kedua harusnya masih bisa di jam yang sama');
    assert.strictEqual(b.body.booking.slot_ke, 1, 'tim kedua harus memegang nomor 1');
    ok('jam yang sama diterima tim kedua');

    const c = await pesan(await register('customer'), v.serviceId, TGL_A, '09:00', 1);
    assert.strictEqual(c.status, 409, 'dua tim sedang sibuk');
    ok('09:00 ditolak: kedua tim sibuk');

    const tambah = await pesan(await register('customer'), v.serviceId, TGL_B, '08:00', 1, 1);
    assert.strictEqual(tambah.status, 400, 'paket tanpa harga jam tambahan harusnya menolak');
    ok('jam tambahan ditolak di paket tanpa harga per jam');

    // Lima orang berebut dua tim di jam yang sama: tepat dua yang lolos.
    const tokens = [];
    for (let i = 0; i < 5; i++) tokens.push(await register('customer'));
    const hasil = await Promise.all(tokens.map((t) => pesan(t, v.serviceId, TGL_C, '10:00', 1)));
    const sukses = hasil.filter((r) => r.status === 201).length;
    console.log(`  201: ${sukses}  409: ${hasil.filter((r) => r.status === 409).length}`);
    assert.strictEqual(sukses, 2, 'harus tepat 2 yang berhasil');
    ok('ditembak bersamaan: tepat 2 tim yang terisi');

    const sesi = await siapkanVendor('makeup_artist');
    const dua = await pesan(await register('customer'), sesi.serviceId, TGL_A, '08:00', 2);
    assert.strictEqual(dua.status, 400, 'paket per sesi tidak menerima jumlah orang');
    ok('paket per sesi menolak jumlah orang > 1');
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
