import { useEffect, useMemo, useState } from 'react'
import TabelSkeleton from '../components/TabelSkeleton'
import TukarHalus from '../components/TukarHalus'
import { Link } from 'react-router-dom'
import { VendorPageHeader, StatusPill } from '../components/VendorLayout'
import { shifts } from '../data/shifts'
import { rupiahBulat } from '../lib/format'
import { listVendorBookings, type ApiBooking } from '../lib/api'

/** Jenis acara di DB pakai snake_case; ini tampilannya. */
const JENIS: Record<string, string> = {
  wedding: 'Pernikahan',
  engagement: 'Lamaran',
  graduation: 'Wisuda',
  gala_dinner: 'Gala Dinner',
  corporate_seminar: 'Seminar / Korporat',
}

const tabs = ['Semua', 'Mendatang', 'Selesai', 'Dibatalkan'] as const

/** Status sisi vendor sengaja lebih kasar daripada sisi customer: vendor
 *  peduli "acaranya sudah lewat atau belum", bukan tahap pembayarannya —
 *  nominal yang sudah masuk ditampilkan terpisah di kolom total. */
function statusPesanan(b: ApiBooking): Exclude<(typeof tabs)[number], 'Semua'> {
  if (b.payment_status === 'cancelled' || b.payment_status === 'expired') return 'Dibatalkan'
  return new Date(b.event_date) < new Date(new Date().toDateString()) ? 'Selesai' : 'Mendatang'
}

const tone = { Mendatang: 'info', Selesai: 'muted', Dibatalkan: 'warn' } as const

export default function VendorPemesananPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Semua')
  const [bookings, setBookings] = useState<ApiBooking[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    listVendorBookings()
      .then((r) => setBookings(r.data))
      .catch((e) => setGalat(e.message))
      .finally(() => setMemuat(false))
  }, [])

  const rows = useMemo(
    () => (tab === 'Semua' ? bookings : bookings.filter((b) => statusPesanan(b) === tab)),
    [bookings, tab]
  )

  return (
    <TukarHalus memuat={memuat} rangka={<TabelSkeleton kolom={6} baris={6} label="Memuat pemesanan…" />}>
      {() => (
        <>
          <VendorPageHeader
            title="Manajemen Pemesanan"
            description="Kelola daftar pesanan klien Anda dan pantau status acara terkini."
            action={
              <div className="flex rounded-md border border-line bg-white p-1">
                {tabs.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    aria-pressed={tab === t}
                    className={`rounded px-4 py-2 text-[13px] transition-colors ${
                      tab === t ? 'bg-navy-900 font-semibold text-white' : 'text-ink/75 hover:text-ink'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            }
          />

          <section className="mt-8 overflow-hidden rounded-lg border border-line bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-[14px]">
                <thead className="bg-lavender/30 text-[12px] tracking-[0.04em] text-ink/70">
                  <tr>
                    <th className="px-6 py-4 font-semibold">ID PESANAN</th>
                    <th className="px-6 py-4 font-semibold">KLIEN &amp; ACARA</th>
                    <th className="px-6 py-4 font-semibold">TANGGAL &amp; WAKTU</th>
                    <th className="px-6 py-4 text-right font-semibold">TOTAL BIAYA</th>
                    <th className="px-6 py-4 font-semibold">STATUS</th>
                    <th className="px-6 py-4 font-semibold">AKSI</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => {
                    const st = statusPesanan(b)
                    const shift = shifts.find((x) => x.value === b.time_slot)
                    const dibayar = b.payments
                      .filter((p) => p.gateway_status === 'success')
                      .reduce((t, p) => t + Number(p.amount), 0)

                    return (
                      <tr key={b.booking_id} className="border-t border-line align-top">
                        <td className="px-6 py-5 text-ink/80">
                          #{b.booking_id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-6 py-5">
                          <p className="font-display text-[17px] font-semibold">{b.customer_name}</p>
                          <p className="mt-0.5 text-[13px] text-ink/70">
                            {JENIS[b.event_type] ?? b.event_type} - {b.service_name}
                          </p>
                          <p className="mt-0.5 text-[12px] text-muted">{b.customer_phone}</p>
                        </td>
                        <td className="px-6 py-5">
                          <p className="font-semibold">
                            {new Date(b.event_date).toLocaleDateString('id-ID', {
                              day: '2-digit', month: 'short', year: 'numeric',
                            })}
                          </p>
                          <p className="mt-0.5 text-[13px] text-ink/70">
                            {shift ? shift.label + ' (' + shift.hours + ')' : b.time_slot}
                          </p>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <p className="font-semibold">{rupiahBulat(Number(b.total_price))}</p>
                          <p className="mt-0.5 text-[12px] text-muted">
                            masuk {rupiahBulat(dibayar)}
                          </p>
                        </td>
                        <td className="px-6 py-5">
                          <StatusPill tone={tone[st]}>{st}</StatusPill>
                        </td>
                        <td className="px-6 py-5">
                          <details className="[&_summary::-webkit-details-marker]:hidden">
                            <summary className="cursor-pointer list-none rounded-md border border-line px-4 py-2 text-[13px] font-medium hover:border-ink">
                              Detail
                            </summary>
                            <p className="mt-2 max-w-[280px] whitespace-pre-line text-[12px] leading-relaxed text-ink/75">
                              {b.event_location_detail}
                            </p>
                            {/* Endpoint booking boleh dibuka vendor yang dipesan,
                                jadi invoice yang sama dipakai kedua sisi. */}
                            <Link
                              to={`/invoice/${b.booking_id}`}
                              className="mt-3 inline-block text-[12px] font-semibold text-navy-900 underline underline-offset-4"
                            >
                              Lihat invoice
                            </Link>
                          </details>
                        </td>
                      </tr>
                    )
                  })}

                  {!memuat && rows.length === 0 && (
                    <tr className="border-t border-line">
                      <td colSpan={6} className="px-6 py-10 text-center text-[14px] text-muted">
                        {galat || 'Belum ada pesanan pada filter ini.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="border-t border-line px-6 py-4 text-[13px] text-ink/70">
              Menampilkan {rows.length} dari {bookings.length} pesanan
            </p>
          </section>
        </>
      )}
    </TukarHalus>
  )
}
