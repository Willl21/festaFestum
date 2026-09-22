import { Link } from 'react-router-dom'
import Img from './Img'
import FlowLayout from './FlowLayout'
import { ArrowRight } from './icons'
import { rupiah } from '../lib/format'

/** Ringkasan pesanan di panel kanan. Datanya dari GET /vendors/:id +
 *  /vendors/:id/services, bukan lagi dari data contoh. */
export type OrderSummary = {
  vendor: string
  packageName: string
  /** Ditempel di baris "Harga Paket", mis. "× 3". Diisi halaman yang punya
   *  input jumlah, supaya total yang berlipat tidak terbaca seperti salah. */
  satuan?: string
  price: number
  /** DP dihitung BACKEND. Halaman ini cuma menampilkan, tidak menghitung —
   *  kalau dua-duanya menghitung, angkanya bisa berbeda dan user ditagih
   *  jumlah yang tidak dia lihat. */
  dp: number
  tint: string
  backTo: string
}

/** Halaman "Lengkapi Detail Pesanan": form di kiri, ringkasan pesanan
 *  menempel di kanan. Isi formnya beda tiap kategori.
 *
 *  Tombolnya submit, bukan Link: booking dibuat dulu di backend supaya
 *  slotnya terkunci, baru pindah ke checkout membawa booking_id asli. */
export default function OrderLayout({
  order, children, onSubmit, mengirim = false, galat = '',
}: {
  order: OrderSummary
  children: React.ReactNode
  onSubmit: () => void
  mengirim?: boolean
  galat?: string
}) {
  return (
    <FlowLayout title="Lengkapi Detail Pesanan">
      <div className="mt-7 grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="space-y-7">
          {children}

          <Link
            to={order.backTo}
            className="inline-block border border-ink px-5 py-2.5 text-[12px] font-semibold tracking-wide"
          >
            KEMBALI KE PROFIL VENDOR
          </Link>
        </div>

        {/* RINGKASAN PESANAN */}
        <aside className="h-fit border border-line bg-white lg:sticky lg:top-8">
          <Img
            alt={order.vendor}
            tint={order.tint}
            className="h-[150px] w-full object-cover"
          />

          <div className="border-t border-line p-6">
            <h2 className="font-display text-[26px] font-semibold">{order.vendor}</h2>
            <p className="mt-2 text-[15px] text-ink/80">{order.packageName}</p>

            <dl className="mt-7 space-y-3 text-[15px]">
              <Row
                label={`Harga Paket${order.satuan ? ` ${order.satuan}` : ''}`}
                value={rupiah(order.price)}
              />
              <Row label="DP yang dibayar sekarang" value={rupiah(order.dp)} />
              <Row label="Sisa saat pelunasan" value={rupiah(order.price - order.dp)} />
            </dl>

            <dl className="mt-7">
              <Row label="Total:" value={rupiah(order.price)} bold />
            </dl>

            {galat && (
              <p className="mt-4 border border-maroon/30 bg-maroon/5 px-3 py-2 text-[13px] text-maroon">
                {galat}
              </p>
            )}

            <button
              type="button"
              onClick={onSubmit}
              disabled={mengirim}
              className="mt-4 flex h-12 w-full items-center justify-center gap-4 rounded-sm bg-amber text-[16px] font-medium text-navy-900 transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {mengirim ? 'Mengunci slot…' : 'Ajukan Pesanan'}
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </aside>
      </div>
    </FlowLayout>
  )
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={bold ? 'text-[17px]' : 'text-ink/85'}>{label}</dt>
      <dd className={`font-semibold ${bold ? 'text-[17px]' : ''}`}>{value}</dd>
    </div>
  )
}

/** Kotak bersekat yang jadi bahan setiap section form. */
export function OrderSection({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="border border-line bg-white p-6 md:p-7">
      <h2 className="flex items-center gap-2.5 font-display text-[19px] font-semibold">
        {icon && <span className="text-amber">{icon}</span>}
        {title}
      </h2>
      <div className="mt-6">{children}</div>
    </section>
  )
}

const fieldClass =
  'mt-2 h-11 w-full rounded-sm border border-line bg-white px-3 text-[14px] outline-none focus:border-navy-900'

/** Label huruf kapital kecil seperti di mockup + input-nya. */
export function OrderField({
  id,
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
}: {
  id: string
  label: string
  type?: string
  placeholder?: string
  value?: string
  onChange?: (v: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[11px] font-semibold tracking-[0.06em] text-ink/70">
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className={fieldClass}
      />
    </div>
  )
}

export function OrderTextarea({
  id,
  label,
  placeholder,
  rows = 5,
  value,
  onChange,
}: {
  id: string
  label?: string
  placeholder?: string
  rows?: number
  value?: string
  onChange?: (v: string) => void
}) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-[11px] font-semibold tracking-[0.06em] text-ink/70">
          {label}
        </label>
      )}
      <textarea
        id={id}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="mt-2 w-full rounded-sm border border-line bg-white p-3 text-[14px] outline-none focus:border-navy-900"
      />
    </div>
  )
}
