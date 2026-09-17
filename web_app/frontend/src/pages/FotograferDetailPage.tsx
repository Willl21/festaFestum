import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import UlasanVendor from '../components/UlasanVendor'
import Img from '../components/Img'
import BackButton from '../components/BackButton'
import KalenderSlot from '../components/KalenderSlot'
import DetailSkeleton from '../components/DetailSkeleton'
import TukarHalus from '../components/TukarHalus'
import { ArrowRight, CheckCircleIcon, ChevronDown } from '../components/icons'
import { categories, namaKota } from '../data/categories'
import { rupiah } from '../lib/format'
import {
  getVendor, getVendorServices, cekKetersediaan,
  type ApiService, type ApiVendor,
} from '../lib/api'

const kategori = categories.fotografer

/** Spesifikasi alat tidak punya kolom di database — ini hiasan mockup yang
 *  dibiarkan statis sampai ada tabelnya. */
const GEAR = [
  'Sony A7R IV & A7S III',
  'G-Master Prime Lenses (24mm, 35mm, 85mm)',
  'Profoto B10X Studio Lighting',
  'DJI Mavic 3 Pro (Aerial)',
]

const CAPTION = ['Wisuda', '', '', 'Potret Editorial']

export default function FotograferDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const [vendor, setVendor] = useState<ApiVendor | null>(null)
  const [layanan, setLayanan] = useState<ApiService[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

  const [paketId, setPaketId] = useState('')
  const [tanggal, setTanggal] = useState('')
  // Sengaja kosong: KalenderSlot yang menentukan shift mana yang bebas.
  const [shift, setShift] = useState('')
  const [cek, setCek] = useState<{ ada: boolean; alasan: string | null } | null>(null)
  const [mengecek, setMengecek] = useState(false)

  useEffect(() => {
    Promise.all([getVendor(id), getVendorServices(id, kategori.apiCategory)])
      .then(([v, s]) => {
        const aktif = s.data.filter((x) => x.is_active)
        setVendor(v.vendor)
        setLayanan(aktif)
        if (aktif[0]) setPaketId(aktif[0].service_id)
      })
      .catch((e) => setGalat(e.message))
      .finally(() => setMemuat(false))
  }, [id])

  const dipilih = layanan.find((p) => p.service_id === paketId) ?? layanan[0]

  async function ajukan() {
    if (!dipilih) return
    if (!tanggal) {
      setCek({ ada: false, alasan: 'Pilih tanggal acara dulu.' })
      return
    }

    setMengecek(true)
    try {
      const r = await cekKetersediaan({
        service_id: dipilih.service_id, event_date: tanggal, time_slot: shift,
      })
      setCek({ ada: r.available, alasan: r.reason })
      if (r.available) {
        navigate(`/${kategori.slug}/${id}/pesan?service=${dipilih.service_id}`
          + `&date=${tanggal}&slot=${shift}`)
      }
    } catch (e) {
      setCek({ ada: false, alasan: (e as Error).message })
    } finally {
      setMengecek(false)
    }
  }

  return (
    <TukarHalus memuat={memuat} rangka={<DetailSkeleton label="Memuat detail fotografer…" />}>
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
          <p className="mt-2 text-[14px] text-[#2e6b52]">
            {kategori.label} · {namaKota(vendor.city)}
            {vendor.is_verified && ' · Terverifikasi'}
          </p>
          <p className="mt-3 max-w-[620px] text-[15px] leading-relaxed text-ink/75">
            {vendor.description || 'Vendor ini belum menuliskan deskripsi.'}
          </p>

          {/* PORTOFOLIO — foto belum ada, semuanya jatuh ke emoji kategori. */}
          <section className="mt-10">
            <h2 className="font-display text-[19px] font-semibold">Portofolio</h2>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <Photo n={0} nama={vendor.business_name} className="h-[300px] md:col-span-2 md:h-[510px]" />
              <div className="grid gap-3">
                <Photo n={1} nama={vendor.business_name} className="h-[180px] md:h-[249px]" />
                <Photo n={2} nama={vendor.business_name} className="h-[180px] md:h-[249px]" />
              </div>
              <Photo n={3} nama={vendor.business_name} className="h-[300px] md:h-[510px]" />
            </div>
          </section>

          {/* PAKET */}
          <section className="mt-12 border-t border-line pt-12">
            <h2 className="font-display text-[26px] font-semibold">Paket Dokumentasi</h2>

            {layanan.length === 0 && (
              <p className="mt-6 text-[14px] text-muted">Vendor ini belum menambahkan paket.</p>
            )}

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {layanan.map((p) => {
                // "Terpopuler" ditandai pada paket termahal — tidak ada kolomnya
                // di DB, jadi ini turunan, bukan data.
                const populer = layanan.length > 1
                  && Number(p.price) === Math.max(...layanan.map((x) => Number(x.price)))

                return (
                  <article
                    key={p.service_id}
                    className={`relative flex flex-col rounded-sm bg-lavender/50 p-6 ${
                      populer ? 'border-2 border-amber' : ''
                    }`}
                  >
                    {populer && (
                      <span className="absolute -top-3 right-5 rounded-full bg-amber px-3 py-0.5 text-[10px] font-semibold text-navy-900">
                        Terpopuler
                      </span>
                    )}

                    <div className="flex items-start justify-between gap-4">
                      <h3 className="font-display text-[20px] font-semibold">{p.service_name}</h3>
                      <p className="shrink-0 text-right text-[15px] font-semibold">
                        Rp
                        <br />
                        {Number(p.price).toLocaleString('id-ID')}
                      </p>
                    </div>
                    <p className="mt-2 text-[12px] leading-relaxed text-ink/70">{p.description}</p>

                    <ul className="mt-5 space-y-2 text-[12px] text-ink/85">
                      <li className="flex items-start gap-2">
                        <CheckCircleIcon className="mt-px h-3.5 w-3.5 shrink-0 text-[#2e6b52]" />
                        Pesan minimal {p.minimum_notice_days} hari sebelum acara
                      </li>
                    </ul>

                    <button
                      type="button"
                      onClick={() => { setPaketId(p.service_id); setCek(null) }}
                      className="mt-auto pt-6"
                    >
                      <span className="block rounded-sm bg-ink py-2.5 text-center text-[12px] font-semibold text-white transition-opacity hover:opacity-90">
                        {paketId === p.service_id ? 'Paket Dipilih' : 'Pilih Paket'}
                      </span>
                    </button>
                  </article>
                )
              })}
            </div>
          </section>

          {/* SPESIFIKASI ALAT */}
          <section className="mt-12">
            <h2 className="font-display text-[19px] font-semibold">Spesifikasi Alat</h2>
            <div className="mt-4 flex flex-wrap gap-3 rounded-sm bg-lavender/30 p-5">
              {GEAR.map((g) => (
                <span
                  key={g}
                  className="flex items-center gap-2 rounded-sm border border-line bg-white px-3 py-2 text-[12px]"
                >
                  <span className="h-2 w-2 rounded-full bg-navy-900" />
                  {g}
                </span>
              ))}
            </div>
          </section>

          {/* ATUR JADWAL */}
          <section className="mt-12 border-t border-line pt-12">
            <h2 className="font-display text-[26px] font-semibold">Atur Jadwal</h2>

            <div className="mt-6 max-w-[860px] border border-line bg-white p-7">
              <label htmlFor="paket" className="block text-[15px] font-semibold">
                Jenis Paket
              </label>
              <div className="relative mt-2 max-w-[300px]">
                <select
                  id="paket"
                  value={paketId}
                  onChange={(e) => { setPaketId(e.target.value); setCek(null) }}
                  className="h-12 w-full appearance-none rounded-sm border border-line bg-white px-3 pr-9 text-[15px] outline-none focus:border-navy-900"
                >
                  {layanan.map((p) => (
                    <option key={p.service_id} value={p.service_id}>{p.service_name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50" />
              </div>

              <p className="mt-6 text-[15px] font-semibold">Tanggal Acara</p>
              {/* Kalender menggantikan <input type="date"> + radio shift: tanggal
                  yang vendornya tidak buka, sudah penuh, atau masih di dalam
                  minimum_notice_days langsung mati di grid. */}
              {dipilih ? (
                <div className="mt-3">
                  <KalenderSlot
                    serviceId={dipilih.service_id}
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

              {cek && !cek.ada && (
                <p className="mt-5 max-w-[420px] border border-maroon/30 bg-maroon/5 px-3 py-2 text-[13px] text-maroon">
                  {cek.alasan || 'Slot tidak tersedia.'}
                </p>
              )}

              <button
                type="button"
                onClick={ajukan}
                disabled={mengecek || !dipilih}
                className="mt-7 flex h-11 w-full max-w-[220px] items-center justify-center gap-3 rounded-sm bg-amber text-[15px] font-semibold text-navy-900 transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {mengecek ? 'Mengecek…' : 'Ajukan Pesanan'}
                <ArrowRight className="h-4 w-4" />
              </button>

              <p className="mt-5 text-[13px] text-muted">
                Paket dipilih:{' '}
                <span className="font-semibold text-ink">{dipilih?.service_name ?? '-'}</span>
                {dipilih && ` — ${rupiah(Number(dipilih.price))}`}
              </p>
            </div>
          </section>

          <div className="mt-16">
            <UlasanVendor vendorId={id} />
          </div>
        </div>
        )
      }}
    </TukarHalus>
  )
}

function Photo({ n, nama, className }: { n: number; nama: string; className: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <Img
        alt={`${nama} ${n + 1}`}
        emoji={kategori.emoji}
        tint={kategori.tint}
        className="h-full w-full object-cover"
      />
      {CAPTION[n] && (
        <span className="absolute bottom-3 left-3 bg-black/45 px-2 py-1 text-[11px] text-white backdrop-blur-sm">
          {CAPTION[n]}
        </span>
      )}
    </div>
  )
}
