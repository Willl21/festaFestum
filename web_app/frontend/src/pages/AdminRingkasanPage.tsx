import { useEffect, useState } from 'react'
import PanelSkeleton from '../components/PanelSkeleton'
import TukarHalus from '../components/TukarHalus'
import { Link } from 'react-router-dom'
import { ArrowRight, ShieldIcon, WalletIcon, LockIcon, GridIcon } from '../components/icons'
import { categories, namaKota } from '../data/categories'
import { rupiahBulat } from '../lib/format'
import { get } from '../lib/api'

/** Ringkasan Eksekutif — angka utama marketplace.
 *
 *  Semua angka di sini DIHITUNG dari tabel yang ada (bookings, payments,
 *  payouts, vendors). Panel "orkestrasi AI", latensi model, dan skor
 *  rekomendasi di mockup tidak dibuat: modelnya dipegang tim AI dan belum
 *  ada endpoint-nya, jadi angkanya cuma bisa dikarang. */

type Stats = {
  menunggu: string
  terverifikasi: string
  dokumen_menunggu: string
  gmv: string
}

type Escrow = {
  tertahan: number
  dirilis_kotor: number
  biaya_platform: number
  platform_fee_rate: number
  pesanan_tertahan: number
  antrean_pencairan: number
  jumlah_antrean: number
  sudah_dicairkan: number
}

type Booking = {
  booking_id: string
  business_name: string
  service_name: string
  category: string
  city: string | null
  customer_name: string
  event_date: string
  total_price: string
  payment_status: string
}

const statusLabel: Record<string, string> = {
  pending: 'Menunggu DP',
  dp_paid: 'DP Terbayar',
  fully_paid: 'Lunas',
  cancelled: 'Dibatalkan',
  expired: 'Kedaluwarsa',
}

/** Nada per status (review 25 Sep). Dulu keempatnya pil lavender yang sama,
 *  jadi pesanan bermasalah tidak kelihatan tanpa membaca satu per satu.
 *  Teksnya tetap ada — warna bukan satu-satunya pembeda. Semua >= 4,5:1. */
const statusNada: Record<string, string> = {
  pending: 'bg-lavender/60 text-navy-900',
  dp_paid: 'bg-amber/20 text-navy-900',
  fully_paid: 'bg-[#2e6b52]/10 text-[#2e6b52]',
  cancelled: 'bg-ink/5 text-ink/70',
  expired: 'bg-ink/5 text-ink/70',
}

const labelKategori = (c: string) =>
  Object.values(categories).find((x) => x.apiCategory === c)?.label ?? c

export default function AdminRingkasanPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [escrow, setEscrow] = useState<Escrow | null>(null)
  const [acara, setAcara] = useState<Booking[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    Promise.all([
      get<{ stats: Stats }>('/admin/stats'),
      get<{ escrow: Escrow }>('/admin/escrow'),
      get<{ data: Booking[] }>('/admin/bookings?limit=8'),
    ])
      .then(([a, b, c]) => {
        setStats(a.stats)
        setEscrow(b.escrow)
        setAcara(c.data)
      })
      .catch((e) => setGalat((e as Error).message))
      .finally(() => setMemuat(false))
  }, [])

  // Sebaran wilayah dihitung di klien dari acara yang tampil — jumlah datanya
  // kecil, tidak perlu endpoint agregasi sendiri.
  const perWilayah = Object.entries(
    acara.reduce<Record<string, { jumlah: number; nilai: number }>>((acc, b) => {
      const k = namaKota(b.city)
      acc[k] = { jumlah: (acc[k]?.jumlah ?? 0) + 1, nilai: (acc[k]?.nilai ?? 0) + Number(b.total_price) }
      return acc
    }, {})
  ).sort((a, b) => b[1].nilai - a[1].nilai)

  const puncak = perWilayah[0]?.[1].nilai ?? 1

  return (
    <TukarHalus memuat={memuat} rangka={<PanelSkeleton kartu={4} blok={2} label="Memuat ringkasan…" />}>
      {() => {
        if (galat) {
          return (
            <p role="alert" className="border border-maroon/30 bg-maroon/5 px-5 py-4 text-[14px] text-maroon">
              {galat}
            </p>
          )
        }

        return (
          <>
            <h1 className="font-display text-[32px] font-semibold text-navy-900">Ringkasan Eksekutif</h1>
            <p className="mt-2 text-[14px] text-muted">
              Angka marketplace Jabodetabek, dihitung langsung dari transaksi yang tercatat.
            </p>

            <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kartu
                ikon={<GridIcon className="h-5 w-5 text-amber" />}
                label="GMV Ditransaksikan"
                nilai={stats ? rupiahBulat(Number(stats.gmv)) : '—'}
                catatan="Dari pesanan yang DP-nya sudah masuk"
              />
              <Kartu
                ikon={<WalletIcon className="h-5 w-5 text-amber" />}
                label="Pendapatan Platform"
                nilai={escrow ? rupiahBulat(escrow.biaya_platform) : '—'}
                catatan={escrow ? `${escrow.platform_fee_rate * 100}% dari dana yang dirilis` : ''}
              />
              <Kartu
                ikon={<LockIcon className="h-5 w-5 text-amber" />}
                label="Tertahan di Escrow"
                nilai={escrow ? rupiahBulat(escrow.tertahan) : '—'}
                catatan={escrow ? `${escrow.pesanan_tertahan} acara belum berjalan` : ''}
              />
              <Kartu
                ikon={<ShieldIcon className="h-5 w-5 text-amber" />}
                label="Vendor Terverifikasi"
                nilai={stats?.terverifikasi ?? '—'}
                catatan={stats ? `${stats.menunggu} menunggu kurasi` : ''}
              />
            </div>

            <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_360px]">
              <section className="min-w-0 rounded-lg border border-line bg-white p-6">
                <p className="text-[11px] tracking-wide text-muted uppercase">Saturasi Geografis</p>
                <h2 className="mt-1 font-display text-[22px] font-semibold text-navy-900">
                  Sebaran Pemesanan Jabodetabek
                </h2>

                {perWilayah.length === 0 ? (
                  <p className="mt-5 text-[14px] text-muted">Belum ada pemesanan tercatat.</p>
                ) : (
                  <div className="mt-5 space-y-4">
                    {perWilayah.map(([kota, v]) => (
                      <div key={kota}>
                        <div className="flex justify-between text-[13px]">
                          <span className="font-medium text-navy-900">{kota}</span>
                          <span className="text-ink/75">
                            {v.jumlah} acara · {rupiahBulat(v.nilai)}
                          </span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-lavender/60">
                          <div
                            className="h-full rounded-full bg-navy-900"
                            style={{ width: `${Math.max(6, (v.nilai / puncak) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="mt-6 border-t border-line pt-4 text-[12px] text-muted">
                  Dihitung dari {acara.length} pemesanan terbaru yang tampil di bawah.
                </p>
              </section>

              <section className="h-fit rounded-lg border border-line bg-white p-6">
                <p className="text-[11px] tracking-wide text-muted uppercase">Perlu Tindakan</p>
                <h2 className="mt-1 font-display text-[22px] font-semibold text-navy-900">Antrean Admin</h2>

                <div className="mt-5 space-y-3">
                  <Antrean
                    label="Vendor menunggu kurasi"
                    nilai={stats?.menunggu ?? '0'}
                    to="/admin/vendor"
                  />
                  <Antrean
                    label="Dokumen belum dikurasi"
                    nilai={stats?.dokumen_menunggu ?? '0'}
                    to="/admin/vendor"
                  />
                  <Antrean
                    label="Pengajuan pencairan"
                    nilai={String(escrow?.jumlah_antrean ?? 0)}
                    to="/admin/escrow"
                  />
                </div>

                <p className="mt-5 rounded border border-lavender bg-lavender/40 p-4 text-[12px] leading-relaxed text-ink/80">
                  Total {escrow ? rupiahBulat(escrow.antrean_pencairan) : 'Rp 0'} menunggu persetujuan
                  pencairan.
                </p>
              </section>
            </div>

            <section className="mt-7 rounded-lg border border-line bg-white">
              <div className="flex items-center justify-between border-b border-line px-6 py-4">
                <h2 className="font-display text-[22px] font-semibold text-navy-900">Aliran Acara Terbaru</h2>
              </div>

              {acara.length === 0 ? (
                <p className="p-8 text-[14px] text-muted">Belum ada pemesanan.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-[13px]">
                    <thead className="bg-cream text-[11px] tracking-wide text-ink/70 uppercase">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Klien &amp; Acara</th>
                        <th className="px-5 py-3 font-semibold">Vendor</th>
                        <th className="px-5 py-3 font-semibold">Tanggal</th>
                        <th className="px-5 py-3 font-semibold">Status</th>
                        <th className="px-5 py-3 text-right font-semibold">Nilai</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acara.map((b) => (
                        <tr key={b.booking_id} className="border-t border-line">
                          <td className="px-5 py-4">
                            <p className="font-semibold text-navy-900">{b.customer_name}</p>
                            <p className="mt-1 text-[12px] text-muted">
                              {b.service_name} · {labelKategori(b.category)}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            <p>{b.business_name}</p>
                            <p className="mt-1 text-[12px] text-muted">{namaKota(b.city)}</p>
                          </td>
                          <td className="px-5 py-4">
                            {new Date(b.event_date).toLocaleDateString('id-ID', {
                              day: '2-digit', month: 'short', year: 'numeric',
                            })}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`rounded-full px-3 py-1 text-[12px] font-medium ${statusNada[b.payment_status] ?? statusNada.pending}`}>
                              {statusLabel[b.payment_status] ?? b.payment_status}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right font-semibold text-navy-900">
                            {rupiahBulat(Number(b.total_price))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )
      }}
    </TukarHalus>
  )
}

function Kartu({
  ikon,
  label,
  nilai,
  catatan,
}: {
  ikon: React.ReactNode
  label: string
  nilai: string
  catatan: string
}) {
  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <p className="flex items-center gap-2 text-[11px] tracking-wide text-muted uppercase">
        {ikon} {label}
      </p>
      <p className="mt-3 text-[24px] leading-none font-semibold tracking-tight tabular-nums text-navy-900">{nilai}</p>
      <p className="mt-2 text-[12px] text-muted">{catatan}</p>
    </div>
  )
}

function Antrean({ label, nilai, to }: { label: string; nilai: string; to: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded border border-line px-4 py-3 text-[13px] transition-colors hover:border-navy-900/40"
    >
      <span className="text-ink/80">{label}</span>
      <span className="flex items-center gap-2 font-semibold text-navy-900">
        {nilai}
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  )
}
