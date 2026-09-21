/** Satu sumber untuk kategori vendor. Dipusatkan (seperti shifts.ts) karena
 *  nilainya harus sama persis di 5 halaman kategori, 5 halaman detail, dan
 *  backend — kalau `apiCategory` meleset sedikit saja, halamannya kosong
 *  tanpa error yang jelas.
 *
 *  `emoji` dipakai sebagai pengganti foto: file di /public/img belum ada, dan
 *  blok abu-abu bikin kelima halaman kelihatan kembar saat didemokan.
 *  Ganti ke foto asli begitu materinya turun dari PM. */
export type CategoryKey = 'florist' | 'mua' | 'attire' | 'fotografer' | 'eo'

export type CategoryInfo = {
  /** Nilai enum vendor_category di backend. */
  apiCategory: string
  /** Segmen URL di App.tsx. */
  slug: string
  label: string
  emoji: string
  /** Latar kartu, sengaja beda per kategori supaya tidak kembar. */
  tint: string
}

export const categories: Record<CategoryKey, CategoryInfo> = {
  florist: {
    apiCategory: 'florist',
    slug: 'florist',
    label: 'Florist',
    emoji: '💐',
    tint: 'from-rose-100 to-rose-200',
  },
  mua: {
    apiCategory: 'makeup_artist',
    slug: 'mua',
    label: 'Makeup Artist',
    emoji: '💄',
    tint: 'from-fuchsia-100 to-fuchsia-200',
  },
  attire: {
    apiCategory: 'attire_rental',
    slug: 'jas-kebaya',
    label: 'Sewa Jas & Kebaya',
    emoji: '👔',
    tint: 'from-amber-100 to-amber-200',
  },
  fotografer: {
    apiCategory: 'photographer',
    slug: 'fotografer',
    label: 'Fotografer',
    emoji: '📸',
    tint: 'from-slate-200 to-slate-300',
  },
  eo: {
    apiCategory: 'event_organizer',
    slug: 'event-organizer',
    label: 'Event Organizer',
    emoji: '🎊',
    tint: 'from-sky-100 to-sky-200',
  },
}

/** Enum jabodetabek_city dari DB, urut seperti VALID_CITIES di
 *  `backend/src/controllers/vendor.controller.js`. Dipusatkan karena nilainya
 *  dikirim apa adanya sebagai filter `city` — salah satu huruf saja dibalas
 *  400 oleh backend, dan panel cari terbaca "rusak" tanpa sebab yang jelas.
 *  Sebelumnya daftar ini diketik ulang di landing, lengkap dengan salah ketik
 *  'Tanggerang' dan tanpa Jakarta Utara maupun Tangerang Selatan. */
export const KOTA = [
  'jakarta_pusat', 'jakarta_utara', 'jakarta_barat', 'jakarta_selatan', 'jakarta_timur',
  'bogor', 'depok', 'tangerang', 'tangerang_selatan', 'bekasi',
]

/** Enum jabodetabek_city dari DB -> tulisan yang enak dibaca. */
export function namaKota(kota: string | null): string {
  if (!kota) return '-'
  return kota
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
