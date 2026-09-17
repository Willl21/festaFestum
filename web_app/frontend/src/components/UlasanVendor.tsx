import { useEffect, useState } from 'react'
import { listUlasanVendor, type ApiUlasan, type RingkasanUlasan } from '../lib/api'

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

  return (
    <section>
      <h2 className="font-display text-[26px] font-semibold text-navy-900">Ulasan Klien</h2>

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
                    <dt className="w-8 text-[12px] text-muted">{n} ★</dt>
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

          <ul className="mt-7 space-y-4">
            {ulasan.map((u) => (
              <li key={u.review_id} className="rounded-sm border border-line bg-white p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{u.user_name}</p>
                  <p className="text-[12px] text-muted">
                    {new Date(u.created_at).toLocaleDateString('id-ID', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </p>
                </div>
                <p className="mt-1 text-[14px] text-amber">
                  {'★'.repeat(u.rating)}
                  <span className="text-line">{'★'.repeat(5 - u.rating)}</span>
                </p>
                {u.comment && (
                  <p className="mt-2 text-[14px] leading-relaxed text-ink/80">{u.comment}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
