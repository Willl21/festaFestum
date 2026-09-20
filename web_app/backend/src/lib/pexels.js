// Pencarian foto stok Pexels, dipakai seed-foto.js dan seed-layanan.js.
//
// Butuh PEXELS_KEY di .env (gratis di https://www.pexels.com/api/).
// Lisensi Pexels: boleh komersial, tanpa atribusi. Yang dilarang dan kita
// hindari: menyiratkan orang di dalam foto terkait dengan vendor kita —
// makanya semua kuerinya diarahkan ke produk dan suasana, bukan potret.
//
// Gambarnya TIDAK diunduh. Yang disimpan cuma URL CDN-nya, jadi nol berkas di
// repo dan nol byte gambar di Supabase. Endpoint foto vendor & layanan sudah
// meneruskan URL non-data sebagai redirect 302.

const PER_PAGE_MAKS = 80; // batas keras Pexels
const MAKS_HALAMAN = 10;  // lebih dalam dari ini hasilnya sudah tidak nyambung

// 900x600 mengikuti preset PORTOFOLIO di frontend/src/lib/gambar.ts.
// fit=crop + h WAJIB: tanpa h, rasio aslinya dipertahankan dan berkasnya jadi
// ~4x lebih besar (333 KB vs 89 KB). Parameter q= tidak berpengaruh sama
// sekali di CDN ini — auto=compress sudah mengurusnya. Sudah diukur.
const UKURAN = 'auto=compress&cs=tinysrgb&w=900&h=600&fit=crop';

function kunci() {
  const k = process.env.PEXELS_KEY;
  if (!k) throw new Error('PEXELS_KEY belum ada di backend/.env');
  return k;
}

/** Mengembalikan array URL siap simpan, sebanyak-banyaknya `jumlah`.
 *  Halaman berikutnya diambil sampai cukup; kalau stoknya habis lebih dulu,
 *  yang kembali lebih sedikit dan pemanggil yang memutuskan mau diapakan. */
async function cariFoto(query, jumlah) {
  const KEY = kunci();
  const urls = [];

  for (let page = 1; urls.length < jumlah && page <= MAKS_HALAMAN; page++) {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}`
      + `&per_page=${PER_PAGE_MAKS}&page=${page}&orientation=landscape`;
    const r = await fetch(url, { headers: { Authorization: KEY } });

    if (r.status === 401) throw new Error('PEXELS_KEY ditolak (401) — cek nilainya di backend/.env');
    if (r.status === 429) throw new Error('Kuota Pexels habis (429) — 200 request/jam, tunggu lalu jalankan lagi');
    if (!r.ok) throw new Error(`Pexels ${r.status} untuk "${query}": ${await r.text()}`);

    const photos = (await r.json()).photos;
    if (photos.length === 0) break; // stok habis, tidak ada gunanya minta halaman lagi
    urls.push(...photos.map((p) => `${p.src.original}?${UKURAN}`));
  }

  if (urls.length === 0) throw new Error(`Pexels tidak punya hasil untuk "${query}"`);
  return urls;
}

module.exports = { cariFoto, UKURAN };
