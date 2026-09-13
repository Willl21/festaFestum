import Bagian from './Bagian'

/** Rangka halaman ringkasan berkartu-statistik: Pusat Kendali (Ringkasan),
 *  dashboard vendor, dan keuangan vendor. */
export default function PanelSkeleton({
  label,
  kartu = 4,
  blok = 2,
}: {
  label: string
  /** Jumlah kartu angka di baris atas. */
  kartu?: number
  /** Jumlah blok besar di bawahnya. */
  blok?: number
}) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>

      <Bagian urutan={0}>
        <div className="shimmer h-[32px] w-80 max-w-full rounded-sm bg-line" />
        <div className="shimmer mt-3 h-3.5 w-[28rem] max-w-full rounded-sm bg-line/60" />
      </Bagian>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: kartu }, (_, i) => (
          <Bagian key={i} urutan={1 + i}>
            <div className="border border-line bg-white p-5">
              <div className="shimmer h-5 w-5 rounded-sm bg-line" />
              <div className="shimmer mt-4 h-3 w-28 rounded-sm bg-line/60" />
              <div className="shimmer mt-2 h-[26px] w-32 rounded-sm bg-line" />
              <div className="shimmer mt-3 h-2.5 w-36 rounded-sm bg-line/50" />
            </div>
          </Bagian>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {Array.from({ length: blok }, (_, i) => (
          <Bagian key={i} urutan={5 + i}>
            <div className="border border-line bg-white p-6">
              <div className="shimmer h-[22px] w-48 rounded-sm bg-line" />
              <div className="mt-6 space-y-4">
                {[0, 1, 2, 3].map((b) => (
                  <div key={b} className="flex items-center gap-4">
                    <div className="shimmer h-3 w-24 rounded-sm bg-line/60" />
                    <div
                      className="shimmer h-3 flex-1 rounded-sm bg-line/70"
                      style={{ maxWidth: `${80 - b * 15}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </Bagian>
        ))}
      </div>
    </div>
  )
}
