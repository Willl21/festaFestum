import { useEffect, useState } from 'react'
import KalenderSlot from '../components/KalenderSlot'
import FormSkeleton from '../components/FormSkeleton'
import TukarHalus from '../components/TukarHalus'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import OrderLayout, { OrderField, OrderSection, OrderTextarea } from '../components/OrderLayout'
import { CalendarIcon, MapPinIcon, NoteIcon } from '../components/icons'
import { berbasisJam, hargaPesanan } from '../lib/durasi'
import { categories, type CategoryKey } from '../data/categories'
import {
  getVendor, getVendorServices, buatBooking,
  type ApiService, type ApiVendor,
} from '../lib/api'

/** Halaman "Lengkapi Detail Pesanan" untuk tiga kategori yang bentuk formnya
 *  identik: MUA, Event Organizer, dan Fotografer. Ketiganya sama-sama minta
 *  tanggal + jam, satu angka perkiraan, lalu lokasi acara — yang berbeda cuma
 *  kata-katanya, jadi semuanya dikumpulkan di tabel `variants` di bawah.
 *
 *  Florist dan Attire TIDAK ikut ke sini: florist punya tab acara/buket dengan
 *  blok alamat yang berbeda total, dan attire tidak punya lokasi acara sama
 *  sekali (yang dibutuhkan ukuran, warna, dan jadwal fitting). Keduanya tetap
 *  punya file sendiri.
 */

type Variant = {
  kategori: CategoryKey
  /** Satu angka perkiraan yang ditanyakan di bawah tanggal & jam. Cuma EO:
   *  "jumlah tamu" itu ukuran acara, bukan jumlah pesanan, jadi tidak
   *  mengalikan harga. MUA & fotografer tidak butuh lagi sejak migrasi 016 —
   *  jumlah orang dan durasinya diatur di kalender (mode jam). */
  estimate?: { id: string; label: string; type?: string; placeholder: string }
  venueLabel: string
  note: { label?: string; placeholder?: string }
}

const variants = {
  mua: {
    kategori: 'mua',
    venueLabel: 'NAMA VENUE/ LOKASI',
    note: { label: 'PREFERENSI MAKEUP & REQUEST KHUSUS' },
  },
  eo: {
    kategori: 'eo',
    estimate: {
      id: 'jumlah-tamu',
      label: 'ESTIMASI JUMLAH TAMU',
      type: 'number',
      placeholder: 'Contoh: 250',
    },
    venueLabel: 'NAMA VENUE/ GEDUNG',
    // Mockup EO tidak memberi label pada textarea catatan.
    note: { placeholder: 'Ceritakan kebutuhan acara Anda...' },
  },
  fotografer: {
    kategori: 'fotografer',
    venueLabel: 'NAMA VENUE/ LOKASI PEMOTRETAN',
    note: { label: 'REQUEST KONSEP ATAU MOMEN KHUSUS' },
  },
} satisfies Record<string, Variant>

/** Mengikuti enum event_type di DB. Wajib dipilih: POST /bookings menolak
 *  tanpa ini, dan nilainya harus persis salah satu dari lima ini. */
const JENIS_ACARA = [
  { value: 'wedding', label: 'Pernikahan' },
  { value: 'engagement', label: 'Lamaran' },
  { value: 'graduation', label: 'Wisuda' },
  { value: 'gala_dinner', label: 'Gala Dinner' },
  { value: 'corporate_seminar', label: 'Seminar / Korporat' },
]

export default function VenueOrderPage({ kind }: { kind: keyof typeof variants }) {
  const v: Variant = variants[kind]
  const kat = categories[v.kategori]
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const [vendor, setVendor] = useState<ApiVendor | null>(null)
  const [layanan, setLayanan] = useState<ApiService[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [mengirim, setMengirim] = useState(false)

  // Dibawa dari halaman detail lewat query. EO tidak punya kalender di
  // halaman detailnya, jadi tanggal & jam diisi di sini.
  const [serviceId, setServiceId] = useState(params.get('service') ?? '')
  const [tanggal, setTanggal] = useState(params.get('date') ?? '')
  // Tanpa nilai bawaan: jam diisi sendiri oleh pemesan. Kalau halaman ini
  // dibuka dari halaman detail dengan ?jam=, nilai itu dipakai sebagai
  // isian awal.
  const [jam, setJam] = useState(params.get('jam') ?? '')
  // Paket berbasis jam (MUA & fotografer): dibawa dari halaman detail.
  const [jumlah, setJumlah] = useState(() => Math.max(1, Number(params.get('orang')) || 1))
  const [tambahan, setTambahan] = useState(() => Math.max(0, Number(params.get('tambah')) || 0))

  const [jenisAcara, setJenisAcara] = useState(JENIS_ACARA[0].value)
  const [estimasi, setEstimasi] = useState('')
  const [venue, setVenue] = useState('')
  const [alamat, setAlamat] = useState('')
  const [catatan, setCatatan] = useState('')

  useEffect(() => {
    Promise.all([getVendor(id), getVendorServices(id, kat.apiCategory)])
      .then(([r, s]) => {
        const aktif = s.data.filter((x) => x.is_active)
        setVendor(r.vendor)
        setLayanan(aktif)
        if (!params.get('service') && aktif[0]) setServiceId(aktif[0].service_id)
      })
      .catch((e) => setGalat(e.message))
      .finally(() => setMemuat(false))
  }, [id, params, kat.apiCategory])

  const paket = layanan.find((s) => s.service_id === serviceId) ?? layanan[0]
  // Jumlah orang cuma berlaku di paket MUA per orang; paket per sesi dan
  // kategori lain selalu 1 (backend menolak angka lain untuk paket per sesi).
  // Yang habis tetap SATU tim, yang berlipat cuma harga dan durasinya.
  const jamBased = berbasisJam(paket)
  const qty = jamBased && paket?.per_orang ? jumlah : 1
  const jamTambah = jamBased ? tambahan : 0
  const harga = paket ? hargaPesanan(paket, qty, jamTambah) : 0

  async function ajukan() {
    setGalat('')

    if (!paket) return setGalat('Vendor ini belum punya layanan aktif.')
    if (!tanggal) return setGalat('Tanggal acara wajib diisi.')
    if (!jam) return setGalat('Jam mulai wajib dipilih.')
    if (!venue.trim() || !alamat.trim()) return setGalat('Venue dan alamat lengkap wajib diisi.')

    // Catatan & estimasi digabung ke event_location_detail: tabel bookings
    // belum punya kolom terpisah untuknya, dan menambah kolom demi satu
    // halaman bukan tukar-tambah yang sepadan menjelang tenggat.
    const detail = [
      `${venue.trim()} — ${alamat.trim()}`,
      v.estimate && estimasi && `${v.estimate.label}: ${estimasi}`,
      catatan.trim() && `Catatan: ${catatan.trim()}`,
    ].filter(Boolean).join('\n')

    setMengirim(true)
    try {
      const r = await buatBooking({
        service_id: paket.service_id,
        event_date: tanggal,
        start_time: jam,
        event_type: jenisAcara,
        event_location_detail: detail,
        quantity: qty,
        ...(jamTambah ? { jam_tambahan: jamTambah } : {}),
        // Datang dari kartu rekomendasi di ruang konsultasi (migrasi 017):
        // pesanannya ditautkan ke obrolan itu. Backend memeriksa ruangnya
        // memang milik pemesan dan vendor ini.
        ...(params.get('konsultasi') ? { konsultasi_id: params.get('konsultasi')! } : {}),
      })
      navigate(`/checkout/${r.booking.booking_id}`)
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setMengirim(false)
    }
  }

  return (
    <TukarHalus memuat={memuat} rangka={<FormSkeleton label="Memuat formulir pesanan…" />}>
      {() => {
        if (!vendor) {
          return <p className="mx-auto max-w-[1330px] px-6 py-20 text-[15px]">{galat || 'Vendor tidak ditemukan.'}</p>
        }

        return (
          <OrderLayout
            order={{
              vendor: vendor.business_name,
              packageName: paket?.service_name ?? 'Belum ada paket',
              satuan: [qty > 1 && `× ${qty} orang`, jamTambah > 0 && `+ ${jamTambah} jam`]
                .filter(Boolean).join(' ') || undefined,
              price: harga,
              // DP 30% mengikuti backend. Angka yang MENGIKAT tetap dp_amount yang
              // dikembalikan POST /bookings dan ditampilkan di halaman checkout.
              dp: Math.round(harga * 0.3),
              tint: kat.tint,
              backTo: `/${kat.slug}/${id}`,
            }}
            onSubmit={ajukan}
            mengirim={mengirim}
            galat={galat}
          >
            <OrderSection title="Informasi Acara" icon={<CalendarIcon />}>
              {layanan.length > 1 && (
                <div className="mb-5">
                  <label htmlFor="paket" className="block text-[11px] font-semibold tracking-[0.06em] text-ink/70">
                    PAKET YANG DIPESAN
                  </label>
                  <select
                    id="paket"
                    value={serviceId}
                    onChange={(e) => { setServiceId(e.target.value); setJumlah(1); setTambahan(0) }}
                    className="mt-2 h-11 w-full rounded-sm border border-line bg-white px-3 text-[14px] outline-none focus:border-navy-900"
                  >
                    {layanan.map((s) => (
                      <option key={s.service_id} value={s.service_id}>{s.service_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <p className="block text-[11px] font-semibold tracking-[0.06em] text-ink/70">
                TANGGAL ACARA
              </p>
              {/* Kalender + input jam bebas, menggantikan input tanggal polos: di
                  halaman pesan pun tanggal yang tidak bisa dipesan harus mati
                  sejak awal, bukan ditolak setelah tombol ditekan. */}
              {paket ? (
                <div className="mt-3">
                  <KalenderSlot
                    serviceId={paket.service_id}
                    kategori={kind}
                    tanggal={tanggal}
                    jam={jam}
                    onPilih={(t, j) => { setTanggal(t); setJam(j) }}
                    paket={paket}
                    jumlah={jumlah}
                    tambahan={tambahan}
                    onUbahDurasi={(n, t) => { setJumlah(n); setTambahan(t) }}
                  />
                </div>
              ) : (
                <p className="mt-3 text-[13px] text-muted">
                  Vendor ini belum menambahkan paket, jadi jadwalnya belum bisa dilihat.
                </p>
              )}

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="jenis" className="block text-[11px] font-semibold tracking-[0.06em] text-ink/70">
                    JENIS ACARA
                  </label>
                  <select
                    id="jenis"
                    value={jenisAcara}
                    onChange={(e) => setJenisAcara(e.target.value)}
                    className="mt-2 h-11 w-full rounded-sm border border-line bg-white px-3 text-[14px] outline-none focus:border-navy-900"
                  >
                    {JENIS_ACARA.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                {v.estimate && <OrderField {...v.estimate} value={estimasi} onChange={setEstimasi} />}
              </div>
            </OrderSection>

            <OrderSection title="Lokasi Acara" icon={<MapPinIcon className="h-4 w-4" />}>
              <div className="space-y-5">
                <OrderField id="venue" label={v.venueLabel} value={venue} onChange={setVenue} />
                <OrderTextarea id="alamat" label="ALAMAT LENGKAP" value={alamat} onChange={setAlamat} />
              </div>
            </OrderSection>

            <OrderSection title="Catatan untuk Vendor" icon={<NoteIcon />}>
              <OrderTextarea id="catatan" {...v.note} value={catatan} onChange={setCatatan} />
            </OrderSection>
          </OrderLayout>
        )
      }}
    </TukarHalus>
  )
}
