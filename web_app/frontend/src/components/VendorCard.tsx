import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import Img from './Img'
import { StarIcon } from './icons'
import { rupiahBulat } from '../lib/format'

export type Vendor = {
  id: string
  name: string
  city: string
  rating: number
  ratingCount: number
  priceFrom: number
  /** Kosongkan selama foto vendor belum ada — emoji kategori yang dipakai. */
  image?: string
  emoji?: string
  tint?: string
}

/** Kartu vendor di grid halaman kategori.
 *
 *  Masuk dengan fade, bukan muncul mendadak: skeleton yang dia gantikan
 *  hilang seketika di tengah denyut `animate-pulse`, jadi pertukaran tanpa
 *  transisi terbaca sebagai kedipan. Mulai dari 0.45, bukan 0, supaya
 *  kecerahannya nyambung dengan skeleton yang berayun 1 → 0.5. */
export default function VendorCard({
  vendor,
  to,
  index = 0,
}: {
  vendor: Vendor
  to: string
  /** Urutan di grid — dipakai untuk jeda masuk, supaya kartunya beriak
   *  satu per satu dan bukan bertukar serentak dalam satu frame. */
  index?: number
}) {
  return (
    <motion.article
      className="flex flex-col border border-line bg-white"
      initial={{ opacity: 0.45 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3), ease: 'easeOut' }}
    >
      <Img
        src={vendor.image}
        alt={vendor.name}
        emoji={vendor.emoji}
        tint={vendor.tint}
        className="h-[210px] w-full object-cover"
      />

      <div className="px-5 pt-4 pb-4">
        <h3 className="font-display text-[22px] font-semibold">{vendor.name}</h3>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[12px] text-muted">{vendor.city}</span>
          {/* rating_count masih 0 untuk vendor hasil seed — dataset cuma punya
              rata-ratanya, belum ada tabel reviews yang terisi. */}
          <span className="flex items-center gap-1 text-[12px] text-ink/80">
            <StarIcon className="h-3.5 w-3.5 text-star" />
            {vendor.rating}
            {vendor.ratingCount > 0 && ` (${vendor.ratingCount} ulasan)`}
          </span>
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between border-t border-line px-5 py-4">
        <div>
          <p className="text-[12px] text-muted">Mulai dari</p>
          <p className="font-display text-[21px] font-semibold">{rupiahBulat(vendor.priceFrom)}</p>
        </div>
        <Link
          to={to}
          className="rounded-sm border border-line px-4 py-1.5 text-[12px] transition-colors hover:border-navy-900 hover:text-navy-900"
        >
          Lihat Profil
        </Link>
      </div>
    </motion.article>
  )
}

/** Rangka kartu selagi data vendor dimuat.
 *
 *  Ukurannya sengaja menyalin VendorCard baris demi baris — tinggi gambar,
 *  border, dan garis footer — supaya tidak ada yang melompat begitu data
 *  datang. Kalau kartunya diubah, ubah yang ini juga.
 *
 *  Kilaunya dari kelas `.shimmer` di index.css, bukan `animate-pulse`:
 *  pulse mengayun opacity seluruh kartu, jadi saat kartu asli masuk
 *  kecerahannya melompat dan terbaca sebagai kedipan.
 *
 *  `aria-hidden` karena ini murni hiasan; status muatnya diumumkan lewat
 *  role="status" di pemanggilnya. */
export function VendorCardSkeleton() {
  return (
    <article className="shimmer flex flex-col border border-line bg-white" aria-hidden>
      <div className="h-[210px] w-full bg-line" />

      <div className="px-5 pt-4 pb-4">
        <div className="h-[22px] w-[70%] rounded-sm bg-line/80" />
        <div className="mt-2.5 flex items-center justify-between">
          <div className="h-3 w-20 rounded-sm bg-line/50" />
          <div className="h-3 w-14 rounded-sm bg-line/50" />
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between border-t border-line px-5 py-4">
        <div>
          <div className="h-3 w-16 rounded-sm bg-line/50" />
          <div className="mt-2 h-[21px] w-28 rounded-sm bg-line/80" />
        </div>
        <div className="h-[29px] w-24 rounded-sm bg-line/50" />
      </div>
    </article>
  )
}
