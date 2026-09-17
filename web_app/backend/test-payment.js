// Uji alur pembayaran ujung ke ujung dalam MODE SIMULASI (MIDTRANS_SERVER_KEY
// kosong). Membuktikan: DP 30% dihitung dari DB, VA terbit, pelunasan menunggu
// DP, status booking maju, slot terkunci, dan pembayaran ganda ditolak.
// Jalankan dengan server hidup: node test-payment.js
require('dotenv').config();
const assert = require('assert');
const pool = require('./src/config/db');

// Semua email yang dibuat skrip ini, supaya bisa dibersihkan di akhir.
const dibuat = [];

const BASE = process.env.BASE_URL || 'http://localhost:4000/api/v1';
const PRICE = 1000000;
const DP_RATE = 0.3;

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
      name: `P ${tag}`, email: `p${tag}@mail.com`, phone: `0813${tag}`,
      password: 'password123', role,
    },
  });
  assert.strictEqual(r.status, 201, `register ${role} gagal: ${JSON.stringify(r.body)}`);
  dibuat.push(`p${tag}@mail.com`);
  return r.body.token;
}

const futureDate = (d = 90) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

let pass = 0;
function ok(label) {
  pass++;
  console.log(`  OK  ${label}`);
}

(async () => {
  // --- Persiapan: vendor, layanan, slot, booking ---------------------------
  const vendorToken = await register('vendor_owner');

  const vendor = await api('/vendors', {
    method: 'POST', token: vendorToken,
    body: { business_name: `Payment Test ${uniq()}`, city: 'depok' },
  });
  assert.strictEqual(vendor.status, 201, `buat vendor gagal: ${JSON.stringify(vendor.body)}`);

  const service = await api(`/vendors/${vendor.body.vendor.vendor_id}/services`, {
    method: 'POST', token: vendorToken,
    body: {
      service_name: 'Paket Uji Pembayaran', category: 'photographer',
      price: PRICE, minimum_notice_days: 1,
    },
  });
  assert.strictEqual(service.status, 201, `buat service gagal: ${JSON.stringify(service.body)}`);

  const eventDate = futureDate();
  const sch = await api('/schedules', {
    method: 'POST', token: vendorToken,
    body: { slots: [{ event_date: eventDate, time_slot: 'pagi' }] },
  });
  assert.strictEqual(sch.status, 201, `buat schedule gagal: ${JSON.stringify(sch.body)}`);

  const customerToken = await register('customer');
  const booking = await api('/bookings', {
    method: 'POST', token: customerToken,
    body: {
      service_id: service.body.service.service_id,
      event_date: eventDate, time_slot: 'pagi',
      event_type: 'wedding', event_location_detail: 'Gedung Uji, Depok',
    },
  });
  assert.strictEqual(booking.status, 201, `buat booking gagal: ${JSON.stringify(booking.body)}`);
  const bookingId = booking.body.booking.booking_id;

  // Sejak migrasi 009 pesanan harus diterima vendornya dulu; charge menolak
  // 409 selama statusnya masih 'menunggu'.
  const diterima = await api(`/bookings/${bookingId}/konfirmasi`, {
    method: 'PATCH', token: vendorToken, body: { action: 'terima' },
  });
  assert.strictEqual(diterima.status, 200, `vendor gagal menerima pesanan: ${JSON.stringify(diterima.body)}`);

  console.log('\nAlur pembayaran:');

  // --- 1. DP dihitung backend, bukan dikirim browser ----------------------
  assert.strictEqual(
    Number(booking.body.booking.dp_amount), PRICE * DP_RATE,
    `dp_amount harusnya ${PRICE * DP_RATE}, dapat ${booking.body.booking.dp_amount}`
  );
  ok(`dp_amount = ${PRICE * DP_RATE} (30% dari ${PRICE}), dihitung backend`);

  // --- 2. Pelunasan ditolak selama DP belum lunas -------------------------
  const earlySettle = await api('/payments/charge', {
    method: 'POST', token: customerToken,
    body: { booking_id: bookingId, payment_type: 'settlement', method: 'bca_va' },
  });
  assert.strictEqual(earlySettle.status, 409, `harusnya 409, dapat ${earlySettle.status}`);
  ok('pelunasan sebelum DP ditolak 409');

  // --- 3. Bank ngawur ditolak --------------------------------------------
  const badBank = await api('/payments/charge', {
    method: 'POST', token: customerToken,
    body: { booking_id: bookingId, payment_type: 'down_payment', method: 'metode_ngawur' },
  });
  assert.strictEqual(badBank.status, 400, `harusnya 400, dapat ${badBank.status}`);
  ok('metode tidak didukung ditolak 400');

  // --- 4. Booking orang lain = 404, bukan 403 ----------------------------
  const orangLain = await register('customer');
  const curi = await api('/payments/charge', {
    method: 'POST', token: orangLain,
    body: { booking_id: bookingId, payment_type: 'down_payment', method: 'bca_va' },
  });
  assert.strictEqual(curi.status, 404, `harusnya 404 (bukan 403), dapat ${curi.status}`);
  ok('booking milik user lain dibalas 404, ID valid tidak bocor');

  // --- 5. Terbitkan VA untuk DP ------------------------------------------
  const dp = await api('/payments/charge', {
    method: 'POST', token: customerToken,
    body: { booking_id: bookingId, payment_type: 'down_payment', method: 'bca_va' },
  });
  assert.strictEqual(dp.status, 201, `charge DP gagal: ${JSON.stringify(dp.body)}`);
  assert.ok(dp.body.payment.details.va_number, 'details.va_number kosong');
  assert.strictEqual(Number(dp.body.payment.amount), PRICE * DP_RATE, 'nominal VA bukan 30%');
  assert.ok(dp.body.payment.expires_at, 'expires_at kosong — batas waktu harus dari DB');
  ok(`VA terbit: ${dp.body.payment.details.va_number}, nominal ${dp.body.payment.amount}, expires_at terisi`);

  // --- 6. Charge ulang memakai VA yang sama, bukan bikin baru -------------
  const ulang = await api('/payments/charge', {
    method: 'POST', token: customerToken,
    body: { booking_id: bookingId, payment_type: 'down_payment', method: 'bca_va' },
  });
  assert.strictEqual(ulang.body.reused, true, 'harusnya memakai ulang VA yang masih aktif');
  assert.strictEqual(
    ulang.body.payment.payment_id, dp.body.payment.payment_id,
    'VA kedua berbeda — user akan bingung harus transfer ke mana'
  );
  ok('charge ulang mengembalikan VA yang sama, tidak bikin sampah di gateway');

  // --- Sapuan semua metode -----------------------------------------------
  // Tiap metode dapat booking sendiri (satu slot cuma boleh sekali dipesan).
  // Sengaja tidak memakai assert: kalau satu metode ditolak gateway, kita mau
  // tahu metode mana, bukan seluruh tes berhenti di situ.
  const METODE = [
    ['bca_va', 'va_number'], ['bni_va', 'va_number'], ['bri_va', 'va_number'],
    ['cimb_va', 'va_number'], ['permata_va', 'va_number'],
    ['mandiri_bill', 'bill_key'],
    ['qris', 'qr_url'], ['gopay', 'qr_url'],
    ['indomaret', 'payment_code'], ['alfamart', 'payment_code'],
  ];

  console.log('\nSapuan 10 metode pembayaran:');
  const gagal = [];

  for (const [i, [metode, fieldWajib]] of METODE.entries()) {
    const tgl = futureDate(120 + i);
    await api('/schedules', {
      method: 'POST', token: vendorToken,
      body: { slots: [{ event_date: tgl, time_slot: 'pagi' }] },
    });

    const bk = await api('/bookings', {
      method: 'POST', token: customerToken,
      body: {
        service_id: service.body.service.service_id,
        event_date: tgl, time_slot: 'pagi',
        event_type: 'wedding', event_location_detail: 'Gedung Uji, Depok',
      },
    });

    const c = await api('/payments/charge', {
      method: 'POST', token: customerToken,
      body: { booking_id: bk.body.booking.booking_id, payment_type: 'down_payment', method: metode },
    });

    const nilai = c.body && c.body.payment && c.body.payment.details
      ? c.body.payment.details[fieldWajib] : null;

    if (c.status === 201 && nilai) {
      console.log(`  OK  ${metode.padEnd(13)} ${fieldWajib} = ${String(nilai).slice(0, 42)}`);
      pass++;
    } else {
      const sebab = c.body && c.body.message ? c.body.message : `${fieldWajib} kosong`;
      console.log(`  X   ${metode.padEnd(13)} (${c.status}) ${sebab}`);
      gagal.push(metode);
    }
  }

  if (gagal.length) console.log(`  -> metode bermasalah: ${gagal.join(', ')}`);

  // Sisa skenario butuh pembayaran benar-benar masuk. Dalam mode simulasi kita
  // bisa memicunya sendiri; kalau Midtrans aktif, VA-nya harus dibayar lewat
  // simulator di dashboard Midtrans, jadi bagian itu dilewati.
  const modeSimulasi = dp.body.simulated === true;

  if (!modeSimulasi) {
    console.log('\n  -- Midtrans AKTIF, skenario 7-11 dilewati --');
    console.log('     Bayar VA di dashboard Midtrans > Transactions, lalu:');
    console.log(`     POST /payments/${dp.body.payment.payment_id}/refresh`);

    const refreshAktif = await api(`/payments/${dp.body.payment.payment_id}/refresh`, {
      method: 'POST', token: customerToken,
    });
    assert.strictEqual(refreshAktif.status, 200, `refresh gagal: ${JSON.stringify(refreshAktif.body)}`);
    assert.ok(refreshAktif.body.gateway_status, 'gateway_status kosong');
    ok(`refresh bertanya ke Midtrans, status gateway: ${refreshAktif.body.gateway_status}`);

    const curiRefresh = await api(`/payments/${dp.body.payment.payment_id}/refresh`, {
      method: 'POST', token: orangLain,
    });
    assert.strictEqual(curiRefresh.status, 404, `harusnya 404, dapat ${curiRefresh.status}`);
    ok('refresh payment milik user lain dibalas 404 sebelum menyentuh gateway');

    const palsuAktif = await api('/payments/webhook', {
      method: 'POST',
      body: {
        order_id: dp.body.payment.payment_id, status_code: '200',
        gross_amount: '300000.00', transaction_status: 'settlement',
        signature_key: 'jelas-palsu',
      },
    });
    assert.strictEqual(palsuAktif.status, 403, `webhook palsu harusnya 403, dapat ${palsuAktif.status}`);
    ok('webhook dengan signature palsu ditolak 403 (jalur Midtrans asli)');

    console.log(`\n${pass} skenario lolos (mode Midtrans aktif).\n`);
    return;
  }

  // --- 7. Bayar (simulasi) -> booking jadi dp_paid ------------------------
  const bayarDp = await api(`/payments/${dp.body.payment.payment_id}/simulate`, {
    method: 'POST', token: customerToken,
  });
  assert.strictEqual(bayarDp.status, 200, `simulate gagal: ${JSON.stringify(bayarDp.body)}`);
  ok('DP ditandai lunas lewat endpoint simulasi');

  const cek1 = await api(`/payments/booking/${bookingId}`, { token: customerToken });
  assert.strictEqual(cek1.body.payments[0].gateway_status, 'success');
  assert.ok(cek1.body.payments[0].paid_at, 'paid_at kosong');
  ok('status payment jadi success, paid_at terisi');

  // --- 8. Simulasi diulang tidak menggandakan apa pun --------------------
  const ulangBayar = await api(`/payments/${dp.body.payment.payment_id}/simulate`, {
    method: 'POST', token: customerToken,
  });
  assert.strictEqual(ulangBayar.status, 200);
  const cek2 = await api(`/payments/booking/${bookingId}`, { token: customerToken });
  assert.strictEqual(cek2.body.payments.length, 1, 'pembayaran tercatat dobel!');
  ok('notifikasi/simulasi berulang idempoten, tidak tercatat dobel');

  // --- 9. Slot terkunci: user lain tidak bisa booking ---------------------
  const cekSlot = await api('/schedules/check', {
    method: 'POST',
    body: {
      service_id: service.body.service.service_id,
      event_date: eventDate, time_slot: 'pagi',
    },
  });
  assert.strictEqual(cekSlot.body.available, false, 'slot harusnya sudah terkunci setelah DP');
  ok('slot jadi booked setelah DP masuk, tidak bisa dipesan user lain');

  // --- 10. DP tidak bisa dibayar dua kali --------------------------------
  const dpLagi = await api('/payments/charge', {
    method: 'POST', token: customerToken,
    body: { booking_id: bookingId, payment_type: 'down_payment', method: 'bca_va' },
  });
  assert.strictEqual(dpLagi.status, 409, `harusnya 409, dapat ${dpLagi.status}`);
  ok('DP kedua ditolak 409');

  // --- 11. Pelunasan: sisa harga, bukan harga penuh ----------------------
  const lunas = await api('/payments/charge', {
    method: 'POST', token: customerToken,
    body: { booking_id: bookingId, payment_type: 'settlement', method: 'bni_va' },
  });
  assert.strictEqual(lunas.status, 201, `charge pelunasan gagal: ${JSON.stringify(lunas.body)}`);
  assert.strictEqual(
    Number(lunas.body.payment.amount), PRICE - PRICE * DP_RATE,
    `pelunasan harusnya ${PRICE - PRICE * DP_RATE}, dapat ${lunas.body.payment.amount}`
  );
  ok(`pelunasan menagih sisa ${PRICE - PRICE * DP_RATE}, bukan harga penuh`);

  await api(`/payments/${lunas.body.payment.payment_id}/simulate`, {
    method: 'POST', token: customerToken,
  });
  const cek3 = await api(`/payments/booking/${bookingId}`, { token: customerToken });
  assert.strictEqual(cek3.body.payments.length, 2, 'harusnya ada 2 baris payment');
  const total = cek3.body.payments.reduce((s, p) => s + Number(p.amount), 0);
  assert.strictEqual(total, PRICE, `DP + pelunasan harusnya ${PRICE}, dapat ${total}`);
  ok(`DP + pelunasan = ${total}, pas dengan total_price`);

  // --- 12. Webhook tanpa signature valid ditolak -------------------------
  const palsu = await api('/payments/webhook', {
    method: 'POST',
    body: {
      order_id: dp.body.payment.payment_id, status_code: '200',
      gross_amount: '300000.00', transaction_status: 'settlement',
      signature_key: 'jelas-palsu',
    },
  });
  assert.ok(
    [403, 503].includes(palsu.status),
    `webhook palsu harusnya ditolak, dapat ${palsu.status}`
  );
  ok(`webhook tanpa signature sah ditolak ${palsu.status}`);

  // --- 13. refresh: kepemilikan dicek sebelum menghubungi gateway --------
  const refreshOrangLain = await api(`/payments/${dp.body.payment.payment_id}/refresh`, {
    method: 'POST', token: orangLain,
  });
  assert.ok(
    [404, 409].includes(refreshOrangLain.status),
    `refresh milik orang lain harusnya ditolak, dapat ${refreshOrangLain.status}`
  );
  ok(`refresh payment milik user lain ditolak ${refreshOrangLain.status}`);

  // --- 14. refresh dimatikan kalau Midtrans tidak aktif ------------------
  const refreshOff = await api(`/payments/${dp.body.payment.payment_id}/refresh`, {
    method: 'POST', token: customerToken,
  });
  assert.strictEqual(refreshOff.status, 409, `harusnya 409, dapat ${refreshOff.status}`);
  ok('refresh dibalas 409 saat mode simulasi, diarahkan ke /simulate');

  console.log(`\n${pass} skenario lolos.\n`);
})()
  .catch((err) => {
    console.error('\nGAGAL:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Bersihkan data uji apa pun hasilnya. bookings.user_id dan .service_id
    // pakai ON DELETE RESTRICT, jadi booking dibuang lebih dulu; payments,
    // vendors, services, dan schedules ikut lewat CASCADE.
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
