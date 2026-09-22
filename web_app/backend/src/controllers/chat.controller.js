const pool = require('../config/db');
const { vendorIdMilik } = require('../lib/saldo');

// ------------------------------------------------------------
// OBROLAN
//
// Tiga jenis percakapan (lihat migrasi 015): klien<->vendor per pesanan,
// klien<->admin, dan vendor<->admin. Yang membedakan siapa boleh masuk cuma
// satu fungsi, syaratAkses(), dan seluruh endpoint di bawah memakainya lewat
// klausa WHERE — bukan if terpisah — mengikuti pola anti-IDOR di controller
// lain. Percakapan milik orang lain karena itu dibalas 404, bukan 403.
//
// Admin sengaja tidak ditugaskan per tiket: semua admin melihat dan membalas
// antrean yang sama, sama seperti antrean kurasi vendor.
// ------------------------------------------------------------

// Potongan WHERE + parameternya yang membatasi percakapan mana yang boleh
// disentuh pemanggil. Dikembalikan sebagai string supaya bisa ditempel di
// query mana pun, dengan nomor parameter yang dimulai dari `mulai`.
async function syaratAkses(user, mulai) {
  if (user.role === 'admin') {
    // Admin cuma punya urusan dengan dua jenis tiket; obrolan klien-vendor
    // bukan jatahnya, dan mockup admin pun tidak menampilkannya.
    return { sql: "c.jenis IN ('admin_klien', 'admin_vendor')", params: [] };
  }

  if (user.role === 'vendor_owner') {
    const vendorId = await vendorIdMilik(pool, user.user_id);
    // Vendor tanpa profil belum punya percakapan apa pun; NULL bikin
    // perbandingannya selalu gagal, jadi tidak perlu cabang sendiri.
    return { sql: `c.vendor_id = $${mulai}`, params: [vendorId] };
  }

  return { sql: `c.user_id = $${mulai}`, params: [user.user_id] };
}

// Nama lawan bicara + konteks pesanannya, dipakai daftar maupun kepala
// percakapan. Ditulis sekali supaya dua endpoint tidak menyusun kolom yang
// sedikit berbeda.
const KOLOM_PERCAKAPAN = `
  c.conversation_id, c.jenis, c.booking_id, c.last_message_at,
  c.user_id, c.vendor_id,
  u.name AS nama_klien,
  v.business_name AS nama_vendor,
  s.category,
  b.event_date, b.event_type, b.payment_status, b.confirm_status, b.total_price
`;

const DARI_PERCAKAPAN = `
  FROM conversations c
  LEFT JOIN users u    ON u.user_id = c.user_id
  LEFT JOIN vendors v  ON v.vendor_id = c.vendor_id
  LEFT JOIN bookings b ON b.booking_id = c.booking_id
  LEFT JOIN services s ON s.service_id = b.service_id
`;

// GET /api/v1/chat?jenis=
// Daftar percakapan milik pemanggil, terbaru di atas, lengkap dengan cuplikan
// pesan terakhir dan jumlah yang belum dibaca.
//
// Dua LATERAL, bukan N query susulan: pola "ambil daftar lalu tanya pesan
// terakhir satu per satu" yang bikin halaman vendor melambat begitu tiketnya
// banyak.
async function listConversations(req, res, next) {
  try {
    const { sql, params } = await syaratAkses(req.user, 1);
    const p = [...params];
    let filter = '';
    if (req.query.jenis) {
      p.push(req.query.jenis);
      filter = ` AND c.jenis = $${p.length}`;
    }
    p.push(req.user.user_id);
    const aku = `$${p.length}`;

    const { rows } = await pool.query(
      `SELECT ${KOLOM_PERCAKAPAN},
              t.body AS pesan_terakhir, t.created_at AS pesan_terakhir_at,
              t.sender_user_id AS pesan_terakhir_dari,
              COALESCE(n.jumlah, 0)::int AS belum_dibaca
         ${DARI_PERCAKAPAN}
         LEFT JOIN LATERAL (
           SELECT m.body, m.created_at, m.sender_user_id
             FROM messages m
            WHERE m.conversation_id = c.conversation_id
            ORDER BY m.created_at DESC
            LIMIT 1
         ) t ON TRUE
         LEFT JOIN LATERAL (
           SELECT count(*) AS jumlah
             FROM messages m
            WHERE m.conversation_id = c.conversation_id
              AND m.read_at IS NULL
              AND m.sender_user_id <> ${aku}
         ) n ON TRUE
        WHERE ${sql}${filter}
        ORDER BY c.last_message_at DESC`,
      p
    );

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/chat
// Body: { booking_id } untuk obrolan pesanan, atau { jenis: 'admin_klien' |
// 'admin_vendor' } untuk membuka tiket ke admin. Admin membuka duluan ke pihak
// lain dengan { jenis, user_id } / { jenis, vendor_id }.
//
// Idempoten: dipanggil dua kali membalas ruang yang sama, dijamin tiga indeks
// unik parsial di migrasi 015. Tombol "Hubungi Vendor" karena itu boleh
// ditekan berkali-kali tanpa menumpuk ruang kosong.
async function openConversation(req, res, next) {
  try {
    const { booking_id: bookingId, jenis } = req.body || {};

    let isi;
    if (bookingId) {
      // Kepemilikan pesanan ikut di WHERE: yang boleh membuka obrolan sebuah
      // pesanan cuma pemesannya atau vendor yang dipesan.
      const { rows } = await pool.query(
        `SELECT b.booking_id, b.user_id, s.vendor_id
           FROM bookings b
           JOIN services s ON s.service_id = b.service_id
          WHERE b.booking_id = $1
            AND (b.user_id = $2
                 OR s.vendor_id IN (SELECT vendor_id FROM vendors WHERE owner_user_id = $2))`,
        [bookingId, req.user.user_id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Pesanan tidak ditemukan' });
      }
      isi = {
        jenis: 'klien_vendor',
        booking_id: rows[0].booking_id,
        user_id: rows[0].user_id,
        vendor_id: rows[0].vendor_id,
      };
    } else if (jenis === 'admin_klien' || jenis === 'admin_vendor') {
      if (req.user.role === 'admin') {
        const { user_id: userId, vendor_id: vendorId } = req.body;
        if (jenis === 'admin_klien' && !userId) {
          return res.status(400).json({ message: 'user_id wajib diisi' });
        }
        if (jenis === 'admin_vendor' && !vendorId) {
          return res.status(400).json({ message: 'vendor_id wajib diisi' });
        }
        isi = { jenis, user_id: userId || null, vendor_id: vendorId || null };
      } else if (jenis === 'admin_vendor') {
        const vendorId = await vendorIdMilik(pool, req.user.user_id);
        if (!vendorId) {
          return res.status(400).json({ message: 'Lengkapi profil vendor dulu' });
        }
        isi = { jenis, user_id: null, vendor_id: vendorId };
      } else {
        isi = { jenis, user_id: req.user.user_id, vendor_id: null };
      }
    } else {
      return res.status(400).json({ message: 'Sebutkan booking_id atau jenis obrolan' });
    }

    const { rows: dibuat } = await pool.query(
      `INSERT INTO conversations (jenis, booking_id, user_id, vendor_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING conversation_id`,
      [isi.jenis, isi.booking_id || null, isi.user_id, isi.vendor_id]
    );

    const id = dibuat[0]?.conversation_id;
    const { rows } = await pool.query(
      `SELECT ${KOLOM_PERCAKAPAN} ${DARI_PERCAKAPAN}
        WHERE c.conversation_id = COALESCE($1::uuid, (
          SELECT conversation_id FROM conversations
           WHERE jenis = $2
             AND booking_id IS NOT DISTINCT FROM $3::uuid
             AND user_id IS NOT DISTINCT FROM $4::uuid
             AND vendor_id IS NOT DISTINCT FROM $5::uuid
        ))`,
      [id || null, isi.jenis, isi.booking_id || null, isi.user_id, isi.vendor_id]
    );

    res.status(dibuat.length ? 201 : 200).json({ conversation: rows[0] });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/chat/:conversationId
// Isi percakapan. Membuka = membaca, jadi pesan lawan bicara sekalian ditandai
// terbaca di sini — tidak ada endpoint "tandai dibaca" tersendiri.
//
// Tiga query yang dulu BERURUTAN bikin endpoint ini ~440 ms, sepuluh kali
// endpoint obrolan lain. Dua hal yang diperbaiki:
//   1. Kepala dan isi percakapan diambil BERSAMAAN. Keduanya tidak saling
//      bergantung, jadi menunggunya bergantian cuma menambah satu perjalanan
//      pulang-pergi ke Supabase.
//   2. UPDATE penanda terbaca cuma jalan kalau memang ADA yang belum dibaca.
//      Halaman menarik ulang tiap 10 detik, dan hampir semua tarikan itu tidak
//      membawa pesan baru — dulu tiap satunya tetap membuka transaksi tulis.
// Pemeriksaan aksesnya tetap di klausa WHERE kedua query, bukan dipindah ke if.
async function getMessages(req, res, next) {
  try {
    const { sql, params } = await syaratAkses(req.user, 2);
    const id = req.params.conversationId;

    const [kepala, isi] = await Promise.all([
      pool.query(
        `SELECT ${KOLOM_PERCAKAPAN} ${DARI_PERCAKAPAN}
          WHERE c.conversation_id = $1 AND ${sql}`,
        [id, ...params]
      ),
      pool.query(
        `SELECT m.message_id, m.body, m.created_at, m.read_at, m.sender_user_id,
                u.name AS nama_pengirim, u.role AS peran_pengirim
           FROM messages m
           JOIN users u ON u.user_id = m.sender_user_id
          WHERE m.conversation_id = $1
            AND EXISTS (SELECT 1 FROM conversations c
                         WHERE c.conversation_id = m.conversation_id AND ${sql})
          ORDER BY m.created_at`,
        [id, ...params]
      ),
    ]);

    if (kepala.rows.length === 0) {
      return res.status(404).json({ message: 'Percakapan tidak ditemukan' });
    }

    const belumDibaca = isi.rows.filter(
      (m) => !m.read_at && m.sender_user_id !== req.user.user_id
    );

    if (belumDibaca.length > 0) {
      await pool.query(
        `UPDATE messages SET read_at = now()
          WHERE conversation_id = $1 AND sender_user_id <> $2 AND read_at IS NULL`,
        [id, req.user.user_id]
      );
      // Barisnya sudah terlanjur diambil sebelum UPDATE jalan, jadi tandainya
      // disusulkan di memori — daripada menembak DB sekali lagi cuma untuk
      // membaca nilai yang sudah kita tahu.
      const saat = new Date().toISOString();
      belumDibaca.forEach((m) => { m.read_at = saat; });
    }

    res.json({ conversation: kepala.rows[0], data: isi.rows });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/chat/:conversationId/pesan
// Body: { body }
async function sendMessage(req, res, next) {
  try {
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body) return res.status(400).json({ message: 'Pesan tidak boleh kosong' });
    if (body.length > 2000) {
      return res.status(400).json({ message: 'Pesan maksimal 2.000 karakter' });
    }

    const { sql, params } = await syaratAkses(req.user, 2);
    const { rows: boleh } = await pool.query(
      `SELECT c.conversation_id FROM conversations c
        WHERE c.conversation_id = $1 AND ${sql}`,
      [req.params.conversationId, ...params]
    );
    if (boleh.length === 0) {
      return res.status(404).json({ message: 'Percakapan tidak ditemukan' });
    }

    // Bentuknya WAJIB sama persis dengan baris di getMessages, termasuk nama
    // dan peran pengirimnya. Tanpa itu pesan yang baru dikirim datang setengah
    // jadi, dan halaman yang memakai peran_pengirim untuk menentukan sisi
    // bubble menaruhnya di kiri sampai penarikan berikutnya memindahkannya.
    const { rows } = await pool.query(
      `WITH baru AS (
         INSERT INTO messages (conversation_id, sender_user_id, body)
         VALUES ($1, $2, $3)
         RETURNING message_id, body, created_at, read_at, sender_user_id
       )
       SELECT baru.*, u.name AS nama_pengirim, u.role AS peran_pengirim
         FROM baru JOIN users u ON u.user_id = baru.sender_user_id`,
      [req.params.conversationId, req.user.user_id, body]
    );

    await pool.query(
      'UPDATE conversations SET last_message_at = now() WHERE conversation_id = $1',
      [req.params.conversationId]
    );

    res.status(201).json({ message: rows[0] });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/chat/belum-dibaca
// Satu angka untuk lencana di navbar/sidebar. Dipisah dari daftar supaya
// halaman mana pun bisa menanyakannya tanpa menarik seluruh percakapan.
async function unreadCount(req, res, next) {
  try {
    const { sql, params } = await syaratAkses(req.user, 2);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS jumlah
         FROM messages m
         JOIN conversations c ON c.conversation_id = m.conversation_id
        WHERE m.read_at IS NULL AND m.sender_user_id <> $1 AND ${sql}`,
      [req.user.user_id, ...params]
    );
    res.json({ jumlah: rows[0].jumlah });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listConversations, openConversation, getMessages, sendMessage, unreadCount,
};
