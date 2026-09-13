import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Img from '../components/Img'
import VendorLocation from '../components/VendorLocation'
import BackButton from '../components/BackButton'
import DetailSkeleton from '../components/DetailSkeleton'
import TukarHalus from '../components/TukarHalus'
import { ArrowRight, CalendarIcon, serviceIcons } from '../components/icons'
import { shifts } from '../data/shifts'
import { categories, namaKota } from '../data/categories'
import { rupiah } from '../lib/format'
import {
  getVendor, getVendorServices, cekKetersediaan,
  type ApiService, type ApiVendor,
} from '../lib/api'

const kategori = categories.florist

/** Hiasan yang TIDAK ada di database: headline dan ikon layanan. Foto vendor
 *  juga belum ada, jadi galerinya memakai emoji kategori lewat <Img>. Sisanya
 *  — nama, kota, deskripsi, daftar layanan, harga — datang dari API. */
const HEADLINE = 'The Art Of Floristry'
const IKON = ['sparkle', 'table', 'heart', 'flower'] as const

export default function FloristDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const [vendor, setVendor] = useState<ApiVendor | null>(null)
  const [layanan, setLayanan] = useState<ApiService[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

  // Tanggal & shift yang dipilih user, lalu hasil pengecekannya ke backend.
  const [tanggal, setTanggal] = useState('')
  const [shift, setShift] = useState(shifts[0].value as string)
  const [cek, setCek] = useState<{ ada: boolean; alasan: string | null } | null>(null)
  const [mengecek, setMengecek] = useState(false)

  useEffect(() => {
    Promise.all([getVendor(id), getVendorServices(id)])
      .then(([v, s]) => {
        setVendor(v.vendor)
        setLayanan(s.data.filter((x) => x.is_active))
      })
      .catch((e) => setGalat(e.message))
      .finally(() => setMemuat(false))
  }, [id])

  // Layanan pertama dipakai sebagai acuan harga & pengecekan jadwal. Satu
  // vendor bisa punya banyak layanan; pemilihan paket dilakukan di halaman
  // pesan berikutnya.
  const utama = layanan[0]

  async function ajukan() {
    if (!utama) return
    if (!tanggal) {
      setCek({ ada: false, alasan: 'Pilih tanggal acara dulu.' })
      return
    }

    setMengecek(true)
    try {
      const r = await cekKetersediaan({
        service_id: utama.service_id, event_date: tanggal, time_slot: shift,
      })
      setCek({ ada: r.available, alasan: r.reason })
      if (r.available) {
        navigate(`/${kategori.slug}/${id}/pesan?service=${utama.service_id}`
          + `&date=${tanggal}&slot=${shift}`)
      }
    } catch (e) {
      setCek({ ada: false, alasan: (e as Error).message })
    } finally {
      setMengecek(false)
    }
  }

  return (
    <TukarHalus memuat={memuat} rangka={<DetailSkeleton label="Memuat detail florist…" />}>
      {() => {
        if (galat || !vendor) {
          return (
            <div className="mx-auto max-w-[1330px] px-6 py-20">
              <BackButton fallback={`/${kategori.slug}`} />
              <p className="mt-6 text-[15px]">{galat || 'Vendor tidak ditemukan.'}</p>
            </div>
          )
        }

        return (
        <div className="mx-auto max-w-[1330px] px-6 pt-12 pb-20 md:px-12">
          <BackButton fallback={`/${kategori.slug}`} />

          <h1 className="mt-5 font-display text-[38px] font-semibold">{vendor.business_name}</h1>
          <span className="mt-3 inline-block rounded-full bg-pink-100 px-4 py-1.5 text-[13px] text-maroon">
            {vendor.is_verified ? 'Vendor Terverifikasi' : 'Florist'} · {namaKota(vendor.city)}
          </span>

          {/* GALERI: satu blok besar + empat kecil, seperti mockup. Foto vendor
              belum ada di /public/img, jadi semuanya jatuh ke emoji kategori. */}
          <section className="mt-6">
            <p className="mb-2 text-[11px] text-muted">
              <Link to={`/${kategori.slug}`} className="hover:underline">
                {kategori.label}
              </Link>{' '}
              &gt; {vendor.business_name}
            </p>

            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <Img
                alt={vendor.business_name}
                emoji={kategori.emoji}
                tint={kategori.tint}
                className="h-[260px] w-full object-cover sm:col-span-2 lg:h-[520px]"
              />
              {[1, 2, 3, 4].map((n) => (
                <Img
                  key={n}
                  alt={`${vendor.business_name} ${n}`}
                  emoji={kategori.emoji}
                  tint={kategori.tint}
                  className="h-[180px] w-full object-cover lg:h-[255px]"
                />
              ))}
            </div>
          </section>

          <div className="mt-14 grid gap-12 lg:grid-cols-[1fr_420px]">
            <div>
              <h2 className="font-display text-[26px] font-semibold">{HEADLINE}</h2>
              <p className="mt-5 max-w-[560px] text-[15px] leading-[1.85] text-ink/85">
                {vendor.description || 'Vendor ini belum menuliskan deskripsi.'}
              </p>

              <h2 className="mt-12 border-t border-line pt-12 font-display text-[26px] font-semibold">
                Layanan Tersedia
              </h2>

              {layanan.length === 0 && (
                <p className="mt-7 text-[14px] text-muted">Vendor ini belum menambahkan layanan.</p>
              )}

              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                {layanan.map((s, i) => {
                  const Icon = serviceIcons[IKON[i % IKON.length]]
                  return (
                    <div key={s.service_id} className="flex gap-3 border border-line bg-white p-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-100 text-maroon">
                        <Icon />
                      </span>
                      <div>
                        <h3 className="text-[13px] font-semibold">{s.service_name}</h3>
                        <p className="mt-1 text-[13px] leading-relaxed text-ink/75">
                          {s.description || `Minimal pesan ${s.minimum_notice_days} hari sebelum acara.`}
                        </p>
                        <p className="mt-1.5 text-[13px] font-semibold">{rupiah(Number(s.price))}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* PANEL PEMESANAN */}
            <aside className="h-fit border border-line bg-white p-5 lg:sticky lg:top-[90px]">
              <p className="rounded-sm bg-navy-900 py-3.5 text-center text-[15px] font-semibold text-white">
                Detail Informasi
              </p>

              <p className="mt-5 text-[14px] text-muted">Mulai dari</p>
              <p className="font-display text-[27px] font-semibold">
                {utama ? `${rupiah(Number(utama.price))}/paket` : '-'}
              </p>

              <label htmlFor="event-date" className="mt-5 block text-[15px] font-semibold">
                Tanggal Acara
              </label>
              <div className="relative mt-2 border-b border-line pb-1.5">
                <input
                  id="event-date"
                  type="date"
                  value={tanggal}
                  onChange={(e) => { setTanggal(e.target.value); setCek(null) }}
                  className="w-full bg-transparent pr-7 text-[15px] outline-none"
                />
                <CalendarIcon className="pointer-events-none absolute right-1 top-1 h-4 w-4 text-muted" />
              </div>

              <p className="mt-5 text-[15px] font-semibold">Shift Layanan</p>
              <div className="mt-3 grid grid-cols-2 gap-4">
                {shifts.map((s) => (
                  <label
                    key={s.value}
                    className="cursor-pointer border border-line py-2.5 text-center text-[13px] has-checked:border-navy-900 has-checked:bg-lavender/40"
                  >
                    <input
                      type="radio"
                      name="shift"
                      value={s.value}
                      checked={shift === s.value}
                      onChange={() => { setShift(s.value); setCek(null) }}
                      className="sr-only"
                    />
                    <span className="block font-medium">{s.label}</span>
                    <span className="block text-muted">{s.hours}</span>
                  </label>
                ))}
              </div>

              {/* Ketersediaan dicek ke backend dulu. Kalau slotnya penuh atau lead
                  time belum terpenuhi, user tahu di sini — bukan setelah isi form. */}
              {cek && !cek.ada && (
                <p className="mt-4 border border-maroon/30 bg-maroon/5 px-3 py-2 text-[13px] text-maroon">
                  {cek.alasan || 'Slot tidak tersedia.'}
                </p>
              )}

              <button
                type="button"
                onClick={ajukan}
                disabled={mengecek || !utama}
                className="mt-6 flex h-11 w-full items-center justify-center gap-3 rounded-sm bg-amber text-[15px] font-semibold text-navy-900 transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {mengecek ? 'Mengecek jadwal…' : 'Ajukan Pesanan'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </aside>
          </div>

          <div className="mt-16">
            <VendorLocation />
          </div>
        </div>
        )
      }}
    </TukarHalus>
  )
}
