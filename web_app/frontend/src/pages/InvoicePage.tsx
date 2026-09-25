import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { categories, namaKota } from '../data/categories'
import { rupiahBulat } from '../lib/format'
import { getBooking, type ApiBooking } from '../lib/api'
import { rentangJam } from '../lib/durasi'

/** Invoice satu pesanan, siap dicetak.
 *
 *  Dicetak lewat window.print() bawaan browser, BUKAN library PDF: "Simpan
 *  sebagai PDF" sudah ada di dialog cetak tiap browser, jadi menambah jsPDF
 *  berarti ±300KB dan satu dependensi baru untuk hasil yang sama.
 *  ponytail: kalau nanti butuh PDF yang dikirim otomatis lewat email,
 *  barulah render di backend.
 *
 *  Nominalnya TIDAK dihitung ulang di sini — semuanya dibaca apa adanya dari
 *  GET /bookings/:id. Backend adalah satu-satunya sumber kebenaran angka;
 *  invoice yang menghitung sendiri gampang berselisih dengan tagihan asli.
 *
 *  Halamannya bisa dibuka pemesan MAUPUN vendor yang dipesan — aturan itu
 *  sudah ada di endpoint-nya, jadi tidak ada pemeriksaan tambahan di sini. */

const labelStatus: Record<string, { teks: string; kelas: string }> = {
  pending: { teks: 'Menunggu Pembayaran', kelas: 'border-amber/60 bg-amber/10 text-[#8a5a06]' },
  dp_paid: { teks: 'DP Terbayar', kelas: 'border-amber/60 bg-amber/10 text-[#8a5a06]' },
  fully_paid: { teks: 'Lunas', kelas: 'border-[#2e6b52]/40 bg-[#2e6b52]/10 text-[#2e6b52]' },
  cancelled: { teks: 'Dibatalkan', kelas: 'border-maroon/40 bg-maroon/5 text-maroon' },
  expired: { teks: 'Kedaluwarsa', kelas: 'border-maroon/40 bg-maroon/5 text-maroon' },
}

const labelAcara: Record<string, string> = {
  wedding: 'Pernikahan',
  engagement: 'Lamaran',
  graduation: 'Wisuda',
  gala_dinner: 'Gala Dinner',
  corporate_seminar: 'Seminar Korporat',
}

const tanggalPanjang = (s: string) =>
  new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

export default function InvoicePage() {
  const { bookingId } = useParams()
  const [booking, setBooking] = useState<ApiBooking | null>(null)
  const [galat, setGalat] = useState('')

  useEffect(() => {
    if (!bookingId) return
    getBooking(bookingId)
      .then((r) => setBooking(r.booking))
      .catch((e) => setGalat((e as Error).message))
  }, [bookingId])

  if (galat) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-20 text-center">
        <h1 className="font-display text-[26px] font-semibold text-navy-900">Invoice tidak bisa dibuka</h1>
        <p className="mt-3 text-[15px] text-ink/75">{galat}</p>
        <Link
          to="/pesanan"
          className="mt-7 inline-flex h-11 items-center rounded bg-navy-900 px-7 text-[15px] font-medium text-white"
        >
          Ke Pesanan Saya
        </Link>
      </div>
    )
  }

  if (!booking) return <p className="py-20 text-center text-[14px] text-muted">Memuat invoice…</p>

  const dibayar = booking.payments
    .filter((p) => p.gateway_status === 'success')
    .reduce((n, p) => n + Number(p.amount), 0)
  const sisa = Number(booking.total_price) - dibayar
  const status = labelStatus[booking.payment_status] ?? {
    teks: booking.payment_status,
    kelas: 'border-line bg-cream text-ink',
  }
  const kategori = Object.values(categories).find((c) => c.apiCategory === booking.category)

  return (
    <div className="min-h-screen bg-cream px-4 py-10 print:bg-white print:p-0">
      {/* Tombol tidak ikut tercetak. */}
      <div className="mx-auto mb-5 flex max-w-[820px] flex-wrap justify-between gap-3 print:hidden">
        <Link to="/pesanan" className="text-[14px] text-navy-900 hover:underline">
          ← Kembali ke Pesanan Saya
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="h-11 rounded bg-navy-900 px-6 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Cetak / Simpan PDF
        </button>
      </div>

      <div className="mx-auto max-w-[820px] bg-white p-8 shadow-sm sm:p-11 print:max-w-none print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-7">
          <div>
            <p className="font-display text-[26px] font-semibold text-navy-900">Festa Festum</p>
            <p className="mt-1 text-[12px] text-muted">
              Marketplace vendor acara formal · Jabodetabek
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-[24px] font-semibold text-navy-900">INVOICE</p>
            <p className="mt-1 text-[13px] text-muted">
              No. FF-{booking.booking_id.slice(0, 8).toUpperCase()}
            </p>
            <p className="text-[13px] text-muted">Terbit {tanggalPanjang(booking.created_at)}</p>
            <span
              className={`mt-2 inline-block rounded-full border px-3 py-1 text-[12px] font-semibold ${status.kelas}`}
            >
              {status.teks}
            </span>
          </div>
        </div>

        <div className="mt-7 grid gap-7 sm:grid-cols-2">
          <div>
            <p className="text-[11px] tracking-wide text-muted uppercase">Ditagihkan kepada</p>
            <p className="mt-2 text-[15px] font-semibold text-navy-900">{booking.customer_name}</p>
            <p className="mt-1 text-[13px] text-ink/75">{booking.customer_phone}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] tracking-wide text-muted uppercase">Vendor pelaksana</p>
            <p className="mt-2 text-[15px] font-semibold text-navy-900">{booking.business_name}</p>
            <p className="mt-1 text-[13px] text-ink/75">{namaKota(booking.city)}</p>
          </div>
        </div>

        <div className="mt-7 rounded border border-line bg-cream p-5">
          <p className="text-[11px] tracking-wide text-muted uppercase">Detail acara</p>
          <div className="mt-3 grid gap-3 text-[13px] sm:grid-cols-3">
            <Baris label="Jenis acara" nilai={labelAcara[booking.event_type] ?? booking.event_type} />
            <Baris
              label="Tanggal & jam"
              nilai={`${tanggalPanjang(booking.event_date)} · ${rentangJam(booking)}`}
            />
            <Baris label="Lokasi" nilai={booking.event_location_detail} />
          </div>
        </div>

        <table className="mt-7 w-full text-left text-[14px]">
          <thead className="border-b border-line text-[11px] tracking-wide text-muted uppercase">
            <tr>
              <th className="pb-3 font-semibold">Layanan</th>
              <th className="pb-3 text-right font-semibold">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="py-4">
                <p className="font-semibold text-navy-900">
                  {kategori?.emoji} {booking.service_name}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  {kategori?.label ?? booking.category} · {booking.business_name}
                </p>
              </td>
              <td className="py-4 text-right font-medium">{rupiahBulat(Number(booking.total_price))}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-6 ml-auto w-full max-w-[320px] space-y-2 text-[14px]">
          <Total label="Total tagihan" nilai={rupiahBulat(Number(booking.total_price))} />
          <Total
            label={`Uang muka (${Math.round((Number(booking.dp_amount) / Number(booking.total_price)) * 100)}%)`}
            nilai={rupiahBulat(Number(booking.dp_amount))}
          />
          <Total label="Sudah dibayar" nilai={rupiahBulat(dibayar)} />
          <div className="flex justify-between border-t border-line pt-3 text-[16px] font-semibold text-navy-900">
            <span>Sisa tagihan</span>
            <span>{rupiahBulat(Math.max(0, sisa))}</span>
          </div>
        </div>

        {booking.payments.length > 0 && (
          <div className="mt-8">
            <p className="text-[11px] tracking-wide text-muted uppercase">Riwayat pembayaran</p>
            <table className="mt-3 w-full text-left text-[13px]">
              <tbody>
                {booking.payments.map((p) => (
                  <tr key={p.payment_id} className="border-b border-line">
                    <td className="py-3">
                      <p className="font-medium text-navy-900">
                        {p.payment_type === 'down_payment' ? 'Uang muka' : 'Pelunasan'} ·{' '}
                        {p.method.toUpperCase().replace(/_/g, ' ')}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted">
                        #{p.payment_id.slice(0, 8).toUpperCase()}
                        {p.paid_at && ` · dibayar ${tanggalPanjang(p.paid_at)}`}
                      </p>
                    </td>
                    <td className="py-3 text-right">
                      <p className="font-medium">{rupiahBulat(Number(p.amount))}</p>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {p.gateway_status === 'success' ? 'Berhasil' : p.gateway_status}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-9 border-t border-line pt-5 text-[12px] leading-relaxed text-muted">
          Dokumen ini diterbitkan otomatis oleh sistem Festa Festum dan sah tanpa tanda tangan. Dana
          pemesanan ditahan sampai acara selesai; pertanyaan soal tagihan bisa diajukan lewat halaman
          Pesanan Saya.
        </p>
      </div>
    </div>
  )
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div>
      <p className="text-[12px] text-muted">{label}</p>
      <p className="mt-1 font-medium text-navy-900">{nilai}</p>
    </div>
  )
}

function Total({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-ink/75">{label}</span>
      <span className="font-medium text-navy-900">{nilai}</span>
    </div>
  )
}
