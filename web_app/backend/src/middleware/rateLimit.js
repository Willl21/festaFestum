// Rate limit in-memory. Cukup karena backend jalan satu proses; kalau nanti
// di-scale jadi banyak instance, hitungannya jadi per-instance.
// ponytail: Map in-memory, pindah ke Redis INCR kalau instance-nya lebih dari satu.
const WINDOW_MS = 15 * 60 * 1000;
const hits = new Map(); // "path:ip" -> { count, resetAt }

// Yang dihitung cuma percobaan GAGAL (>= 400). Brute force itu rentetan gagal;
// login yang benar tidak perlu makan jatah — kalau ikut dihitung, script test
// dan satu keluarga di balik NAT yang sama bisa ikut kena blokir.
// `semua` = hitung SEMUA permintaan, untuk endpoint yang mahal walau sukses
// (Festa AI memakai kuota model AI tim).
function rateLimit(max, windowMs = WINDOW_MS, semua = false) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.baseUrl}${req.path}:${req.ip}`;
    const entry = hits.get(key);

    if (entry && now <= entry.resetAt && entry.count >= max) {
      const detik = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(detik));
      return res.status(429).json({
        message: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(detik / 60)} menit.`,
      });
    }

    res.on('finish', () => {
      if (!semua && res.statusCode < 400) return;
      const cur = hits.get(key);
      if (!cur || Date.now() > cur.resetAt) {
        hits.set(key, { count: 1, resetAt: Date.now() + windowMs });
      } else {
        cur.count += 1;
      }
      // Buang entri kedaluwarsa sekalian, biar Map tidak tumbuh selamanya.
      if (hits.size > 1000) {
        const t = Date.now();
        for (const [k, v] of hits) if (t > v.resetAt) hits.delete(k);
      }
    });

    next();
  };
}

module.exports = rateLimit;
