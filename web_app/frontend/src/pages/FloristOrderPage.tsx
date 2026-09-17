import { useEffect, useState } from 'react'
import KalenderSlot from '../components/KalenderSlot'
import FormSkeleton from '../components/FormSkeleton'
import TukarHalus from '../components/TukarHalus'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import OrderLayout, { OrderField, OrderSection, OrderTextarea } from '../components/OrderLayout'
import { CalendarIcon, MapPinIcon, NoteIcon } from '../components/icons'
import { categories } from '../data/categories'
import {
  getVendor, getVendorServices, buatBooking,
  type ApiService, type ApiVendor,
} from '../lib/api'

const kat = categories.florist

const tabs = [
  { id: 'acara', label: 'BUNGA ACARA' },
  { id: 'buket', label: 'BUKET / HADIAH' },
] as const

const JENIS_ACARA = [
  { value: 'wedding', label: 'Pernikahan' },
  { value: 'engagement', label: 'Lamaran' },
  { value: 'graduation', label: 'Wisuda' },
  { value: 'gala_dinner', label: 'Gala Dinner' },
  { value: 'corporate_seminar', label: 'Seminar / Korporat' },
]

export default function FloristOrderPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const [tab, setTab] = useState<'acara' | 'buket'>('acara')

  const [vendor, setVendor] = useState<ApiVendor | null>(null)
  const [layanan, setLayanan] = useState<ApiService[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [mengirim, setMengirim] = useState(false)

  const [serviceId, setServiceId] = useState(params.get('service') ?? '')
  const [tanggal, setTanggal] = useState(params.get('date') ?? '')
  const [shift, setShift] = useState(params.get('slot') ?? '')
  const [jenisAcara, setJenisAcara] = useState(JENIS_ACARA[0].value)
  const [durasi, setDurasi] = useState('')

  // Tab "acara"
  const [venue, setVenue] = useState('')
  const [alamat, setAlamat] = useState('')

  // Tab "buket"
  const [penerima, setPenerima] = useState('')
  const [telp, setTelp] = useState('')
  const [alamatKirim, setAlamatKirim] = useState('')
  const [ucapan, setUcapan] = useState('')
  const [pengirim, setPengirim] = useState('')

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
  }, [id, params])

  const paket = layanan.find((s) => s.service_id === serviceId) ?? layanan[0]
  const harga = paket ? Number(paket.price) : 0

  async function ajukan() {
    setGalat('')
    if (!paket) return setGalat('Vendor ini belum punya layanan aktif.')
    if (!tanggal) return setGalat('Tanggal acara wajib diisi.')

    if (tab === 'acara' && (!venue.trim() || !alamat.trim())) {
      return setGalat('Venue dan alamat lengkap wajib diisi.')
    }
    if (tab === 'buket' && (!penerima.trim() || !alamatKirim.trim())) {
      return setGalat('Nama penerima dan alamat pengiriman wajib diisi.')
    }

    // Dua tab menghasilkan isi yang berbeda, tapi dituangkan ke satu kolom
    // event_location_detail — tabel bookings tidak punya kolom pengiriman.
    const detail = tab === 'acara'
      ? [
          `Bunga acara — ${venue.trim()} — ${alamat.trim()}`,
          durasi && `Estimasi durasi: ${durasi}`,
          catatan.trim() && `Catatan: ${catatan.trim()}`,
        ].filter(Boolean).join('\n')
      : [
          `Buket/hadiah untuk ${penerima.trim()}${telp.trim() ? ` (${telp.trim()})` : ''}`,
          `Alamat kirim: ${alamatKirim.trim()}`,
          ucapan.trim() && `Kartu ucapan: "${ucapan.trim()}"`,
          pengirim.trim() && `Dari: ${pengirim.trim()}`,
          catatan.trim() && `Catatan: ${catatan.trim()}`,
        ].filter(Boolean).join('\n')

    setMengirim(true)
    try {
      const r = await buatBooking({
        service_id: paket.service_id,
        event_date: tanggal,
        time_slot: shift,
        event_type: jenisAcara,
        event_location_detail: detail,
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
              price: harga,
              dp: Math.round(harga * 0.3),
              emoji: kat.emoji,
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
                    onChange={(e) => setServiceId(e.target.value)}
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
              {/* Kalender menggantikan input tanggal + dropdown shift. */}
              {paket ? (
                <div className="mt-3">
                  <KalenderSlot
                    serviceId={paket.service_id}
                    tanggal={tanggal}
                    shift={shift}
                    onPilih={(t, sh) => { setTanggal(t); setShift(sh) }}
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
                <OrderField
                  id="durasi" label="ESTIMASI DURASI ACARA" placeholder="Contoh: 4 jam"
                  value={durasi} onChange={setDurasi}
                />
              </div>
            </OrderSection>

            {/* Bunga untuk acara dan buket hadiah butuh data yang beda:
                yang satu lokasi venue, yang satu alamat + kartu ucapan penerima. */}
            <OrderSection title="Lokasi/Pengiriman" icon={<MapPinIcon className="h-4 w-4" />}>
              <div className="-mt-6 flex border-b border-line">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    aria-pressed={tab === t.id}
                    className={`flex-1 border-b-2 pb-3 text-[12px] font-semibold tracking-[0.06em] transition-colors ${
                      tab === t.id ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'acara' ? (
                <div className="mt-6 space-y-5">
                  <OrderField id="venue" label="NAMA VENUE/ LOKASI" value={venue} onChange={setVenue} />
                  <OrderTextarea id="alamat" label="ALAMAT LENGKAP" rows={5} value={alamat} onChange={setAlamat} />
                </div>
              ) : (
                <div className="mt-6 space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <OrderField
                      id="penerima"
                      label="NAMA PENERIMA"
                      placeholder="Nama lengkap penerima buket/hadiah"
                      value={penerima} onChange={setPenerima}
                    />
                    <OrderField
                      id="telp-penerima"
                      label="NOMOR TELEPON / WHATSAPP PENERIMA"
                      type="tel"
                      placeholder="Contoh: 0812-3456-7890"
                      value={telp} onChange={setTelp}
                    />
                  </div>
                  <OrderTextarea
                    id="alamat-kirim"
                    label="ALAMAT LENGKAP PENGIRIMAN"
                    placeholder="Detail jalan, nomor rumah, lantai/apartemen, patokan"
                    rows={3}
                    value={alamatKirim} onChange={setAlamatKirim}
                  />
                  <div className="border-t border-line pt-5">
                    <OrderTextarea
                      id="ucapan"
                      label="PESAN PADA KARTU UCAPAN (GREETING CARD)"
                      placeholder="Tuliskan ucapan istimewa untuk penerima..."
                      rows={3}
                      value={ucapan} onChange={setUcapan}
                    />
                  </div>
                  <div className="sm:w-1/2 sm:pr-2.5">
                    <OrderField
                      id="pengirim"
                      label="DARI (PENGIRIM DI KARTU)"
                      placeholder="Tampilkan nama pengirim atau Anonim"
                      value={pengirim} onChange={setPengirim}
                    />
                  </div>
                </div>
              )}
            </OrderSection>

            <OrderSection title="Catatan untuk Vendor" icon={<NoteIcon />}>
              <OrderTextarea
                id="catatan" label="REQUEST KONSEP ATAU MOMEN KHUSUS"
                value={catatan} onChange={setCatatan}
              />
            </OrderSection>
          </OrderLayout>
        )
      }}
    </TukarHalus>
  )
}
