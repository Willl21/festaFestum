import { useEffect, useState } from 'react'
import KalenderSlot from '../components/KalenderSlot'
import FormSkeleton from '../components/FormSkeleton'
import TukarHalus from '../components/TukarHalus'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import OrderLayout, { OrderField, OrderSection, OrderTextarea } from '../components/OrderLayout'
import { CalendarIcon, ChevronDown, NoteIcon } from '../components/icons'
import { categories } from '../data/categories'
import {
  getVendor, getVendorServices, buatBooking,
  type ApiService, type ApiVendor,
} from '../lib/api'

const kat = categories.attire

const sizes = ['S', 'M', 'L', 'XL', 'XLL']
const colors = ['Hitam', 'Navy', 'Hijau tua']

/** Sewa busana tidak punya "jenis acara" di mockup, tapi POST /bookings
 *  mewajibkannya. 'wedding' dipakai sebagai default karena itu yang paling
 *  umum untuk jas & kebaya; user tetap bisa mengubahnya. */
const JENIS_ACARA = [
  { value: 'wedding', label: 'Pernikahan' },
  { value: 'engagement', label: 'Lamaran' },
  { value: 'graduation', label: 'Wisuda' },
  { value: 'gala_dinner', label: 'Gala Dinner' },
  { value: 'corporate_seminar', label: 'Seminar / Korporat' },
]

export default function AttireOrderPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const [vendor, setVendor] = useState<ApiVendor | null>(null)
  const [layanan, setLayanan] = useState<ApiService[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  const [mengirim, setMengirim] = useState(false)

  // Dibawa dari halaman detail.
  const [serviceId, setServiceId] = useState(params.get('service') ?? '')
  // Jumlah barang yang dipesan. Dikirim sebagai `quantity` dan dipakai backend
  // untuk mengalikan harga sekaligus memotong kapasitas harian vendor.
  const [jumlah, setJumlah] = useState(1)
  const [ukuran, setUkuran] = useState(params.get('size') ?? '')
  const [tglSewa, setTglSewa] = useState(params.get('date') ?? '')
  // Tanpa nilai bawaan. Dulu shift dipatok 'pagi' diam-diam, jadi penyewaan
  // di tanggal yang slot paginya penuh gagal tanpa penyewa pernah diberi
  // pilihan; sekarang jamnya diketik sendiri dan tidak mengunci apa pun.
  const [jam, setJam] = useState(params.get('jam') ?? '')
  const [tglAmbil, setTglAmbil] = useState(params.get('ambil') ?? '')
  const [fitting, setFitting] = useState(params.get('fitting') !== 'false')
  const [tglFitting, setTglFitting] = useState(params.get('tglFitting') ?? '')

  const [warna, setWarna] = useState('')
  const [jamFitting, setJamFitting] = useState('')
  const [jenisAcara, setJenisAcara] = useState(JENIS_ACARA[0].value)
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
  const satuanHarga = paket ? Number(paket.price) : 0
  // Sewa jas/kebaya memotong stok harian vendor sebanyak jumlah setel ini.
  const harga = satuanHarga * jumlah

  async function ajukan() {
    setGalat('')
    if (!paket) return setGalat('Vendor ini belum punya layanan aktif.')
    if (!tglSewa) return setGalat('Tanggal sewa wajib diisi.')
    if (!jam) return setGalat('Pilih jam dulu.')
    if (!ukuran) return setGalat('Ukuran wajib dipilih.')
    if (!tglAmbil) return setGalat('Tanggal pengambilan wajib diisi.')

    // Tabel bookings tidak punya kolom ukuran/warna/fitting. Semuanya
    // dititipkan ke event_location_detail; menambah kolom demi satu kategori
    // bukan tukar-tambah yang sepadan menjelang tenggat.
    const detail = [
      `Sewa ${kat.label} — ukuran ${ukuran}${warna ? `, warna ${warna}` : ''}`,
      tglAmbil && `Pengambilan: ${tglAmbil}`,
      fitting
        ? `Fitting: ${tglFitting || 'tanggal menyusul'}${jamFitting ? ` ${jamFitting}` : ''}`
        : 'Tanpa fitting',
      catatan.trim() && `Catatan: ${catatan.trim()}`,
    ].filter(Boolean).join('\n')

    setMengirim(true)
    try {
      const r = await buatBooking({
        service_id: paket.service_id,
        event_date: tglSewa,
        start_time: jam,
        event_type: jenisAcara,
        event_location_detail: detail,
        quantity: jumlah,
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
              satuan: jumlah > 1 ? `× ${jumlah}` : undefined,
              price: harga,
              dp: Math.round(harga * 0.3),
              tint: kat.tint,
              backTo: `/${kat.slug}/${id}`,
            }}
            onSubmit={ajukan}
            mengirim={mengirim}
            galat={galat}
          >
            {/* Sewa busana tidak punya lokasi acara — yang dibutuhkan ukuran,
                warna, dan tiga tanggal (sewa, pengambilan, fitting). */}
            <OrderSection title="Informasi Acara" icon={<CalendarIcon />}>
              {layanan.length > 1 && (
                <div className="mb-5">
                  <Select
                    id="paket" label="KOLEKSI YANG DISEWA"
                    value={serviceId} onChange={setServiceId}
                    options={layanan.map((s) => ({ value: s.service_id, label: s.service_name }))}
                  />
                </div>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <Select
                  id="ukuran" label="PILIH UKURAN" value={ukuran} onChange={setUkuran}
                  options={sizes.map((s) => ({ value: s, label: s }))}
                />
                <Select
                  id="warna" label="PILIH WARNA" value={warna} onChange={setWarna}
                  options={colors.map((c) => ({ value: c, label: c }))}
                />
                <OrderField
                  id="jumlah" label="JUMLAH SETEL" type="number" placeholder="1"
                  value={String(jumlah)}
                  onChange={(v) => setJumlah(Math.min(999, Math.max(1, Number(v) || 1)))}
                />
                <Select
                  id="jenis" label="JENIS ACARA" value={jenisAcara} onChange={setJenisAcara}
                  options={JENIS_ACARA}
                />
              </div>

              <p className="mt-6 block text-[11px] font-semibold tracking-[0.06em] text-ink/70">
                TANGGAL SEWA
              </p>
              {paket ? (
                <div className="mt-3">
                  <KalenderSlot
                    serviceId={paket.service_id}
                    tanggal={tglSewa}
                    jam={jam}
                    labelJam="Jam Pengambilan"
                    keteranganJam="Jam Anda mengambil setelannya di gerai vendor."
                    onPilih={(t, j) => { setTglSewa(t); setJam(j) }}
                  />
                </div>
              ) : (
                <p className="mt-3 text-[13px] text-muted">
                  Vendor ini belum menambahkan paket, jadi jadwalnya belum bisa dilihat.
                </p>
              )}

              {/* Sama seperti panel di halaman detail: yang bergantung pada
                  tanggal sewa baru muncul setelah tanggal sewanya ada. Dulu
                  TANGGAL PENGAMBILAN malah duduk di grid paling atas, di ATAS
                  tanggal sewa yang membatasinya. */}
              {tglSewa && (
                <div className="mt-6 max-w-[320px]">
                  <OrderField
                    id="tanggal-ambil" label="TANGGAL PENGAMBILAN" type="date"
                    value={tglAmbil} onChange={setTglAmbil}
                  />
                </div>
              )}

              {tglSewa && tglAmbil && (
                <>
              <fieldset className="mt-6 flex items-center gap-6">
                <legend className="float-left mr-6 text-[11px] font-semibold tracking-[0.06em] text-ink/70">
                  PERLU FITTING?
                </legend>
                {[
                  { label: 'Ya', value: true },
                  { label: 'Tidak', value: false },
                ].map((o) => (
                  <label key={o.label} className="flex cursor-pointer items-center gap-2 text-[14px]">
                    <input
                      type="radio"
                      name="fitting"
                      checked={fitting === o.value}
                      onChange={() => setFitting(o.value)}
                      className="h-4 w-4 accent-ink"
                    />
                    {o.label}
                  </label>
                ))}
              </fieldset>

              {fitting && (
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <OrderField
                    id="tanggal-fitting" label="TANGGAL FITTING" type="date"
                    value={tglFitting} onChange={setTglFitting}
                  />
                  <OrderField
                    id="jam-fitting" label="JAM FITTING" type="time"
                    value={jamFitting} onChange={setJamFitting}
                  />
                </div>
              )}
                </>
              )}
            </OrderSection>

            <OrderSection title="Catatan untuk Vendor" icon={<NoteIcon />}>
              <OrderTextarea id="catatan" label="REQUEST KHUSUS" value={catatan} onChange={setCatatan} />
            </OrderSection>
          </OrderLayout>
        )
      }}
    </TukarHalus>
  )
}

function Select({
  id, label, options, value, onChange,
}: {
  id: string
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-semibold tracking-[0.06em] text-ink/70">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-2 h-11 w-full appearance-none rounded-sm border border-line bg-white px-3 pr-9 text-[14px] outline-none focus:border-navy-900"
        >
          <option value="" disabled>
            Pilih…
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 bottom-3.5 h-4 w-4 text-ink/50" />
      </div>
    </div>
  )
}
