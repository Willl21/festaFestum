import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Img from '../components/Img'
import VendorLocation from '../components/VendorLocation'
import BackButton from '../components/BackButton'
import DetailSkeleton from '../components/DetailSkeleton'
import TukarHalus from '../components/TukarHalus'
import { ArrowRight, ChevronDown, PhotoIcon } from '../components/icons'
import { shifts } from '../data/shifts'
import { categories, namaKota } from '../data/categories'
import { rupiah } from '../lib/format'
import {
  getVendor, getVendorServices, cekKetersediaan,
  type ApiService, type ApiVendor,
} from '../lib/api'

const kategori = categories.mua

/** Headline hiasan; tidak ada kolomnya di database. */
const HEADLINE = 'The Art Of Beauty'

export default function MuaDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const [vendor, setVendor] = useState<ApiVendor | null>(null)
  const [layanan, setLayanan] = useState<ApiService[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

  // Paket yang dipilih = service_id, bukan namanya. Nama bisa kembar antar
  // vendor, service_id tidak.
  const [paketId, setPaketId] = useState('')
  const [tanggal, setTanggal] = useState('')
  const [shift, setShift] = useState(shifts[0].value as string)
  const [cek, setCek] = useState<{ ada: boolean; alasan: string | null } | null>(null)
  const [mengecek, setMengecek] = useState(false)

  useEffect(() => {
    Promise.all([getVendor(id), getVendorServices(id)])
      .then(([v, s]) => {
        const aktif = s.data.filter((x) => x.is_active)
        setVendor(v.vendor)
        setLayanan(aktif)
        if (aktif[0]) setPaketId(aktif[0].service_id)
      })
      .catch((e) => setGalat(e.message))
      .finally(() => setMemuat(false))
  }, [id])

  // Fallback ke paket pertama supaya panel tidak pernah menampilkan total kosong.
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
    <TukarHalus memuat={memuat} rangka={<DetailSkeleton label="Memuat detail makeup artist…" />}>
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
            {vendor.is_verified ? 'Vendor Terverifikasi' : 'Makeup Artist'} · {namaKota(vendor.city)}
          </span>

          {/* GALERI: dua blok, besar di kiri. Foto vendor belum ada. */}
          <section className="relative mt-6 grid gap-2.5 md:grid-cols-3">
            <Img
              alt={vendor.business_name}
              emoji={kategori.emoji}
              tint={kategori.tint}
              className="h-[300px] w-full object-cover md:col-span-2 md:h-[520px]"
            />
            <Img
              alt={`${vendor.business_name} 2`}
              emoji={kategori.emoji}
              tint={kategori.tint}
              className="h-[300px] w-full object-cover md:h-[520px]"
            />

            <button
              type="button"
              className="absolute right-4 bottom-4 flex items-center gap-2 rounded-sm bg-white/90 px-3 py-1.5 text-[12px] shadow-sm backdrop-blur transition-colors hover:bg-white"
            >
              <PhotoIcon />
              Lihat Semua Foto
            </button>
          </section>

          <div className="mt-14 grid gap-12 lg:grid-cols-[1fr_420px]">
            <div>
              <h2 className="font-display text-[26px] font-semibold">{HEADLINE}</h2>
              <p className="mt-5 max-w-[560px] text-[15px] leading-[1.85] text-ink/85">
                {vendor.description || 'Vendor ini belum menuliskan deskripsi.'}
              </p>

              <h2 className="mt-12 border-t border-line pt-12 font-display text-[26px] font-semibold">
                Paket Layanan
              </h2>

              {layanan.length === 0 && (
                <p className="mt-7 text-[14px] text-muted">Vendor ini belum menambahkan paket.</p>
              )}

              <div className="mt-7 grid gap-6 sm:grid-cols-2">
                {layanan.map((p) => (
                  <article key={p.service_id} className="flex flex-col border border-line bg-white p-5">
                    <h3 className="font-display text-[22px] font-semibold">{p.service_name}</h3>
                    {p.description && (
                      <p className="mt-3 text-[12px] leading-relaxed text-ink/75">{p.description}</p>
                    )}
                    <p className="mt-2 text-[12px] text-ink/75">
                      ✓ Pesan minimal {p.minimum_notice_days} hari sebelum acara
                    </p>

                    <div className="mt-auto border-t border-line pt-3">
                      <p className="mt-4 text-[11px] text-muted">Mulai dari</p>
                      <p className="font-display text-[21px] font-semibold">
                        {rupiah(Number(p.price))}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            {/* PANEL PEMESANAN */}
            <aside className="h-fit border border-line bg-white p-5 lg:sticky lg:top-[90px]">
              <p className="rounded-sm bg-navy-900 py-3.5 text-center text-[15px] font-semibold text-white">
                Atur Jadwal
              </p>

              <label htmlFor="paket" className="mt-5 block text-[14px] text-muted">
                Jenis Paket
              </label>
              <div className="relative mt-2">
                <select
                  id="paket"
                  value={paketId}
                  onChange={(e) => { setPaketId(e.target.value); setCek(null) }}
                  className="h-11 w-full appearance-none rounded-sm border border-line bg-white px-3 pr-9 text-[14px] outline-none focus:border-navy-900"
                >
                  {layanan.map((p) => (
                    <option key={p.service_id} value={p.service_id}>{p.service_name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50" />
              </div>

              <label htmlFor="event-date" className="mt-5 block text-[15px] font-semibold">
                Tanggal Acara
              </label>
              <input
                id="event-date"
                type="date"
                value={tanggal}
                onChange={(e) => { setTanggal(e.target.value); setCek(null) }}
                className="mt-2 w-full border-b border-line bg-transparent pb-1.5 text-[15px] outline-none"
              />

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
                    {s.label}
                  </label>
                ))}
              </div>

              <div className="mt-7 flex items-baseline justify-between border-t border-line pt-4">
                <span className="text-[15px] font-semibold">Total:</span>
                <span className="font-display text-[22px] font-semibold">
                  {dipilih ? rupiah(Number(dipilih.price)) : '-'}
                </span>
              </div>

              {cek && !cek.ada && (
                <p className="mt-4 border border-maroon/30 bg-maroon/5 px-3 py-2 text-[13px] text-maroon">
                  {cek.alasan || 'Slot tidak tersedia.'}
                </p>
              )}

              <button
                type="button"
                onClick={ajukan}
                disabled={mengecek || !dipilih}
                className="mt-4 flex h-11 w-full items-center justify-center gap-3 rounded-sm bg-amber text-[15px] font-semibold text-navy-900 transition-opacity hover:opacity-90 disabled:opacity-50"
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
