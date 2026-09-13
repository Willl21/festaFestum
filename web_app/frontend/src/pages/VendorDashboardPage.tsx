import { useEffect, useState } from 'react'
import PanelSkeleton from '../components/PanelSkeleton'
import TukarHalus from '../components/TukarHalus'
import { Link } from 'react-router-dom'
import { VendorPageHeader, StatusPill } from '../components/VendorLayout'
import { ArrowRight, CalendarIcon, ClockIcon, TrendUpIcon, WalletIcon } from '../components/icons'
import { rupiahBulat } from '../lib/format'
import {
  getVendorStats, listVendorBookings,
  type ApiBooking, type VendorStats,
} from '../lib/api'

/** payment_status DB -> label yang dipakai mockup. */
const LABEL_STATUS: Record<string, { teks: string; tone: 'warn' | 'info' | 'muted' }> = {
  pending: { teks: 'Menunggu DP', tone: 'warn' },
  dp_paid: { teks: 'Dikonfirmasi', tone: 'info' },
  fully_paid: { teks: 'Lunas', tone: 'info' },
  cancelled: { teks: 'Dibatalkan', tone: 'muted' },
  expired: { teks: 'Kedaluwarsa', tone: 'muted' },
}

const inisial = (nama: string) =>
  nama.split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()


export default function VendorDashboardPage() {
  const [stats, setStats] = useState<VendorStats | null>(null)
  const [pesanan, setPesanan] = useState<ApiBooking[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    Promise.all([getVendorStats(), listVendorBookings()])
      .then(([a, b]) => {
        setStats(a.stats)
        setPesanan(b.data)
      })
      .catch((e) => setGalat(e.message))
      .finally(() => setMemuat(false))
  }, [])

  return (
    <TukarHalus memuat={memuat} rangka={<PanelSkeleton kartu={4} blok={2} label="Memuat dashboard…" />}>
      {() => {
        if (galat || !stats) {
          return (
            <p className="mt-8 border border-maroon/30 bg-maroon/5 px-5 py-4 text-[14px] text-maroon">
              {galat || 'Data tidak tersedia.'}
            </p>
          )
        }

        const bulanIni = Number(stats.revenue_bulan_ini)
        const bulanLalu = Number(stats.revenue_bulan_lalu)
        // Pertumbuhan tidak dihitung kalau bulan lalu nol — pembagian nol
        // menghasilkan Infinity, dan "+Infinity% dari bulan lalu" bukan informasi.
        const tumbuh = bulanLalu > 0
          ? `${bulanIni >= bulanLalu ? '+' : ''}${Math.round(((bulanIni - bulanLalu) / bulanLalu) * 100)}% dari bulan lalu`
          : 'Belum ada pembanding bulan lalu'

        const terbaru = pesanan.slice(0, 5)

        return (
          <>
            <VendorPageHeader
              title="Selamat datang kembali, Vendor"
              description="Berikut adalah ringkasan performa Anda hari ini."
            />

            <div className="mt-8 grid gap-5 md:grid-cols-3">
              <StatCard label="Pendapatan Bulanan" icon={<WalletIcon />}>
                <p className="text-[26px] font-semibold">{rupiahBulat(bulanIni)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[13px] text-amber">
                  <TrendUpIcon className="h-3.5 w-3.5" />
                  {tumbuh}
                </p>
              </StatCard>

              <StatCard label="Total Pemesanan" icon={<CalendarIcon className="h-5 w-5" />}>
                <p className="font-display text-[30px] font-semibold">{stats.total_pesanan}</p>
                <p className="mt-1 text-[13px] text-ink/70">{stats.selesai_minggu_ini} acara minggu ini · {stats.slot_tersedia} slot bebas</p>
              </StatCard>

              {/* Kartu permintaan tertunda sengaja gelap: ini satu-satunya kartu
                  yang menuntut tindakan, bukan sekadar angka. */}
              <section className="rounded-lg bg-navy-900 p-6 text-white">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[14px] text-white/85">Permintaan Tertunda</p>
                  <span className="rounded-md bg-amber/20 p-2 text-amber">
                    <ClockIcon className="h-5 w-5" />
                  </span>
                </div>
                <p className="mt-4 font-display text-[30px] font-semibold">{stats.menunggu_dp}</p>
                <Link
                  to="/vendor/pemesanan"
                  className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-amber text-[13px] font-semibold text-navy-900"
                >
                  Tinjau Sekarang <ArrowRight className="h-4 w-4" />
                </Link>
              </section>
            </div>

            <section className="mt-8 rounded-lg border border-line bg-white">
              <div className="flex items-center justify-between gap-4 p-6">
                <h2 className="font-display text-[24px] font-semibold">Pesanan Terbaru</h2>
                <Link to="/vendor/pemesanan" className="text-[13px] font-medium text-amber">
                  Lihat Semua ›
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-[14px]">
                  <thead className="bg-lavender/30 text-[13px] text-ink/70">
                    <tr>
                      <th className="px-6 py-3 font-medium">Pelanggan</th>
                      <th className="px-6 py-3 font-medium">Tanggal</th>
                      <th className="px-6 py-3 font-medium">Layanan</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {terbaru.map((o) => {
                      const st = LABEL_STATUS[o.payment_status] ?? { teks: o.payment_status, tone: 'muted' as const }
                      return (
                        <tr key={o.booking_id} className="border-t border-line">
                          <td className="px-6 py-4">
                            <span className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lavender text-[12px] font-semibold text-navy-900">
                                {inisial(o.customer_name)}
                              </span>
                              {o.customer_name}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {new Date(o.event_date).toLocaleDateString('id-ID', {
                              day: 'numeric', month: 'short', year: 'numeric',
                            })}
                          </td>
                          <td className="px-6 py-4">{o.service_name}</td>
                          <td className="px-6 py-4">
                            <StatusPill tone={st.tone}>● {st.teks}</StatusPill>
                          </td>
                        </tr>
                      )
                    })}
                    {terbaru.length === 0 && (
                      <tr className="border-t border-line">
                        <td colSpan={4} className="px-6 py-10 text-center text-muted">
                          Belum ada pesanan masuk.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )
      }}
    </TukarHalus>
  )
}

function StatCard({
  label,
  icon,
  children,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14px] text-ink/75">{label}</p>
        <span className="rounded-md bg-lavender/50 p-2 text-navy-900">{icon}</span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}
