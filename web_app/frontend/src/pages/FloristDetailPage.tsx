import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import UlasanVendor from '../components/UlasanVendor'
import Img from '../components/Img'
import RincianLayanan from '../components/RincianLayanan'
import VendorLocation from '../components/VendorLocation'
import BackButton from '../components/BackButton'
import KalenderSlot from '../components/KalenderSlot'
import DetailSkeleton from '../components/DetailSkeleton'
import TukarHalus from '../components/TukarHalus'
import { ArrowRight } from '../components/icons'
import { serviceIcons } from '../components/serviceIcons'
import { categories, namaKota } from '../data/categories'
import { rupiah } from '../lib/format'
import {
  getVendor, getVendorServices, cekKetersediaan, urlFotoVendor,
  type ApiService, type ApiVendor,
} from '../lib/api'

const kategori = categories.florist

/** Hiasan yang TIDAK ada di database: headline dan ikon layanan.
 *  Galerinya memakai foto portofolio asli; slot yang kosong jatuh ke emoji
 *  kategori lewat <Img>. Sisanya — nama, kota, deskripsi, daftar layanan,
 *  harga — datang dari API. */
const HEADLINE = 'The Art Of Floristry'
const IKON = ['sparkle', 'table', 'heart', 'flower'] as const

export default function FloristDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const [vendor, setVendor] = useState<ApiVendor | null>(null)
  const [layanan, setLayanan] = useState<ApiService[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  // Nomor slot yang benar-benar terisi; gambarnya diambil terpisah.
  const [fotoSlot, setFotoSlot] = useState<number[]>([])

  // Tanggal & shift yang dipilih user, lalu hasil pengecekannya ke backend.
  const [tanggal, setTanggal] = useState('')
  // Sengaja kosong: KalenderSlot yang menentukan shift mana yang bebas.
  const [shift, setShift] = useState('')
  const [cek, setCek] = useState<{ ada: boolean; alasan: string | null } | null>(null)
  const [mengecek, setMengecek] = useState(false)

  useEffect(() => {
    Promise.all([getVendor(id), getVendorServices(id, kategori.apiCategory)])
      .then(([v, s]) => {
        setVendor(v.vendor)
        setFotoSlot(v.portfolio.map((f) => f.sort_order))
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
              <BackButton ke={`/${kategori.slug}`} />
              <p className="mt-6 text-[15px]">{galat || 'Vendor tidak ditemukan.'}</p>
            </div>
          )
        }

        return (
        <div className="mx-auto max-w-[1330px] px-6 pt-12 pb-20 md:px-12">
          <BackButton ke={`/${kategori.slug}`} />

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

            {/* Dulu lima kotak, padahal slot foto vendor cuma tiga — dua di
                antaranya dijamin jatuh ke emoji apa pun isinya. */}
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <Img
                src={fotoSlot.includes(0) ? urlFotoVendor(id, 0) : undefined}
                alt={`Portofolio ${vendor.business_name}`}
                emoji={kategori.emoji}
                tint={kategori.tint}
                className="h-[260px] w-full object-cover sm:col-span-2 lg:h-[520px]"
              />
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
                {[1, 2].map((n) => (
                  <Img
                    key={n}
                    src={fotoSlot.includes(n) ? urlFotoVendor(id, n) : undefined}
                    alt={`Portofolio ${vendor.business_name} ${n}`}
                    emoji={kategori.emoji}
                    tint={kategori.tint}
                    className="h-[180px] w-full object-cover lg:h-[255px]"
                  />
                ))}
              </div>
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
                        <RincianLayanan service={s} className="mt-2.5" />
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

              <p className="mt-5 text-[15px] font-semibold">Tanggal Acara</p>
              {/* Kalender menggantikan <input type="date"> + radio shift: tanggal
                  yang vendornya tidak buka, sudah penuh, atau masih di dalam
                  minimum_notice_days langsung mati di grid. */}
              {utama ? (
                <div className="mt-3">
                  <KalenderSlot
                    serviceId={utama.service_id}
                    tanggal={tanggal}
                    shift={shift}
                    onPilih={(t, sh) => { setTanggal(t); setShift(sh); setCek(null) }}
                  />
                </div>
              ) : (
                <p className="mt-3 text-[13px] text-muted">
                  Vendor ini belum menambahkan paket, jadi jadwalnya belum bisa dilihat.
                </p>
              )}

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

          <div className="mt-16">
            <UlasanVendor vendorId={id} />
          </div>
        </div>
        )
      }}
    </TukarHalus>
  )
}
