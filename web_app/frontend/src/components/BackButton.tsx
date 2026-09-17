import { Link } from 'react-router-dom'
import { ArrowRight } from './icons'

/** Kembali ke halaman daftar kategori.
 *
 *  Sengaja TUJUAN TETAP, bukan navigate(-1). Riwayat browser tidak selalu
 *  berarti "satu langkah mundur di alur": halaman pesan punya tautan kembali
 *  sendiri yang MENDORONG entri baru ke riwayat, jadi sesudah
 *  detail -> pesan -> (tautan kembali) -> detail, navigate(-1) justru
 *  melemparkan orang MAJU lagi ke halaman pesan. Tujuan tetap tidak pernah
 *  salah, dan tetap benar waktu halaman ini dibuka langsung dari URL. */
export default function BackButton({ ke }: { ke: string }) {
  return (
    <Link
      to={ke}
      className="inline-flex items-center gap-2 text-[14px] text-navy-900/80 transition-colors hover:text-navy-900"
    >
      <ArrowRight className="h-4 w-4 rotate-180" />
      Kembali
    </Link>
  )
}
