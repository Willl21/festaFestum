import { rincianLayanan } from '../data/layananFields'
import type { ApiService } from '../lib/api'

/** Keterangan tambahan sebuah layanan (services.details, migrasi 012).
 *
 *  Tidak merender apa pun kalau vendornya belum mengisi — 17 layanan lama
 *  semuanya `{}`, dan judul kosong di tiap kartu lebih buruk daripada tidak
 *  ada bagiannya sama sekali.
 *
 *  Dipakai lima halaman detail. Ini satu-satunya abstraksi lintas halaman di
 *  sini, dan alasannya sama dengan UlasanVendor: yang dibagikan adalah
 *  TAMPILAN data yang bentuknya identik, bukan logika fetch per halaman. */
export default function RincianLayanan({
  service,
  className = '',
}: {
  service: Pick<ApiService, 'category' | 'details'>
  className?: string
}) {
  const rincian = rincianLayanan(service.category, service.details)
  if (rincian.length === 0) return null

  return (
    <dl className={`grid gap-x-5 gap-y-1.5 text-[12px] sm:grid-cols-[auto_1fr] ${className}`}>
      {rincian.map((r) => (
        <div key={r.label} className="sm:contents">
          <dt className="text-muted sm:whitespace-nowrap">{r.label}</dt>
          <dd className="text-ink/85">{r.nilai}</dd>
        </div>
      ))}
    </dl>
  )
}
