import { MapPinIcon } from './icons'

/** Blok "Lokasi Vendor". Tanpa peta tertanam (butuh API key & biaya):
 *  kotaknya membuka pencarian Google Maps untuk alamat vendor di tab baru.
 *  Dulu <button> tanpa aksi apa pun. Vendor yang belum mengisi alamat jatuh
 *  ke kotanya saja; tanpa keduanya bloknya tidak ditampilkan sama sekali. */
export default function VendorLocation({ alamat, kota }: { alamat?: string | null; kota?: string | null }) {
  const tujuan = [alamat, kota].filter(Boolean).join(', ')
  if (!tujuan) return null

  return (
    <section className="border-t border-line pt-12">
      <h2 className="font-display text-[26px] font-semibold">Lokasi Vendor</h2>

      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${tujuan}, Indonesia`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 flex h-[190px] w-full max-w-[770px] flex-col items-center justify-center gap-3 rounded-sm bg-navy-900 px-6 text-center text-white transition-opacity hover:opacity-95"
      >
        <MapPinIcon />
        <span className="text-[15px]">Lihat Lokasi Vendor</span>
        <span className="text-[13px] text-white/70">{tujuan}</span>
      </a>
    </section>
  )
}
