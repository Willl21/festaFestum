const pool = require('../config/db');

// Festa AI: perantara ke layanan AI tim AI Engineer (FastAPI + Gemini, Render).
// Backend yang memanggil, bukan browser, karena balasan AI cuma menyebut
// "Nama Bisnis - Nama Layanan" tanpa ID. Nama itu dicocokkan ke DB di sini
// supaya frontend dapat vendor_id/service_id untuk tautan dan foto, item yang
// dikarang AI (atau layanannya sudah nonaktif) terbuang, dan harga serta total
// dihitung ulang dari DB, bukan dipercaya dari model.
const AI_URL = process.env.AI_API_URL || 'https://festafestum.onrender.com';

// Render gratisan tidur saat sepi; bangunnya bisa ~50 detik.
const BATAS_WAKTU_MS = 90_000;

const KATEGORI = ['event_organizer', 'florist', 'photographer', 'attire_rental', 'makeup_artist'];

function galat(status, message) {
  return Object.assign(new Error(message), { status });
}

// POST /api/v1/ai/recommend
// { event_type, budget, guest_count, location, kategori?: string[] }
async function rekomendasi(req, res, next) {
  try {
    const { event_type, budget, guest_count, location } = req.body;
    const kategori = Array.isArray(req.body.kategori) ? req.body.kategori : [];

    if (typeof event_type !== 'string' || !event_type.trim() || event_type.length > 60) {
      throw galat(400, 'Tipe acara wajib diisi');
    }
    if (typeof location !== 'string' || !location.trim() || location.length > 40) {
      throw galat(400, 'Lokasi wajib diisi');
    }
    if (!Number.isInteger(budget) || budget <= 0 || !Number.isInteger(guest_count) || guest_count <= 0) {
      throw galat(400, 'Budget dan jumlah tamu harus bilangan bulat positif');
    }
    if (kategori.some((k) => !KATEGORI.includes(k))) {
      throw galat(400, 'Kategori tidak dikenal');
    }

    let ai;
    try {
      const r = await fetch(`${AI_URL}/api/v1/ai/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type, budget, guest_count, location, preferred_style: [], fokus_prioritas: kategori }),
        signal: AbortSignal.timeout(BATAS_WAKTU_MS),
      });
      ai = await r.json();
      if (!r.ok) throw new Error(ai.error || `AI membalas ${r.status}`);
    } catch (err) {
      // Detail galat AI (nama model, kunci API) cukup di log server.
      console.error('Festa AI gagal:', err.message);
      throw galat(502, 'Festa AI sedang tidak bisa dihubungi. Coba lagi sebentar lagi.');
    }

    // "Nama Bisnis - Nama Layanan". Dipotong di " - " PERTAMA; nama bisnis
    // di katalog tidak ada yang memuat " - ", nama layanan boleh.
    const item = (ai.rincian_estimasi || [])
      .map((x) => {
        const teks = String(x.vendor_terpilih || '');
        const i = teks.indexOf(' - ');
        return i < 0 ? null : { business_name: teks.slice(0, i).trim(), service_name: teks.slice(i + 3).trim() };
      })
      .filter(Boolean);

    const { rows } = item.length
      ? await pool.query(
          `SELECT s.service_id, s.vendor_id, s.service_name, s.category::text AS category,
                  s.price, (s.image_url IS NOT NULL) AS has_photo,
                  v.business_name, v.city::text AS city, v.rating_avg
             FROM services s
             JOIN vendors v ON v.vendor_id = s.vendor_id
             JOIN unnest($1::text[], $2::text[]) AS p(bisnis, layanan)
               ON lower(v.business_name) = lower(p.bisnis)
              AND lower(s.service_name) = lower(p.layanan)
            WHERE s.is_active = TRUE`,
          [item.map((x) => x.business_name), item.map((x) => x.service_name)]
        )
      : { rows: [] };

    // Fokus Prioritas dikirim ke AI sebagai fokus_prioritas (budget didahulukan
    // untuk kategori itu), tapi AI boleh menambah kategori lain kalau budget
    // sisa, jadi tetap disaring di sini.
    const data = rows.filter((r) => !kategori.length || kategori.includes(r.category));
    const total = data.reduce((sum, r) => sum + Number(r.price), 0);

    res.json({
      pesan_pembuka: String(ai.pesan_pembuka || ''),
      saran_penghematan: String(ai.saran_penghematan || ''),
      data,
      total,
      dibuang: item.length - rows.length,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { rekomendasi };
