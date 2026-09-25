import { StarIcon } from './icons'

/** Deretan lima bintang SVG, pengganti karakter ★ (25 Sep 2026: semua simbol
 *  teks diganti ikon supaya tidak dirender font emoji dan tebalnya seragam
 *  dengan ikon lain). Nilainya dibacakan lewat aria-label, bukan dihitung
 *  pembaca layar bintang demi bintang. */
export default function Bintang({ nilai, className = 'h-4 w-4' }: { nilai: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 align-[-2px]" role="img" aria-label={`${nilai} dari 5 bintang`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} className={`${className} ${n <= nilai ? 'text-star' : 'text-line'}`} />
      ))}
    </span>
  )
}
