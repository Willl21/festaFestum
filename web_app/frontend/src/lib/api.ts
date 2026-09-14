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
}

// ponytail: token di localStorage — cukup untuk demo lomba, tapi terbaca script
// kalau ada XSS. Upgrade-nya: backend set httpOnly cookie + cors credentials.
export function saveAuth(auth: AuthResponse) {
  localStorage.setItem(TOKEN_KEY, auth.token)
  localStorage.setItem(USER_KEY, JSON.stringify(auth.user))
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

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || 'Terjadi kesalahan, coba lagi.')
  return data as T
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

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || 'Terjadi kesalahan, coba lagi.')
  return data as T
}

export type AuthResponse = {
  token: string
  user: { user_id: string; name: string; email: string; role: string }
}

/** Satu baris dari GET /vendors. Namanya mengikuti kolom DB apa adanya,
 *  supaya gampang dicocokkan waktu menelusuri dari halaman ke query. */
export type ApiVendor = {
  vendor_id: string
  business_name: string
  city: string | null
  description: string | null
  is_verified: boolean
  rating_avg: string
  rating_count: number
  categories: string[]
  price_start_from: string | null
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
}

export const getVendor = (id: string) => get<{ vendor: ApiVendor }>(`/vendors/${id}`)
/** Perhatikan: endpoint ini membalas kunci `data`, bukan `services` —
 *  sama seperti GET /vendors. Konsisten dengan listing lain di backend. */
export const getVendorServices = (id: string) =>
  get<{ data: ApiService[] }>(`/vendors/${id}/services`)

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
  total_pesanan: number
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
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || 'Terjadi kesalahan, coba lagi.')
  return data as T
}
