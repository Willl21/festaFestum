import Bintang from './Bintang'
import { useEffect, useState } from 'react'
import { listUlasanVendor, type ApiUlasan, type RingkasanUlasan } from '../lib/api'
import { ChevronDown, StarIcon } from './icons'

/* Tiga kartu per halaman, ganti halaman pakai blur-out lalu blur-in per kartu
   berurutan (meniru rekaman referensi 25 Sep). KELUAR = 150ms + jeda
   terakhir, jadi halaman baru dipasang sesudah kartu ketiga hilang. */
const PER_HALAMAN = 3
const JEDA = 70
const KELUAR = 150 + JEDA * (PER_HALAMAN - 1)

/** Satu komponen dipakai lima halaman detail vendor.
 *
 *  Aturan "satu halaman satu file" berlaku untuk HALAMAN, bukan untuk potongan
 *  UI seperti ini — menyalin blok yang sama lima kali berarti lima tempat yang
 *  harus diperbaiki waktu bentuk ulasannya berubah, dan tidak ada satu pun
 *  yang lebih mudah dibaca karenanya.
 */
export default function UlasanVendor({ vendorId }: { vendorId: string }) {
  const [ulasan, setUlasan] = useState<ApiUlasan[]>([])
  const [ringkasan, setRingkasan] = useState<RingkasanUlasan | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [halaman, setHalaman] = useState(0)
  const [keluar, setKeluar] = useState(false)

  useEffect(() => {
    if (!vendorId) return
    listUlasanVendor(vendorId)
      .then((r) => {
        setUlasan(r.data)
        setRingkasan(r.ringkasan)
      })
      // Ulasan bukan isi utama halaman: kalau gagal diambil, bagiannya cukup
      // kosong. Menampilkan error merah di sini malah bikin halaman vendor
      // yang sehat terlihat rusak.
      .catch(() => {})
      .finally(() => setMemuat(false))
  }, [vendorId])

  if (memuat) return null

  const jumlah = ringkasan?.jumlah ?? 0
  const totalHalaman = Math.ceil(ulasan.length / PER_HALAMAN)
  const tampil = ulasan.slice(halaman * PER_HALAMAN, (halaman + 1) * PER_HALAMAN)

  // Klik saat transisi berjalan diabaikan; kalau tidak, halaman bisa loncat
  // dua kali dan animasi keluarnya terpotong.
  const geser = (arah: 1 | -1) => {
    if (keluar) return
    setKeluar(true)
    setTimeout(() => {
      setHalaman((h) => (h + arah + totalHalaman) % totalHalaman)
      setKeluar(false)
    }, KELUAR)
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-[26px] font-semibold text-navy-900">Ulasan Klien</h2>
        {totalHalaman > 1 && (
          <div className="flex gap-2">
            {([[-1, 'Ulasan sebelumnya', 'rotate-90'], [1, 'Ulasan berikutnya', '-rotate-90']] as const).map(
              ([arah, label, putar]) => (
                <button
                  key={arah}
                  type="button"
                  onClick={() => geser(arah)}
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-navy-900 transition-colors hover:bg-lavender/60"
                >
                  <ChevronDown className={`h-4 w-4 ${putar}`} />
                </button>
              ),
            )}
          </div>
        )}
      </div>

      {jumlah === 0 ? (
        <p className="mt-3 text-[15px] text-muted">
          Vendor ini belum punya ulasan. Ulasan hanya bisa ditulis klien yang pesanannya
          sudah lunas dan acaranya sudah berlangsung.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-6">
            <div>
              <p className="font-display text-[40px] leading-none font-semibold">
                {Number(ringkasan?.rata_rata ?? 0).toFixed(1)}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                dari {jumlah} ulasan
              </p>
            </div>

            <dl className="min-w-[200px] flex-1 space-y-1">
              {([5, 4, 3, 2, 1] as const).map((n) => {
                const nilai = ringkasan?.[`b${n}` as const] ?? 0
                return (
                  <div key={n} className="flex items-center gap-2">
                    <dt className="flex w-8 items-center gap-1 text-[12px] text-muted">
                      {n} <StarIcon className="h-3 w-3 text-star" />
                    </dt>
                    <dd className="flex-1">
                      <span className="block h-1.5 rounded-full bg-lavender/60">
                        <span
                          className="block h-full rounded-full bg-amber"
                          style={{ width: `${jumlah ? (nilai / jumlah) * 100 : 0}%` }}
                        />
                      </span>
                    </dd>
                    <span className="w-6 text-right text-[12px] text-muted">{nilai}</span>
                  </div>
                )
              })}
            </dl>
          </div>

          <ul className="mt-7 grid gap-4 md:grid-cols-3">
            {tampil.map((u, i) => (
              <li
                // Kunci ikut halaman: kartu dipasang ulang, jadi animasi masuknya jalan lagi.
                key={`${halaman}-${u.review_id}`}
                className={`flex min-h-[190px] flex-col justify-between rounded-sm border border-line bg-white p-5 ${
                  keluar ? 'ulasan-keluar' : 'ulasan-masuk'
                }`}
                style={{ animationDelay: `${i * JEDA}ms` }}
              >
                <p className={`text-[15px] leading-relaxed ${u.comment ? 'text-ink/80' : 'text-muted italic'}`}>
                  {u.comment || 'Tanpa komentar.'}
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lavender text-[14px] font-semibold text-navy-900">
                    {u.user_name.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{u.user_name}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                      <Bintang nilai={u.rating} className="h-3 w-3" />
                      {new Date(u.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
