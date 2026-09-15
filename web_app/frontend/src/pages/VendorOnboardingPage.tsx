import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { inputClass } from '../components/AuthLayout'
import { ArrowRight, FolderIcon, PhotoIcon, UploadCloudIcon } from '../components/icons'
import { categories } from '../data/categories'
import {
  getMyVendor, kirim, simpanFotoVendor, tambahLayanan, urlFotoVendor,
  type ApiVendor,
} from '../lib/api'
import { PORTOFOLIO, kecilkanGambar } from '../lib/gambar'

/** Langkah 3 onboarding vendor: lengkapi profil bisnis.
 *
 *  Dua hal yang sengaja beda dari mockup:
 *  - Mockup mengunci lokasi ke "Jabodetabek", padahal kolom `city` di DB
 *    adalah enum per wilayah dan dipakai untuk filter pencarian. Vendor
 *    tanpa kota tidak akan muncul di discovery, jadi di sini jadi pilihan.
 *  - Foto portofolio masuk ke tabel portfolio_images yang sudah ada sejak
 *    skema awal, satu baris per slot (sort_order 0 = hero). Dikecilkan dulu
 *    di browser ke 900x600 supaya muat.
 *
 *    Yang ditampilkan di sini BUKAN data URL-nya, melainkan
 *    GET /vendors/:id/photo/:slot. Menahan tiga data URL di state membuat
 *    halaman ini membawa ratusan KB gambar yang baru saja dikirim sendiri.
 *    ponytail: data URL di kolom TEXT. Upgrade-nya Supabase Storage. */

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
  // Slot mana yang sudah terisi — penanda saja, gambarnya diambil lewat URL.
  const [terisi, setTerisi] = useState<boolean[]>([false, false, false])
  const [unggah, setUnggah] = useState<number | null>(null)
  // Dinaikkan tiap kali foto berubah supaya <img> mengambil ulang: alamatnya
  // tetap sama, jadi tanpa ini browser menyajikan foto lama dari cache.
  const [versi, setVersi] = useState(0)
  const [loading, setLoading] = useState(false)

  // Kalau halaman ini dibuka ulang (refresh / masuk lagi), id vendornya
  // diambil dari backend, bukan dari state navigasi yang sudah hilang.
  useEffect(() => {
    if (vendorId) return
    getMyVendor()
      .then(({ vendor }) => {
        setVendorId(vendor.vendor_id)
        // Slot yang sudah terisi ikut dibaca, supaya vendor yang kembali ke
        // halaman ini melihat portofolionya, bukan tiga kotak kosong.
        if (vendor.photos) setTerisi(vendor.photos)
      })
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

  async function pilihFoto(slot: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // supaya memilih berkas yang sama lagi tetap memicu onChange
    if (!file) return

    setError('')
    setUnggah(slot)
    try {
      const kecil = await kecilkanGambar(file, ...PORTOFOLIO)
      const { photos } = await simpanFotoVendor(slot, kecil)
      setTerisi(photos)
      setVersi((v) => v + 1)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUnggah(null)
    }
  }

  async function hapusFoto(slot: number) {
    setError('')
    setUnggah(slot)
    try {
      const { photos } = await simpanFotoVendor(slot, '')
      setTerisi(photos)
      setVersi((v) => v + 1)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUnggah(null)
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

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <KotakFoto
              slot={0}
              judul="Foto Utama (Hero Image)"
              tinggi="min-h-[240px]"
              Ikon={UploadCloudIcon}
              src={terisi[0] && vendorId ? urlFotoVendor(vendorId, 0, versi) : ''}
              sibuk={unggah === 0}
              onPilih={pilihFoto}
              onHapus={hapusFoto}
            />
            <div className="grid gap-4">
              {[1, 2].map((slot) => (
                <KotakFoto
                  key={slot}
                  slot={slot}
                  judul={`Foto ${slot + 1}`}
                  tinggi="min-h-[112px]"
                  Ikon={PhotoIcon}
                  src={terisi[slot] && vendorId ? urlFotoVendor(vendorId, slot, versi) : ''}
                  sibuk={unggah === slot}
                  onPilih={pilihFoto}
                  onHapus={hapusFoto}
                />
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

/** Satu kotak unggah. Kosong: area putus-putus yang bisa diklik. Terisi:
 *  pratinjau fotonya sendiri dengan tombol ganti & hapus. */
function KotakFoto({
  slot,
  judul,
  tinggi,
  Ikon,
  src,
  sibuk,
  onPilih,
  onHapus,
}: {
  slot: number
  judul: string
  tinggi: string
  Ikon: ({ className }: { className?: string }) => React.ReactElement
  src: string
  sibuk: boolean
  onPilih: (slot: number, e: React.ChangeEvent<HTMLInputElement>) => void
  onHapus: (slot: number) => void
}) {
  const id = `foto-${slot}`

  if (src) {
    return (
      <div className={`group relative overflow-hidden rounded-lg border border-line ${tinggi}`}>
        <img src={src} alt={judul} className="h-full w-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 py-2.5">
          <span className="truncate text-[12px] font-medium text-white">{judul}</span>
          <span className="flex shrink-0 gap-2">
            <label
              htmlFor={id}
              className="cursor-pointer rounded bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-navy-900"
            >
              Ganti
            </label>
            {/* type="button": tombol telanjang di dalam <form> otomatis jadi
                submit, dan menghapus foto akan ikut mengirim seluruh profil. */}
            <button
              type="button"
              onClick={() => onHapus(slot)}
              disabled={sibuk}
              className="rounded bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-maroon disabled:opacity-60"
            >
              Hapus
            </button>
          </span>
        </div>
        <input
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => onPilih(slot, e)}
          className="hidden"
        />
      </div>
    )
  }

  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line bg-white/60 text-center transition-colors hover:border-navy-900 hover:bg-white ${tinggi}`}
    >
      <Ikon className="h-7 w-7 text-ink/40" />
      <p className="mt-3 text-[13px] font-semibold text-navy-900">{judul}</p>
      <p className="mt-1 text-[12px] text-muted">
        {sibuk ? 'Mengunggah…' : 'Klik untuk pilih gambar'}
      </p>
      <input
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => onPilih(slot, e)}
        className="hidden"
      />
    </label>
  )
}
