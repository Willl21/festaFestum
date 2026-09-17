import { useSyncExternalStore } from 'react'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

const TOKEN_KEY = 'ff_token'
const USER_KEY = 'ff_user'

export const getToken = () => localStorage.getItem(TOKEN_KEY)

/** Identitas yang dipakai navbar supaya tidak perlu memanggil GET /auth/me
 *  di tiap halaman. Bukan sumber kebenaran — otorisasi tetap di backend. */
export function getUser(): AuthResponse['user'] | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthResponse['user']) : null
  } catch {
    return null // storage korup / diblokir browser
  }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  window.dispatchEvent(new Event(USER_EVENT))
}

/** Identitas di navbar dulu cuma ditulis saat login, jadi ganti nama atau foto
 *  di halaman profil baru kelihatan setelah keluar-masuk. Tiga helper di bawah
 *  bikin navbar ikut berubah seketika — dan lewat event `storage`, tab lain
 *  yang terbuka ikut juga. */
const USER_EVENT = 'ff-user'

export function simpanUser(user: AuthResponse['user']) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  window.dispatchEvent(new Event(USER_EVENT))
}

export function langgananUser(ubah: () => void) {
  window.addEventListener(USER_EVENT, ubah)
  window.addEventListener('storage', ubah)
  return () => {
    window.removeEventListener(USER_EVENT, ubah)
    window.removeEventListener('storage', ubah)
  }
}

// Sengaja mengembalikan string mentah, bukan hasil JSON.parse: useSyncExternalStore
// membandingkan snapshot dengan Object.is, dan objek baru tiap panggilan bikin
// render tak berujung.
export const cuplikanUser = () => localStorage.getItem(USER_KEY)

/** Dipakai SEMUA tempat yang menampilkan identitas (navbar, sidebar vendor,
 *  sidebar admin). Jangan panggil getUser() langsung di komponen: hasilnya
 *  dibaca sekali dan tidak ikut berubah waktu profil disimpan. */
export function usePengguna() {
  useSyncExternalStore(langgananUser, cuplikanUser)
  return getUser()
}

// ponytail: token di localStorage — cukup untuk demo lomba, tapi terbaca script
// kalau ada XSS. Upgrade-nya: backend set httpOnly cookie + cors credentials.
export function saveAuth(auth: AuthResponse) {
  localStorage.setItem(TOKEN_KEY, auth.token)
  simpanUser(auth.user)
}

/** Endpoint yang membalas 401 karena INPUT salah, bukan sesi habis: sandi
 *  keliru waktu masuk, dan sandi lama keliru waktu menggantinya. Kalau dua ini
 *  ikut dilempar ke halaman masuk, pesan salahnya hilang dan orang yang cuma
 *  salah ketik ikut dikeluarkan. */
const BUKAN_SESI_HABIS = ['/auth/login', '/auth/password']

const PESAN_SESI_HABIS = 'Sesi Anda sudah berakhir. Silakan masuk lagi.'

/** Dibaca ketiga halaman masuk sebagai nilai awal pesan error, supaya orang
 *  yang tiba-tiba mendarat di sini tahu kenapa. Penanda ?sesi=habis dipasang
 *  oleh hasil() waktu melempar keluar. */
export const pesanSesiHabis = () =>
  new URLSearchParams(window.location.search).get('sesi') === 'habis' ? PESAN_SESI_HABIS : ''

/** Tiap area punya halaman masuknya sendiri. Dipilih dari URL yang sedang
 *  dibuka, bukan dari role di localStorage — sesi yang mati justru bikin
 *  role-nya tidak bisa dipercaya. */
function halamanMasuk() {
  const p = window.location.pathname
  if (p.startsWith('/admin')) return '/admin/masuk'
  if (p.startsWith('/vendor')) return '/vendor/masuk'
  return '/masuk'
}

/** Ekor bersama post/get/kirim. Satu hal yang ditambahkan di atas baca-respons
 *  biasa: 401 di permintaan yang MEMBAWA token berarti tokennya sudah
 *  kedaluwarsa (JWT_EXPIRES_IN 1 hari). Sesinya dibersihkan lalu pengguna
 *  dilempar ke halaman masuk yang sesuai. Ditaruh di sini, bukan di tiap
 *  halaman, karena semua permintaan lewat tiga fungsi ini. */
async function hasil<T>(res: Response, path: string): Promise<T> {
  const data = await res.json().catch(() => ({}))

  if (res.status === 401 && getToken() && !BUKAN_SESI_HABIS.includes(path)) {
    clearAuth()
    // replace, bukan assign: tombol Back jangan balik ke halaman yang sudah mati.
    window.location.replace(halamanMasuk() + '?sesi=habis')
    // Halaman sedang berpindah; lemparan ini cuma menghentikan pemanggilnya.
    throw new Error(PESAN_SESI_HABIS)
  }

  if (!res.ok) throw new Error(data.message || 'Terjadi kesalahan, coba lagi.')
  return data as T
}

/** POST JSON ke backend. Melempar Error berisi pesan dari server supaya
 *  form cukup menampilkan err.message apa adanya. */
export async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Token ikut kalau ada. Endpoint publik (login, daftar, cek jadwal)
        // mengabaikannya, jadi aman dikirim selalu.
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Tidak bisa menghubungi server. Cek koneksi Anda.')
  }

  return hasil<T>(res, path)
}

/** GET JSON dari backend. Query kosong/undefined dibuang supaya URL-nya bersih. */
export async function get<T>(path: string, query: Record<string, string | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams(
    Object.entries(query).filter(([, v]) => v != null && v !== '') as [string, string][]
  ).toString()

  let res: Response
  try {
    res = await fetch(BASE + path + (qs ? `?${qs}` : ''), {
      headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    })
  } catch {
    throw new Error('Tidak bisa menghubungi server. Cek koneksi Anda.')
  }

  return hasil<T>(res, path)
}

export type AuthResponse = {
  token: string
  user: {
    user_id: string
    name: string
    email: string
    role: string
    avatar_url?: string | null
  }
}

/** Satu baris dari GET /vendors. Namanya mengikuti kolom DB apa adanya,
 *  supaya gampang dicocokkan waktu menelusuri dari halaman ke query. */
export type ApiVendor = {
  vendor_id: string
  business_name: string
  city: string | null
  /** Hanya ada di GET /vendors/:id, bukan di listing. */
  address?: string | null
  description: string | null
  is_verified: boolean
  rating_avg: string
  rating_count: number
  categories: string[]
  price_start_from: string | null
  /** Penanda vendor punya foto hero. Gambarnya TIDAK ikut di sini — ambil
   *  lewat urlFotoVendor(). Hanya ada di respons listing. */
  has_photo?: boolean
  /** Tiga slot foto portofolio, true kalau terisi. Hanya di GET /vendors/me. */
  photos?: boolean[]
}

/** Perhatikan: response listing memakai kunci `data`, bukan `vendors`. */
export type VendorListResponse = {
  data: ApiVendor[]
  pagination: { page: number; limit: number; total: number }
}

/** Daftar vendor per kategori. `eventDate` + `timeSlot` mengaktifkan
 *  schedule-first discovery dan harus diisi berdua atau tidak sama sekali. */
export function listVendors(opts: {
  category: string
  city?: string
  eventDate?: string
  timeSlot?: string
  limit?: number
}) {
  return get<VendorListResponse>('/vendors', {
    category: opts.category,
    city: opts.city,
    event_date: opts.eventDate,
    time_slot: opts.timeSlot,
    limit: String(opts.limit ?? 24),
  })
}

export type ApiService = {
  service_id: string
  service_name: string
  category: string
  description: string | null
  price: string
  minimum_notice_days: number
  is_active: boolean
  /** Penanda layanan ini punya foto. Gambarnya TIDAK ikut di sini — ambil
   *  lewat urlFotoLayanan(), sama seperti pola foto vendor. */
  has_photo?: boolean
}

/** `portfolio` membawa nomor SLOT, bukan gambarnya — pasang lewat
 *  urlFotoVendor(id, sort_order). Data URL tidak pernah ikut di respons. */
export type SlotPortofolio = { image_id: string; sort_order: number; caption: string | null }

export const getVendor = (id: string) =>
  get<{ vendor: ApiVendor; portfolio: SlotPortofolio[] }>(`/vendors/${id}`)
/** Perhatikan: endpoint ini membalas kunci `data`, bukan `services` —
 *  sama seperti GET /vendors. Konsisten dengan listing lain di backend.
 *
 *  `category` WAJIB diisi halaman yang terikat satu kategori (semua halaman
 *  detail dan halaman pesan). Satu vendor boleh menjual lintas kategori, jadi
 *  tanpa filter ini halaman Event Organizer ikut menampilkan paket floristnya
 *  — terbaca seperti data dobel, dan paket yang salah yang terpilih duluan. */
export const getVendorServices = (id: string, category?: string) =>
  get<{ data: ApiService[] }>(`/vendors/${id}/services`, { category })

// --- Ketersediaan & pemesanan --------------------------------------------

export type Availability = {
  available: boolean
  reason: string | null
  schedule_id?: string
  service_name: string
  price: string
  minimum_notice_days: number
}

export const cekKetersediaan = (body: {
  service_id: string; event_date: string; time_slot: string
}) => post<Availability>('/schedules/check', body)

export type SlotKetersediaan = {
  event_date: string
  time_slot: 'pagi' | 'siang' | 'malam'
  status: 'available' | 'held' | 'booked' | 'blocked'
}

export type Ketersediaan = {
  service_id: string
  vendor_id: string
  minimum_notice_days: number
  /** Tanggal paling awal yang boleh dipesan, sudah menghitung
   *  minimum_notice_days memakai zona waktu server. */
  earliest_date: string
  data: SlotKetersediaan[]
}

/** Status seluruh slot dalam satu rentang, untuk menggambar kalender.
 *  Tanggal yang tidak muncul di `data` berarti vendor tidak membuka slot. */
export const listKetersediaan = (serviceId: string, from: string, to: string) =>
  get<Ketersediaan>(`/services/${serviceId}/availability`, { from, to })

export type ApiBooking = {
  booking_id: string
  event_type: string
  event_location_detail: string
  total_price: string
  dp_amount: string
  payment_status: 'pending' | 'dp_paid' | 'fully_paid' | 'cancelled' | 'expired'
  /** Jawaban vendor atas pesanan ini. Terpisah dari payment_status: pesanan
   *  bisa diterima tapi belum dibayar, dan pembayaran ditolak backend selama
   *  statusnya belum `diterima`. */
  confirm_status: 'menunggu' | 'diterima' | 'ditolak'
  confirm_note: string | null
  confirmed_at: string | null
  /** null selama pesanan ini belum diulas. */
  review: { rating: number; comment: string | null; created_at: string } | null
  created_at: string
  service_id: string
  service_name: string
  category: string
  vendor_id: string
  business_name: string
  city: string | null
  customer_name: string
  customer_phone: string
  event_date: string
  time_slot: string
  payments: ApiPayment[]
}

export const buatBooking = (body: {
  service_id: string; event_date: string; time_slot: string
  event_type: string; event_location_detail: string
}) => post<{ booking: ApiBooking }>('/bookings', body)

/** Vendor menjawab pesanan yang masuk. `note` opsional — dipakai untuk
 *  menjelaskan alasan menolak. */
export const konfirmasiBooking = (id: string, action: 'terima' | 'tolak', note?: string) =>
  kirim<{ booking: ApiBooking }>(`/bookings/${id}/konfirmasi`, 'PATCH', { action, note })

/** Dibatalkan customer, dan HANYA selama belum ada uang masuk — backend
 *  menolak sisanya karena refund di luar lingkup proyek ini. */
export const batalBooking = (id: string) =>
  post<{ booking: ApiBooking }>(`/bookings/${id}/batal`, {})

export const listMyBookings = () => get<{ data: ApiBooking[] }>('/bookings')
export const getBooking = (id: string) => get<{ booking: ApiBooking }>(`/bookings/${id}`)

// --- Pembayaran -----------------------------------------------------------

/** `details` isinya beda per metode: VA punya va_number, QRIS punya qr_url,
 *  Indomaret/Alfamart punya payment_code, Mandiri punya bill_key. */
export type ApiPayment = {
  payment_id: string
  payment_type: 'down_payment' | 'settlement'
  amount: string
  method: string
  details: {
    va_number?: string; bank?: string
    qr_url?: string; deeplink?: string
    payment_code?: string; store?: string
    bill_key?: string; biller_code?: string
  }
  gateway_status: 'pending' | 'success' | 'failed' | 'refunded'
  expires_at: string | null
  paid_at: string | null
}

export const bayarBooking = (body: {
  booking_id: string; payment_type: 'down_payment' | 'settlement'; method: string
}) => post<{ payment: ApiPayment; simulated?: boolean; reused?: boolean }>('/payments/charge', body)

export const listPembayaran = (bookingId: string) =>
  get<{ payments: ApiPayment[] }>(`/payments/booking/${bookingId}`)

/** Satu tagihan + ringkasan pesanannya, untuk halaman pembayaran. */
export type ApiPaymentDetail = ApiPayment & {
  booking_id: string
  total_price: string
  dp_amount: string
  payment_status: string
  event_location_detail: string
  service_name: string
  category: string
  business_name: string
  city: string | null
  event_date: string
  time_slot: string
}

export const getPayment = (id: string) =>
  get<{ payment: ApiPaymentDetail }>(`/payments/${id}`)

/** Backend bertanya ke Midtrans. Dipakai untuk polling di halaman VA supaya
 *  status tetap maju walau webhook tidak sampai (backend masih localhost). */
export const refreshPembayaran = (paymentId: string) =>
  post<{ payment: ApiPayment }>(`/payments/${paymentId}/refresh`, {})

/** Hanya hidup saat Midtrans dimatikan — jaring pengaman demo. */
export const simulasiBayar = (paymentId: string) =>
  post<{ message: string }>(`/payments/${paymentId}/simulate`, {})

// --- Sisi vendor ----------------------------------------------------------

export type VendorStats = {
  revenue_bulan_ini: string
  revenue_bulan_lalu: string
  /** Sudah TIDAK menghitung pesanan batal/kedaluwarsa. */
  total_pesanan: number
  /** Menunggu VENDOR menjawab. Beda dari menunggu_dp, yang menunggu CUSTOMER
   *  membayar sesudah pesanannya diterima. */
  perlu_dijawab: number
  menunggu_dp: number
  lunas: number
  selesai_minggu_ini: number
  slot_tersedia: number
}

export type VendorBalance = {
  saldo_tersedia: number
  escrow: number
  total_masuk: number
  biaya_platform: number
  platform_fee_rate: number
  pesanan_escrow: number
  /** Payout 'pending' + 'paid'; sudah ikut dikurangi dari saldo_tersedia. */
  sudah_ditarik: number
  menunggu_persetujuan: number
  penarikan_aktif: boolean
}

export type ApiSchedule = {
  schedule_id: string
  event_date: string
  time_slot: string
  status: 'available' | 'held' | 'booked' | 'blocked'
  booking_id: string | null
  payment_status: string | null
  customer_name: string | null
}

export const listVendorBookings = () => get<{ data: ApiBooking[] }>('/bookings/vendor')
export const getVendorStats = () => get<{ stats: VendorStats }>('/bookings/vendor/stats')
export const getVendorBalance = () => get<{ balance: VendorBalance }>('/bookings/vendor/balance')
export const getMyVendor = () => get<{ vendor: ApiVendor }>('/vendors/me')

/** Daftar layanan untuk halaman VENDOR — ikut membawa yang disembunyikan.
 *  Berbeda dari getVendorServices() yang publik dan sengaja menyaringnya,
 *  karena kalau pemiliknya juga tidak melihatnya, menyembunyikan sebuah
 *  layanan sama saja dengan menghapusnya. */
export const getMyServices = () => get<{ data: ApiService[] }>('/vendors/me/services')

/** Ubah layanan yang sudah ada. Field yang tidak dikirim dibiarkan apa adanya
 *  (backend memakai COALESCE), jadi kirim saja yang berubah.
 *
 *  Khusus `image`: tidak dikirim = foto dibiarkan, string kosong = fotonya
 *  dihapus. Dua hal itu tidak bisa dibedakan kalau dipukul rata jadi null. */
export const ubahLayanan = (serviceId: string, body: Record<string, unknown>) =>
  kirim<{ service: ApiService }>(`/services/${serviceId}`, 'PATCH', body)

/** Sembunyikan / tampilkan lagi sebuah layanan. Nebeng PATCH yang sama supaya
 *  tidak ada jalur kedua yang bisa melenceng perilakunya. */
export const setAktifLayanan = (serviceId: string, is_active: boolean) =>
  ubahLayanan(serviceId, { is_active })

/** Alamat foto layanan, dipasang langsung sebagai <img src>. Publik, dan
 *  membalas 404 kalau belum ada fotonya — komponen Img sudah jatuh ke emoji
 *  kategori lewat onError.
 *
 *  `v` memaksa browser mengambil ulang sesudah fotonya diganti: URL-nya tetap
 *  sama, jadi tanpa penanda ini cache HTTP menyajikan foto lama. */
export const urlFotoLayanan = (serviceId: string, v?: string | number) =>
  `${BASE}/services/${serviceId}/photo${v ? `?v=${v}` : ''}`

/** Satu foto per panggilan — backend menolak body yang memuat tiga gambar
 *  sekaligus. Kirim `image: ''` untuk mengosongkan slot. Yang dikembalikan
 *  penanda slot terisi, bukan gambarnya. */
export const simpanFotoVendor = (slot: number, image: string) =>
  kirim<{ photos: boolean[] }>(`/vendors/me/photos/${slot}`, 'PUT', { image })

/** Alamat gambar portofolio, dipasang langsung sebagai <img src>. Endpoint-nya
 *  publik dan membalas 404 kalau slotnya kosong — komponen Img sudah jatuh ke
 *  emoji kategori saat gambarnya gagal dimuat.
 *
 *  `v` memaksa browser mengambil ulang setelah foto diganti: URL-nya tetap
 *  sama, jadi tanpa penanda ini cache HTTP menyajikan foto lama. */
export const urlFotoVendor = (vendorId: string, slot = 0, v?: string | number) =>
  `${BASE}/vendors/${vendorId}/photo/${slot}${v ? `?v=${v}` : ''}`

export const listMySchedules = (from: string, to: string) =>
  get<{ data: ApiSchedule[] }>('/schedules/me', { from, to })

export const tambahSlot = (slots: { event_date: string; time_slot: string }[]) =>
  post<{ created: number }>('/schedules', { slots })

export const tambahLayanan = (vendorId: string, body: Record<string, unknown>) =>
  post<{ service: ApiService }>(`/vendors/${vendorId}/services`, body)

/** PUT, PATCH & DELETE belum ada helper-nya di sini karena `post`/`get` cuma
 *  menangani dua metode itu. Ditambahkan saat halaman Layanan butuh edit. */
export async function kirim<T>(path: string, method: 'PUT' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw new Error('Tidak bisa menghubungi server. Cek koneksi Anda.')
  }
  return hasil<T>(res, path)
}

// --- Ulasan ---------------------------------------------------------------

export type ApiUlasan = {
  review_id: string
  rating: number
  comment: string | null
  created_at: string
  user_name: string
  category: string
}

export type RingkasanUlasan = {
  rata_rata: string
  jumlah: number
  b5: number; b4: number; b3: number; b2: number; b1: number
}

/** Ulasan menempel pada PESANAN, bukan pada vendor — itu yang membuktikan
 *  pengulasnya benar-benar pernah memakai jasanya. Backend menolak kalau
 *  pesanannya belum lunas atau acaranya belum lewat. */
export const kirimUlasan = (bookingId: string, rating: number, comment?: string) =>
  post<{ review: { review_id: string; rating: number; comment: string | null; created_at: string } }>(
    `/bookings/${bookingId}/ulasan`, { rating, comment }
  )

/** Publik: tamu yang belum masuk tetap bisa membaca ulasan di halaman detail. */
export const listUlasanVendor = (vendorId: string) =>
  get<{ data: ApiUlasan[]; ringkasan: RingkasanUlasan }>(`/vendors/${vendorId}/ulasan`)
