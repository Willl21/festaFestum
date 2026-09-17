/** Field tambahan per kategori layanan, disimpan di services.details (JSONB,
 *  migrasi 012).
 *
 *  Kunci di sini HARUS sama persis dengan FIELD di
 *  `backend/src/lib/layananDetail.js` — backend menolak kunci yang tidak
 *  dikenalnya dengan 400, jadi salah ketik langsung terlihat saat menyimpan,
 *  bukan hilang diam-diam. Pola yang sama dipakai payments.ts <-> midtrans.js.
 *
 *  Dipusatkan di sini (bukan inline di halaman) karena nilainya harus sama di
 *  dua tempat: form vendor dan lima halaman detail yang menampilkannya. Ini
 *  memenuhi syarat "dipusatkan kalau salah ketik bikin data hilang tanpa
 *  error", bukan sekadar menghemat baris.
 *
 *  Semua field OPSIONAL — vendor boleh mengisi sebagian saja. */

export type FieldLayanan = {
  /** Kunci di dalam objek details. */
  nama: string
  label: string
  placeholder?: string
  /** Dirender sebagai <textarea>; backend mengizinkan 600 karakter (vs 200). */
  panjang?: boolean
  /** Pilihan tetap, dirender sebagai <select>. */
  pilihan?: readonly string[]
  /** Petunjuk keyboard saja — nilainya tetap disimpan sebagai teks. */
  angka?: boolean
}

export const FIELD_LAYANAN: Record<string, readonly FieldLayanan[]> = {
  makeup_artist: [
    { nama: 'jenis_layanan', label: 'Jenis Layanan', placeholder: 'Makeup + hairdo' },
    { nama: 'gaya_makeup', label: 'Gaya Makeup', placeholder: 'Natural, bold, korean look' },
    { nama: 'durasi', label: 'Durasi Layanan', placeholder: '3 jam' },
    { nama: 'jumlah_orang', label: 'Jumlah Orang', placeholder: '2', angka: true },
    {
      nama: 'fasilitas', label: 'Fasilitas Tambahan', panjang: true,
      placeholder: 'Hairdo, softlens, bulu mata, tim datang ke lokasi',
    },
  ],
  event_organizer: [
    { nama: 'jenis_acara', label: 'Jenis Acara', placeholder: 'Pernikahan, gala dinner' },
    {
      nama: 'cakupan', label: 'Cakupan Layanan', panjang: true,
      placeholder: 'Konsep acara, dekorasi, MC, rundown, koordinasi vendor',
    },
    { nama: 'durasi', label: 'Durasi Layanan', placeholder: '1 hari penuh' },
    { nama: 'kapasitas', label: 'Kapasitas Acara', placeholder: '100-300 tamu' },
    {
      nama: 'tim', label: 'Fasilitas atau Tim', panjang: true,
      placeholder: '1 koordinator, 5 kru lapangan, sound system',
    },
  ],
  photographer: [
    { nama: 'jenis_fotografi', label: 'Jenis Fotografi', placeholder: 'Prewedding, dokumentasi acara' },
    { nama: 'gaya_fotografi', label: 'Gaya Fotografi', placeholder: 'Cinematic, candid, editorial' },
    { nama: 'durasi', label: 'Durasi Pemotretan', placeholder: '4 jam' },
    { nama: 'jumlah_fotografer', label: 'Jumlah Fotografer', placeholder: '2', angka: true },
    {
      nama: 'output', label: 'Output / Hasil Foto', panjang: true,
      placeholder: '100 foto edit, 1 album cetak, file mentah via Drive',
    },
    { nama: 'estimasi_pengerjaan', label: 'Estimasi Pengerjaan', placeholder: '14 hari kerja' },
    { nama: 'area_layanan', label: 'Area Layanan', placeholder: 'Jabodetabek, luar kota +ongkos' },
  ],
  florist: [
    { nama: 'jenis_produk', label: 'Jenis Produk', placeholder: 'Buket pengantin, dekorasi backdrop' },
    { nama: 'jenis_bunga', label: 'Jenis Bunga', placeholder: 'Mawar, baby breath, lily' },
    { nama: 'warna', label: 'Pilihan Warna', placeholder: 'Putih, dusty pink, merah' },
    { nama: 'ukuran', label: 'Ukuran / Jumlah Bunga', placeholder: 'Diameter 30 cm, ±24 tangkai' },
    { nama: 'bisa_custom', label: 'Bisa Custom', pilihan: ['Bisa custom', 'Tidak bisa custom'] },
    { nama: 'estimasi_pengerjaan', label: 'Estimasi Pengerjaan', placeholder: '2 hari' },
    {
      nama: 'fasilitas', label: 'Fasilitas Tambahan', panjang: true,
      placeholder: 'Kartu ucapan, pengiriman dalam kota, vas',
    },
  ],
  attire_rental: [
    { nama: 'jenis_pakaian', label: 'Jenis Pakaian', placeholder: 'Jas pria, kebaya modern' },
    { nama: 'model', label: 'Model / Style', placeholder: 'Slim fit, kebaya encim' },
    { nama: 'ukuran', label: 'Ukuran Tersedia', placeholder: 'S, M, L, XL, custom' },
    { nama: 'warna', label: 'Pilihan Warna', placeholder: 'Navy, hitam, broken white' },
    { nama: 'durasi_sewa', label: 'Durasi Sewa', placeholder: '3 hari' },
    {
      nama: 'fasilitas', label: 'Fasilitas', panjang: true,
      placeholder: 'Fitting 2x, laundry, aksesoris',
    },
    {
      nama: 'ketentuan', label: 'Ketentuan Sewa', panjang: true,
      placeholder: 'Deposit Rp500.000, denda keterlambatan per hari',
    },
  ],
}

/** Label untuk sebuah kunci details, dipakai halaman detail saat menampilkan
 *  apa yang tersimpan. Jatuh ke kuncinya sendiri kalau tidak dikenal — bisa
 *  terjadi untuk layanan yang kategorinya pernah dipindah. */
export function labelField(category: string, nama: string): string {
  return FIELD_LAYANAN[category]?.find((f) => f.nama === nama)?.label ?? nama
}

/** details -> daftar { label, nilai } yang urutannya mengikuti urutan field di
 *  atas, bukan urutan kunci di JSON. */
export function rincianLayanan(
  category: string,
  details: Record<string, string> | null | undefined,
): { label: string; nilai: string }[] {
  if (!details) return []
  const urutan = FIELD_LAYANAN[category] ?? []
  const hasil = urutan
    .filter((f) => details[f.nama])
    .map((f) => ({ label: f.label, nilai: details[f.nama] }))

  // Kunci yang tidak ada di daftar kategori ini tetap ditampilkan supaya data
  // lama tidak lenyap dari layar tanpa jejak.
  for (const [k, v] of Object.entries(details)) {
    if (!urutan.some((f) => f.nama === k) && v) {
      hasil.push({ label: labelField(category, k), nilai: v })
    }
  }
  return hasil
}
