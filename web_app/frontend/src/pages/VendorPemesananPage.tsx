import { useEffect, useMemo, useState } from 'react'
import TabelSkeleton from '../components/TabelSkeleton'
import TukarHalus from '../components/TukarHalus'
import { Link, useNavigate } from 'react-router-dom'
import { VendorPageHeader, StatusPill } from '../components/VendorLayout'
import { rupiahBulat } from '../lib/format'
import {
  listVendorBookings, konfirmasiBooking, bukaPercakapan, type ApiBooking,
} from '../lib/api'
import { rentangJam } from '../lib/durasi'

/** Jenis acara di DB pakai snake_case; ini tampilannya. */
const JENIS: Record<string, string> = {
  wedding: 'Pernikahan',
  engagement: 'Lamaran',
  graduation: 'Wisuda',
  gala_dinner: 'Gala Dinner',
  corporate_seminar: 'Seminar / Korporat',
}

const tabs = ['Semua', 'Menunggu', 'Mendatang', 'Selesai', 'Dibatalkan'] as const

/** Status sisi vendor sengaja lebih kasar daripada sisi customer: vendor
 *  peduli "acaranya sudah lewat atau belum", bukan tahap pembayarannya —
 *  nominal yang sudah masuk ditampilkan terpisah di kolom total. */
function statusPesanan(b: ApiBooking): Exclude<(typeof tabs)[number], 'Semua'> {
  if (b.payment_status === 'cancelled' || b.payment_status === 'expired') return 'Dibatalkan'
  // Didahulukan di atas tanggal acara: pesanan yang belum dijawab adalah
  // satu-satunya baris yang menuntut vendor melakukan sesuatu hari ini.
  if (b.confirm_status === 'menunggu') return 'Menunggu'
  return new Date(b.event_date) < new Date(new Date().toDateString()) ? 'Selesai' : 'Mendatang'
}

const tone = { Menunggu: 'warn', Mendatang: 'info', Selesai: 'muted', Dibatalkan: 'muted' } as const

export default function VendorPemesananPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Semua')
  const [bookings, setBookings] = useState<ApiBooking[]>([])
  const [memuat, setMemuat] = useState(true)
  const [galat, setGalat] = useState('')
  // booking_id yang tombolnya sedang diproses, supaya klik ganda tidak
  // mengirim dua jawaban untuk pesanan yang sama.
  const [sibuk, setSibuk] = useState('')
  const navigate = useNavigate()

  // Vendor boleh memulai obrolan duluan; ruangannya sama dengan yang dibuka
  // klien dari /pesanan, karena kuncinya booking_id.
  async function chatKlien(b: ApiBooking) {
    setSibuk(b.booking_id)
    setGalat('')
    try {
      const r = await bukaPercakapan({ booking_id: b.booking_id })
      navigate(`/vendor/pesan?c=${r.conversation.conversation_id}`)
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setSibuk('')
    }
  }

  async function jawab(b: ApiBooking, action: 'terima' | 'tolak') {
    // ponytail: window.prompt untuk alasan menolak. Jelek dilihat tapi nol
    // markup; ganti dengan dialog sendiri kalau tampilannya dipakai demo.
    let alasan = ''
    if (action === 'tolak') {
      const isi = window.prompt('Alasan menolak (boleh dikosongkan):')
      // null = vendor menekan Batal. Penolakan tidak bisa ditarik lagi dan
      // langsung mengirim email ke klien, jadi Batal harus benar-benar batal.
      if (isi === null) return
      alasan = isi
    }
    setSibuk(b.booking_id)
    setGalat('')
    try {
      const r = await konfirmasiBooking(b.booking_id, action, alasan || undefined)
      // Ganti barisnya di tempat, jangan ambil ulang seluruh daftar: tabelnya
      // panjang dan posisi scroll vendor ikut lompat kalau di-render ulang.
      setBookings((lama) =>
        lama.map((x) => (x.booking_id === b.booking_id ? r.booking : x))
      )
    } catch (e) {
      setGalat((e as Error).message)
    } finally {
      setSibuk('')
    }
  }

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
              // Di HP satu baris yang bisa digeser, bukan patah dua baris dengan
              // "Dibatalkan" tersisa sendirian.
              <div className="flex rounded-md border border-line bg-white p-1 max-md:overflow-x-auto md:flex-wrap">
                {tabs.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    aria-pressed={tab === t}
                    className={`shrink-0 rounded px-3 py-2 text-[13px] whitespace-nowrap transition-colors md:px-4 ${
                      tab === t ? 'bg-navy-900 font-semibold text-white' : 'text-ink/75 hover:text-ink'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            }
          />

          {/* Di bawah md tabel yang SAMA tampil sebagai kartu lewat CSS (tr jadi
              grid 2 kolom, judul kolom pindah ke data-label), bukan markup
              kedua. Dulu min-w 760px membuat tanggal, status, dan aksi
              tersembunyi di luar layar tanpa tanda bisa digeser. */}
          {galat && rows.length > 0 && (
            <p role="alert" className="mt-6 border border-maroon/30 bg-maroon/5 px-5 py-3 text-[13px] text-maroon">
              {galat}
            </p>
          )}

          <section className="mt-8 overflow-hidden rounded-lg border border-line bg-white">
            <div className="md:overflow-x-auto">
              <table className="w-full text-left text-[14px] max-md:block md:min-w-[760px]">
                <thead className="max-md:hidden bg-lavender/30 text-[12px] tracking-[0.04em] text-ink/70">
                  <tr>
                    <th className="px-6 py-4 font-semibold">ID PESANAN</th>
                    <th className="px-6 py-4 font-semibold">KLIEN &amp; ACARA</th>
                    <th className="px-6 py-4 font-semibold">TANGGAL &amp; WAKTU</th>
                    <th className="px-6 py-4 text-right font-semibold">TOTAL BIAYA</th>
                    <th className="px-6 py-4 font-semibold">STATUS</th>
                    <th className="px-6 py-4 font-semibold">AKSI</th>
                  </tr>
                </thead>
                <tbody className="max-md:block">
                  {rows.map((b) => {
                    const st = statusPesanan(b)
                    const dibayar = b.payments
                      .filter((p) => p.gateway_status === 'success')
                      .reduce((t, p) => t + Number(p.amount), 0)

                    return (
                      <tr key={b.booking_id} className="border-t border-line align-top max-md:grid max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-3 max-md:px-5 max-md:py-5">
                        <td data-label="ID PESANAN" className="px-6 py-5 text-ink/80 max-md:order-4 max-md:p-0 max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:tracking-[0.04em] max-md:before:text-muted max-md:before:content-[attr(data-label)]">
                          #{b.booking_id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-6 py-5 max-md:order-1 max-md:col-span-2 max-md:p-0">
                          <p className="font-display text-[17px] font-semibold">{b.customer_name}</p>
                          <p className="mt-0.5 text-[13px] text-ink/70">
                            {JENIS[b.event_type] ?? b.event_type} - {b.service_name}
                          </p>
                          <p className="mt-0.5 text-[12px] text-muted">{b.customer_phone}</p>
                        </td>
                        <td data-label="TANGGAL & WAKTU" className="px-6 py-5 max-md:order-2 max-md:p-0 max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:tracking-[0.04em] max-md:before:text-muted max-md:before:content-[attr(data-label)]">
                          <p className="font-semibold whitespace-nowrap">
                            {new Date(b.event_date).toLocaleDateString('id-ID', {
                              day: '2-digit', month: 'short', year: 'numeric',
                            })}
                          </p>
                          <p className="mt-0.5 text-[13px] text-ink/70">
                            {rentangJam(b)}
                          </p>
                        </td>
                        <td data-label="TOTAL BIAYA" className="px-6 py-5 text-right max-md:order-3 max-md:p-0 max-md:text-left max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:tracking-[0.04em] max-md:before:text-muted max-md:before:content-[attr(data-label)]">
                          <p className="font-semibold whitespace-nowrap">{rupiahBulat(Number(b.total_price))}</p>
                          <p className="mt-0.5 text-[12px] whitespace-nowrap text-muted">
                            masuk {rupiahBulat(dibayar)}
                          </p>
                        </td>
                        <td data-label="STATUS" className="px-6 py-5 max-md:order-5 max-md:p-0 max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:tracking-[0.04em] max-md:before:text-muted max-md:before:content-[attr(data-label)]">
                          <StatusPill tone={tone[st]}>
                            {st === 'Dibatalkan' && b.confirm_status === 'ditolak' ? 'Anda tolak' : st}
                          </StatusPill>
                        </td>
                        <td className="px-6 py-5 max-md:order-6 max-md:col-span-2 max-md:p-0">
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

                          <button
                            type="button"
                            disabled={sibuk === b.booking_id}
                            onClick={() => chatKlien(b)}
                            className="mt-3 block text-[12px] font-semibold text-navy-900 underline underline-offset-4 disabled:opacity-60"
                          >
                            Chat klien
                          </button>

                          {/* payment_status ikut dicek: klien yang membatalkan
                              sebelum dijawab meninggalkan confirm_status 'menunggu'. */}
                          {b.confirm_status === 'menunggu' && b.payment_status === 'pending' && (
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                disabled={sibuk === b.booking_id}
                                onClick={() => jawab(b, 'terima')}
                                className="rounded-md bg-navy-900 px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                              >
                                {sibuk === b.booking_id ? 'Memproses…' : 'Terima'}
                              </button>
                              <button
                                type="button"
                                disabled={sibuk === b.booking_id}
                                onClick={() => jawab(b, 'tolak')}
                                className="rounded-md border border-maroon px-3 py-1.5 text-[12px] font-semibold text-maroon transition-colors hover:bg-maroon/5 disabled:opacity-60"
                              >
                                Tolak
                              </button>
                            </div>
                          )}

                          {b.confirm_status === 'ditolak' && b.confirm_note && (
                            <p className="mt-3 max-w-[280px] text-[12px] text-muted">
                              Ditolak: {b.confirm_note}
                            </p>
                          )}
                        </td>
                      </tr>
                    )
                  })}

                  {!memuat && rows.length === 0 && (
                    <tr className="border-t border-line max-md:block">
                      <td colSpan={6} className="max-md:block px-6 py-10 text-center text-[14px] text-muted">
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
