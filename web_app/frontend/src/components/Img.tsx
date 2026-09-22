import { useState } from 'react'

type Props = {
  src?: string
  alt: string
  className?: string
  /** Kelas gradien Tailwind untuk latar fallback, mis. 'from-rose-100 to-rose-200'. */
  tint?: string
  /** Matikan lazy-load untuk gambar yang sudah terlihat saat halaman dibuka
   *  (hero). `loading="lazy"` pada gambar di atas lipatan justru menundanya,
   *  dan bertentangan dengan <link rel="preload"> di index.html. */
  prioritas?: boolean
}

/** Gambar dari /public/img. Kalau filenya belum ada (atau src kosong),
 *  yang tampil blok polos seukuran gambarnya — cukup untuk menjaga layout,
 *  tanpa berpura-pura ada isinya.
 *
 *  Emoji kategori DIBUANG (22 September 2026, permintaan user). Dulu dia
 *  mengisi kekosongan waktu belum ada satu pun foto asli; sesudah 727 foto
 *  masuk, yang tersisa cuma slot yang memang belum diisi vendornya — dan
 *  emoji besar di situ terbaca seperti gambar sungguhan, bukan seperti
 *  kekosongan. */
export default function Img({ src, alt, className = '', tint, prioritas }: Props) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div
        className={`bg-gradient-to-br ${tint ?? 'from-stone-100 to-stone-200'} ${className}`}
        role="img"
        aria-label={alt}
      />
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={prioritas ? 'eager' : 'lazy'}
      fetchPriority={prioritas ? 'high' : undefined}
      onError={() => setFailed(true)}
      className={className}
    />
  )
}
