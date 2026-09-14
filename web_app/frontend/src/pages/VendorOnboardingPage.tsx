import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { inputClass } from '../components/AuthLayout'
import { ArrowRight, FolderIcon, PhotoIcon, UploadCloudIcon } from '../components/icons'
import { categories } from '../data/categories'
import { getMyVendor, kirim, tambahLayanan, type ApiVendor } from '../lib/api'

/** Langkah 3 onboarding vendor: lengkapi profil bisnis.
 *
 *  Dua hal yang sengaja beda dari mockup:
 *  - Mockup mengunci lokasi ke "Jabodetabek", padahal kolom `city` di DB
 *    adalah enum per wilayah dan dipakai untuk filter pencarian. Vendor
 *    tanpa kota tidak akan muncul di discovery, jadi di sini jadi pilihan.
 *  - Unggah portofolio belum ada penyimpanannya, jadi kotaknya dimatikan
 *    alih-alih pura-pura menerima file.
 *    ponytail: foto ditunda; upgrade-nya Supabase Storage + kolom di services. */

const kota = [
  'jakarta_pusat', 'jakarta_utara', 'jakarta_barat', 'jakarta_selatan', 'jakarta_timur',
  'bogor', 'depok', 'tangerang', 'tangerang_selatan', 'bekasi',
]

/** Rentang harga dipakai sebagai harga awal layanan pertama (batas bawahnya).
 *  Vendor bisa memperbaiki angka persisnya di halaman Layanan. */
const rentangHarga = [
  { label: 'Rp 1 juta – Rp 5 juta', price: 1_000_000 },
  { label: 'Rp 5 juta – Rp 15 juta', price: 5_000_000 },
  { label: 'Rp 15 juta – Rp 50 juta', price: 15_000_000 },
  { label: 'Di atas Rp 50 juta', price: 50_000_000 },
]

const labelKota = (k: string) =>
  k.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')

export default function VendorOnboardingPage() {
  const navigate = useNavigate()
  const state = (useLocation().state ?? {}) as { vendorId?: string; category?: string }

  const [vendorId, setVendorId] = useState(state.vendorId ?? '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Kalau halaman ini dibuka ulang (refresh / masuk lagi), id vendornya
  // diambil dari backend, bukan dari state navigasi yang sudah hilang.
  useEffect(() => {
    if (vendorId) return
    getMyVendor()
      .then(({ vendor }) => setVendorId(vendor.vendor_id))
      .catch((err) => setError((err as Error).message))
  }, [vendorId])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const form = new FormData(e.currentTarget)
    try {
      await kirim<{ vendor: ApiVendor }>(`/vendors/${vendorId}`, 'PATCH', {
        description: form.get('description'),
        city: form.get('city'),
      })

      // Layanan pertama dibuat dari kategori yang dipilih saat mendaftar.
      // Kalau statenya hilang (halaman dibuka langsung), langkah ini
      // dilewati — vendor tetap bisa menambah layanan di /vendor/layanan.
      const category = state.category
      if (category) {
        const harga = rentangHarga[Number(form.get('rentang'))]
        const label = Object.values(categories).find((c) => c.apiCategory === category)?.label
        await tambahLayanan(vendorId, {
          service_name: `Paket ${label ?? 'Layanan'} Dasar`,
          category,
          price: harga.price,
          description: form.get('description'),
        })
      }

      navigate('/vendor')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream px-4 py-12">
      <h1 className="text-center font-display text-[36px] font-semibold text-navy-900">
        Festa Vendor
      </h1>

      <div className="mx-auto mt-10 w-full max-w-[800px]">
        <div className="flex items-baseline justify-between text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
          <span>Langkah 3 dari 3</span>
          <span>Profil Bisnis</span>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-lavender">
          <div className="h-full w-full rounded-full bg-navy-900" />
        </div>

        <h2 className="mt-8 font-display text-[30px] font-semibold text-navy-900">
          Selamat Datang di Festa, Vendor.
        </h2>
        <p className="mt-2 max-w-[620px] text-[14px] leading-relaxed text-muted">
          Mari mulai dengan menceritakan sedikit tentang bisnis Anda dan mengunggah portofolio
          terbaik untuk menarik klien premium kami.
        </p>

        <form onSubmit={handleSubmit} className="mt-8">
          <section className="rounded-lg border border-line bg-white p-7">
            <h2 className="flex items-center gap-2 font-display text-[22px] font-semibold text-navy-900">
              <FolderIcon className="h-5 w-5 text-amber" />
              Detail Bisnis
            </h2>

            <label htmlFor="description" className="mt-5 block text-[13px] font-semibold text-navy-900">
              Deskripsi Singkat Bisnis
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={4}
              placeholder="Ceritakan keahlian unik layanan Anda…"
              className="mt-2 w-full rounded border border-line bg-cream px-4 py-3 text-[14px] text-ink outline-none placeholder:text-ink/35 focus:border-navy-900"
            />

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="rentang" className="block text-[13px] font-semibold text-navy-900">
                  Rentang Harga Layanan (IDR)
                </label>
                <select id="rentang" name="rentang" required defaultValue="" className={`mt-2 ${inputClass}`}>
                  <option value="" disabled>
                    Pilih rentang harga
                  </option>
                  {rentangHarga.map((r, i) => (
                    <option key={r.label} value={i}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="city" className="block text-[13px] font-semibold text-navy-900">
                  Lokasi Operasional Utama
                </label>
                <select id="city" name="city" required defaultValue="" className={`mt-2 ${inputClass}`}>
                  <option value="" disabled>
                    Pilih wilayah
                  </option>
                  {kota.map((k) => (
                    <option key={k} value={k}>
                      {labelKota(k)}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[12px] text-muted">
                  Festa saat ini beroperasi eksklusif di area Jabodetabek.
                </p>
              </div>
            </div>
          </section>

          <h2 className="mt-10 flex items-center gap-2 font-display text-[22px] font-semibold text-navy-900">
            <PhotoIcon className="h-5 w-5 text-amber" />
            Portofolio Terbaik
          </h2>
          <p className="mt-3 max-w-[720px] text-[14px] leading-relaxed text-muted">
            Unggah 3 foto representatif untuk memamerkan kualitas layanan Anda. Gambar ini akan
            menjadi kesan pertama di etalase marketplace.
          </p>

          {/* Belum ada penyimpanan file, jadi kotaknya tampil mati — supaya
              tidak terlihat seperti unggahan yang berhasil lalu hilang. */}
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="flex min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-line bg-white/60 text-center opacity-70">
              <UploadCloudIcon className="h-7 w-7 text-ink/40" />
              <p className="mt-3 text-[13px] font-semibold text-navy-900">Foto Utama (Hero Image)</p>
              <p className="mt-1 text-[12px] text-muted">Unggah foto belum tersedia</p>
            </div>
            <div className="grid gap-4">
              {['Foto 2', 'Foto 3'].map((f) => (
                <div
                  key={f}
                  className="flex min-h-[112px] flex-col items-center justify-center rounded-lg border border-dashed border-line bg-white/60 text-center opacity-70"
                >
                  <PhotoIcon className="h-5 w-5 text-ink/40" />
                  <p className="mt-2 text-[12px] text-muted">{f}</p>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-8 text-[14px] text-maroon">
              {error}
            </p>
          )}

          <div className="mt-10 flex justify-end border-t border-line pt-8">
            <button
              type="submit"
              disabled={loading || !vendorId}
              className="flex h-12 items-center gap-2 rounded-lg bg-ink px-7 text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? 'Menyimpan…' : 'Selesaikan Profil & Masuk ke Dashboard'}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </form>

        <p className="mt-12 text-center text-[12px] text-muted">
          © 2026 Festa Festum. Secure Escrow Protected.
        </p>
      </div>
    </div>
  )
}
