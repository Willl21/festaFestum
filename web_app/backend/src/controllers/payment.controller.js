const pool = require('../config/db');
const midtrans = require('../config/midtrans');

const VALID_TYPES = ['down_payment', 'settlement'];

// Berapa lama VA berlaku. Dikirim ke Midtrans sebagai custom_expiry SEKALIGUS
// disimpan di kolom expires_at, supaya angka yang dilihat user di halaman VA
// sama persis dengan yang dipegang gateway.
const VA_EXPIRY_HOURS = 24;

// Sisi sukses dari sebuah pembayaran: tandai payment lunas, majukan status
// booking, dan kunci slotnya. Dipakai bersama oleh webhook Midtrans dan
// endpoint simulasi supaya dua jalur itu tidak pernah berbeda perilaku.
//
// Idempoten: kalau baris payment sudah 'success', tidak ada yang berubah.
// Midtrans mengirim notifikasi yang sama berkali-kali, jadi ini wajib.
async function applySuccess(client, paymentId, gatewayTxnId) {
  const upd = await client.query(
    `UPDATE payments
        SET gateway_status = 'success',
            paid_at = COALESCE(paid_at, now()),
            gateway_transaction_id = COALESCE(gateway_transaction_id, $2)
      WHERE payment_id = $1 AND gateway_status <> 'success'
      RETURNING booking_id, payment_type`,
    [paymentId, gatewayTxnId || null]
  );

  if (upd.rows.length === 0) return { changed: false };

  const { booking_id, payment_type } = upd.rows[0];

  if (payment_type === 'down_payment') {
    await client.query(
      `UPDATE bookings SET payment_status = 'dp_paid', updated_at = now()
        WHERE booking_id = $1 AND payment_status = 'pending'`,
      [booking_id]
    );
  } else {
    await client.query(
      `UPDATE bookings SET payment_status = 'fully_paid', updated_at = now()
        WHERE booking_id = $1 AND payment_status = 'dp_paid'`,
      [booking_id]
    );
  }

  return { changed: true, booking_id, payment_type };
}

// Menerapkan satu status hasil terjemahan dari Midtrans ke sebuah payment.
// Dipakai bersama oleh webhook (Midtrans yang memberi tahu kita) dan refresh
// (kita yang bertanya ke Midtrans) — dua jalur itu harus identik hasilnya,
// jadi logikanya sengaja cuma ada di satu tempat.
async function applyGatewayStatus(client, paymentId, status, gatewayTxnId) {
  const pay = await client.query(
    `SELECT payment_id, gateway_status FROM payments WHERE payment_id = $1 FOR UPDATE`,
    [paymentId]
  );

  if (pay.rows.length === 0) return { found: false };

  if (status === 'success') {
    await applySuccess(client, paymentId, gatewayTxnId);
  } else if (pay.rows[0].gateway_status !== 'success') {
    // Jangan pernah menurunkan status yang sudah sukses.
    await client.query(
      `UPDATE payments
          SET gateway_status = $2,
              gateway_transaction_id = COALESCE(gateway_transaction_id, $3)
        WHERE payment_id = $1`,
      [paymentId, status, gatewayTxnId || null]
    );
  }

  return { found: true };
}

// Isi palsu untuk mode simulasi, bentuknya sama persis dengan yang dikirim
// Midtrans supaya halaman pembayaran di frontend tidak perlu tahu bedanya.
function simulatedDetails(method) {
  const angka = Date.now().toString().slice(-11);

  if (method.endsWith('_va')) {
    return { bank: method.replace('_va', ''), va_number: `8${angka}` };
  }
  if (method === 'mandiri_bill') {
    return { bill_key: angka.slice(-7), biller_code: '70012' };
  }
  if (method === 'qris' || method === 'gopay') {
    // QR kosong yang tetap merender sebagai gambar, jadi tata letaknya teruji.
    return { qr_url: 'https://api.sandbox.midtrans.com/v2/qris/simulasi.png' };
  }
  if (method === 'indomaret' || method === 'alfamart') {
    return { payment_code: angka.slice(-8), store: method };
  }
  return { redirect_url: 'https://simulator.sandbox.midtrans.com/' };
}

// POST /api/v1/payments/charge  (login)
// Body: { booking_id, payment_type: 'down_payment'|'settlement', method }
async function charge(req, res, next) {
  const { booking_id, payment_type, method } = req.body;

  if (!booking_id || !payment_type || !method) {
    return res.status(400).json({ message: 'booking_id, payment_type, dan method wajib diisi' });
  }
  if (!VALID_TYPES.includes(payment_type)) {
    return res.status(400).json({ message: 'payment_type tidak valid', allowed: VALID_TYPES });
  }
  if (!midtrans.METHOD_IDS.includes(method)) {
    return res.status(400).json({ message: 'metode tidak didukung', allowed: midtrans.METHOD_IDS });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Kepemilikan ikut di WHERE, bukan if terpisah — booking milik orang lain
    // tidak ditemukan sama sekali, jadi balasannya 404 dan ID valid tidak bocor.
    // FOR UPDATE mencegah dua klik "Bayar" bersamaan bikin dua VA.
    const bk = await client.query(
      `SELECT booking_id, total_price, dp_amount, payment_status, confirm_status
         FROM bookings
        WHERE booking_id = $1 AND user_id = $2
        FOR UPDATE`,
      [booking_id, req.user.user_id]
    );

    if (bk.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Booking tidak ditemukan' });
    }

    const booking = bk.rows[0];

    // Pesanan baru boleh dibayar setelah vendornya setuju. Dijaga di sini,
    // bukan cuma dengan menyembunyikan tombolnya di frontend: URL halaman
    // checkout memakai booking_id dan bisa dibuka langsung.
    if (booking.confirm_status !== 'diterima') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: booking.confirm_status === 'ditolak'
          ? 'Pesanan ini ditolak vendor, jadi tidak bisa dibayar'
          : 'Vendor belum menerima pesanan ini',
      });
    }

    // Jumlah SELALU dihitung ulang dari DB. Angka dari browser tidak dipercaya.
    let amount;
    if (payment_type === 'down_payment') {
      if (booking.payment_status !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: `DP tidak bisa dibayar, status booking saat ini '${booking.payment_status}'`,
        });
      }
      amount = Math.round(Number(booking.dp_amount));
    } else {
      if (booking.payment_status !== 'dp_paid') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: `Pelunasan butuh DP lunas dulu, status booking saat ini '${booking.payment_status}'`,
        });
      }
      amount = Math.round(Number(booking.total_price) - Number(booking.dp_amount));
    }

    // Kalau sudah ada VA aktif untuk jenis yang sama, kembalikan yang itu.
    // Bikin VA baru tiap kali user refresh cuma bikin sampah di Midtrans dan
    // bikin user bingung harus transfer ke nomor yang mana.
    const existing = await client.query(
      `SELECT * FROM payments
        WHERE booking_id = $1 AND payment_type = $2
          AND gateway_status = 'pending'
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY created_at DESC LIMIT 1`,
      [booking_id, payment_type]
    );

    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      return res.json({ payment: existing.rows[0], reused: true });
    }

    const expiresAt = new Date(Date.now() + VA_EXPIRY_HOURS * 3600 * 1000);

    // Baris dibuat dulu supaya payment_id bisa dipakai sebagai order_id di
    // Midtrans. Satu percobaan bayar = satu baris = satu order_id unik, jadi
    // user yang mengulang setelah VA kedaluwarsa tidak ditolak "duplicate order".
    const ins = await client.query(
      `INSERT INTO payments (booking_id, payment_type, amount, expires_at, method)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [booking_id, payment_type, amount, expiresAt, method]
    );

    const payment = ins.rows[0];
    const spec = midtrans.METHODS[method];

    let details;
    let gatewayTxnId = null;

    if (midtrans.enabled) {
      const charged = await midtrans.core.charge({
        ...spec.build(amount),
        transaction_details: { order_id: payment.payment_id, gross_amount: amount },
        custom_expiry: { unit: 'hour', expiry_duration: VA_EXPIRY_HOURS },
      });
      details = spec.extract(charged);
      gatewayTxnId = charged.transaction_id || null;
    } else {
      details = simulatedDetails(method);
    }

    const done = await client.query(
      `UPDATE payments SET details = $2, gateway_transaction_id = $3
        WHERE payment_id = $1 RETURNING *`,
      [payment.payment_id, JSON.stringify(details), gatewayTxnId]
    );

    await client.query('COMMIT');
    res.status(201).json({ payment: done.rows[0], simulated: !midtrans.enabled });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // Kegagalan dari Midtrans bukan bug kita — bedakan supaya frontend bisa
    // menyuruh user coba lagi, bukan menampilkan "terjadi kesalahan".
    if (err.httpStatusCode || err.ApiResponse) {
      console.error('[midtrans] charge gagal:', err.message);
      return res.status(502).json({ message: 'Gateway pembayaran sedang tidak bisa dihubungi' });
    }
    next(err);
  } finally {
    client.release();
  }
}

// POST /api/v1/payments/webhook  (TANPA auth — yang memanggil Midtrans)
// Keamanannya bukan dari token, tapi dari verifikasi signature SHA512.
async function webhook(req, res, next) {
  const body = req.body || {};

  if (!midtrans.enabled) {
    return res.status(503).json({ message: 'Midtrans tidak aktif di server ini' });
  }
  if (!midtrans.verifySignature(body)) {
    console.warn('[midtrans] webhook signature tidak cocok, order_id:', body.order_id);
    return res.status(403).json({ message: 'Signature tidak valid' });
  }

  const status = midtrans.mapStatus(body.transaction_status, body.fraud_status);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { found } = await applyGatewayStatus(
      client, body.order_id, status, body.transaction_id
    );

    await client.query('COMMIT');

    // 200 walau tidak ditemukan: kalau kita balas error, Midtrans akan retry
    // terus untuk order_id yang memang tidak pernah ada di sini.
    res.json({ message: found ? 'OK' : 'Diabaikan, payment tidak dikenal' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

// GET /api/v1/payments/booking/:bookingId  (login)
// Cadangan kalau webhook tidak masuk (mis. backend masih di localhost).
async function listByBooking(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT p.*
         FROM payments p
         JOIN bookings b ON b.booking_id = p.booking_id
        WHERE p.booking_id = $1 AND b.user_id = $2
        ORDER BY p.created_at`,
      [req.params.bookingId, req.user.user_id]
    );
    res.json({ payments: rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/payments/:paymentId  (login)
// Satu tagihan beserta pesanannya, untuk halaman pembayaran. Kepemilikan ikut
// di WHERE lewat join ke bookings — 404 kalau bukan milik user ini.
async function getPayment(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, b.booking_id, b.total_price, b.dp_amount, b.payment_status,
              b.event_location_detail,
              s.service_name, s.category,
              v.business_name, v.city,
              b.event_date, to_char(b.start_time, 'HH24:MI') AS start_time
         FROM payments p
         JOIN bookings b ON b.booking_id = p.booking_id
         JOIN services s ON s.service_id = b.service_id
         JOIN vendors  v ON v.vendor_id  = s.vendor_id
        WHERE p.payment_id = $1 AND b.user_id = $2`,
      [req.params.paymentId, req.user.user_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Pembayaran tidak ditemukan' });
    }
    res.json({ payment: rows[0] });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/payments/:paymentId/refresh  (login)
//
// Kita yang bertanya ke Midtrans "pembayaran ini sudah masuk belum?", kebalikan
// dari webhook yang menunggu Midtrans memberi tahu. Gunanya: webhook butuh
// backend yang bisa dihubungi dari internet, sedangkan ini cuma butuh koneksi
// keluar biasa. Jadi alur pembayaran tetap maju walau backend masih di laptop.
//
// Webhook tetap jalur utama (lebih cepat, tidak boros request). Ini jaring
// pengaman, dan keduanya lewat applyGatewayStatus supaya hasilnya tidak
// mungkin berbeda.
async function refresh(req, res, next) {
  if (!midtrans.enabled) {
    return res.status(409).json({
      message: 'Midtrans tidak aktif — pakai POST /payments/:id/simulate',
    });
  }

  const client = await pool.connect();
  try {
    // Kepemilikan dicek dulu, sebelum menghubungi Midtrans: jangan sampai
    // endpoint ini bisa dipakai menebak payment_id milik orang lain.
    const own = await client.query(
      `SELECT p.payment_id
         FROM payments p
         JOIN bookings b ON b.booking_id = p.booking_id
        WHERE p.payment_id = $1 AND b.user_id = $2`,
      [req.params.paymentId, req.user.user_id]
    );

    if (own.rows.length === 0) {
      return res.status(404).json({ message: 'Pembayaran tidak ditemukan' });
    }

    let trx;
    try {
      trx = await midtrans.core.transaction.status(req.params.paymentId);
    } catch (err) {
      // 404 dari Midtrans = transaksi belum pernah terbentuk di sana.
      // Bukan error kita, dan bukan alasan menggagalkan polling frontend.
      if (err.httpStatusCode === '404' || err.httpStatusCode === 404) {
        return res.json({ status: 'pending', message: 'Belum tercatat di gateway' });
      }
      console.error('[midtrans] cek status gagal:', err.message);
      return res.status(502).json({ message: 'Gateway pembayaran sedang tidak bisa dihubungi' });
    }

    const status = midtrans.mapStatus(trx.transaction_status, trx.fraud_status);

    await client.query('BEGIN');
    await applyGatewayStatus(client, req.params.paymentId, status, trx.transaction_id);
    await client.query('COMMIT');

    const fresh = await client.query(
      'SELECT * FROM payments WHERE payment_id = $1',
      [req.params.paymentId]
    );

    res.json({ payment: fresh.rows[0], gateway_status: trx.transaction_status });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

// POST /api/v1/payments/:paymentId/simulate  (login)
// Jaring pengaman demo: menandai lunas tanpa gateway. Sengaja DIMATIKAN kalau
// Midtrans aktif — di sandbox sudah ada simulator resmi di dashboard, dan
// endpoint ini tidak boleh punya jalan hidup di production.
async function simulate(req, res, next) {
  if (midtrans.enabled) {
    return res.status(403).json({
      message: 'Midtrans aktif — gunakan simulator di dashboard Midtrans',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pay = await client.query(
      `SELECT p.payment_id
         FROM payments p
         JOIN bookings b ON b.booking_id = p.booking_id
        WHERE p.payment_id = $1 AND b.user_id = $2
        FOR UPDATE OF p`,
      [req.params.paymentId, req.user.user_id]
    );

    if (pay.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Pembayaran tidak ditemukan' });
    }

    const result = await applySuccess(client, req.params.paymentId, null);
    await client.query('COMMIT');

    res.json({ message: result.changed ? 'Pembayaran ditandai lunas' : 'Sudah lunas sebelumnya' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { charge, webhook, listByBooking, getPayment, refresh, simulate };
