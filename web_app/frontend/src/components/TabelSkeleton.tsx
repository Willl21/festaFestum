import Bagian from './Bagian'

/** Rangka daftar bertabel: Pusat Kendali (vendor/escrow/akun), pemesanan
 *  vendor, dan Pesanan Saya. Bentuknya sama semua — judul, lalu baris-baris —
 *  jadi yang dibedakan cuma jumlah kolom dan barisnya. */
export default function TabelSkeleton({
  label,
  kolom = 4,
  baris = 6,
  judul = true,
}: {
  label: string
  kolom?: number
  baris?: number
  /** Matikan kalau pemanggilnya sudah punya judul asli di atas rangka. */
  judul?: boolean
}) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>

      {judul && (
        <Bagian urutan={0}>
          <div className="shimmer h-[32px] w-72 max-w-full rounded-sm bg-line" />
          <div className="shimmer mt-3 h-3.5 w-96 max-w-full rounded-sm bg-line/60" />
        </Bagian>
      )}

      <Bagian urutan={1} className="mt-7">
        <div className="border border-line bg-white">
          {/* Kepala tabel — latar cream seperti aslinya. */}
          <div className="flex gap-5 bg-cream px-5 py-3">
            {Array.from({ length: kolom }, (_, i) => (
              <div key={i} className="shimmer h-2.5 flex-1 rounded-sm bg-line" />
            ))}
          </div>

          {Array.from({ length: baris }, (_, i) => (
            <div key={i} className="flex gap-5 border-t border-line px-5 py-4">
              {Array.from({ length: kolom }, (_, k) => (
                <div
                  key={k}
                  className="shimmer h-3.5 flex-1 rounded-sm bg-line/70"
                  // Lebar diseling supaya tidak terbaca sebagai kisi kaku.
                  style={{ maxWidth: k === 0 ? '100%' : `${70 + ((i + k) % 3) * 10}%` }}
                />
              ))}
            </div>
          ))}
        </div>
      </Bagian>
    </div>
  )
}
