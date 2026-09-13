import Bagian from './Bagian'

/** Rangka halaman alur pemesanan: halaman pesan, checkout, tagihan, dan
 *  konfirmasi. Bentuknya sama — kolom isian di kiri, kartu ringkasan yang
 *  menempel di kanan. */
export default function FormSkeleton({
  label,
  baris = 4,
}: {
  label: string
  /** Jumlah isian di kolom kiri. */
  baris?: number
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto max-w-[1330px] px-6 pt-12 pb-20 md:px-12"
    >
      <span className="sr-only">{label}</span>

      <Bagian urutan={0}>
        <div className="shimmer h-4 w-28 rounded-sm bg-line" />
        <div className="shimmer mt-5 h-[32px] w-80 max-w-full rounded-sm bg-line" />
      </Bagian>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          {Array.from({ length: baris }, (_, i) => (
            <Bagian key={i} urutan={1 + i}>
              <div className="shimmer mb-2 h-3 w-28 rounded-sm bg-line/60" />
              <div className="shimmer h-11 w-full rounded border border-line bg-line/70" />
            </Bagian>
          ))}
        </div>

        <Bagian urutan={1}>
          <div className="border border-line bg-white p-6">
            <div className="shimmer h-[22px] w-44 rounded-sm bg-line" />
            <div className="mt-6 space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between gap-6">
                  <div className="shimmer h-3 w-24 rounded-sm bg-line/60" />
                  <div className="shimmer h-3 w-20 rounded-sm bg-line/60" />
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-center justify-between gap-6 border-t border-line pt-5">
              <div className="shimmer h-3 w-20 rounded-sm bg-line/60" />
              <div className="shimmer h-[21px] w-28 rounded-sm bg-line" />
            </div>
            <div className="shimmer mt-6 h-12 w-full rounded-sm bg-line" />
          </div>
        </Bagian>
      </div>
    </div>
  )
}
