import { useState } from 'react'

type Props = {
  src?: string
  alt: string
  className?: string
  /** Ditampilkan besar di tengah kalau foto belum ada. Foto asli belum turun
   *  dari PM, dan blok abu polos bikin semua kategori kelihatan kembar. */
  emoji?: string
  /** Kelas gradien Tailwind untuk latar fallback, mis. 'from-rose-100 to-rose-200'. */
  tint?: string
  /** Matikan lazy-load untuk gambar yang sudah terlihat saat halaman dibuka
   *  (hero). `loading="lazy"` pada gambar di atas lipatan justru menundanya,
   *  dan bertentangan dengan <link rel="preload"> di index.html. */
  prioritas?: boolean
}

/** Gambar dari /public/img. Kalau filenya belum ada (atau src kosong),
 *  tampilkan emoji kategori di atas latar berwarna supaya layout tetap
 *  terbaca dan tiap kategori langsung kelihatan bedanya. */
export default function Img({ src, alt, className = '', emoji, tint, prioritas }: Props) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br ${
          tint ?? 'from-stone-200 to-stone-300'
        } ${className}`}
        role="img"
        aria-label={alt}
      >
        {emoji && (
          <span className="select-none text-[44px] leading-none drop-shadow-sm" aria-hidden="true">
            {emoji}
          </span>
        )}
      </div>
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
