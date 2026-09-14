import Bagian from './Bagian'

/** Rangka halaman /festa-ai.
 *
 *  Halaman ini TIDAK menunggu server saat dibuka — pencarian baru jalan
 *  setelah tombol ditekan. Rangkanya murni animasi masuk, supaya halaman
 *  tidak tampil mendadak seperti halaman lain yang punya rangka. Umur
 *  minimumnya diatur <TukarHalus>.
 *
 *  Menyalin kisi aslinya: panel parameter 420px di kiri, kolom hasil di
 *  kanan. */
export default function FestaAiSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto max-w-[1330px] px-6 py-10 md:px-12"
    >
      <span className="sr-only">{label}</span>

      <div className="grid gap-10 lg:grid-cols-[420px_1fr]">
        {/* PANEL PARAMETER */}
        <Bagian urutan={0}>
          <div className="h-fit rounded-sm border border-line bg-white p-7">
            <div className="shimmer h-[30px] w-56 rounded-sm bg-line" />
            <div className="mt-5 h-px bg-line" />

            <div className="mt-6 space-y-5">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <div className="shimmer h-3.5 w-28 rounded-sm bg-line/60" />
                  <div className="shimmer mt-2 h-12 w-full rounded-sm border border-line bg-line/40" />
                </div>
              ))}
            </div>

            <div className="mt-7 grid grid-cols-2 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="shimmer h-10 rounded-sm bg-line/50" />
              ))}
            </div>

            <div className="shimmer mt-7 h-14 w-full rounded-sm bg-line" />
          </div>
        </Bagian>

        {/* KOLOM HASIL */}
        <div>
          <Bagian urutan={1}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="shimmer h-[32px] w-72 max-w-full rounded-sm bg-line" />
                <div className="shimmer mt-3 h-3.5 w-[460px] max-w-full rounded-sm bg-line/60" />
                <div className="shimmer mt-2 h-3.5 w-[360px] max-w-full rounded-sm bg-line/60" />
              </div>
              <div className="shimmer h-[24px] w-36 rounded-sm bg-line" />
            </div>
          </Bagian>

          <div className="mt-6 space-y-6">
            {[0, 1, 2].map((i) => (
              <Bagian key={i} urutan={2 + i}>
                <div className="grid gap-6 rounded-sm border border-line bg-white p-4 sm:grid-cols-[320px_1fr]">
                  <div className="shimmer h-[200px] w-full bg-line" />
                  <div className="flex flex-col py-2 pr-2">
                    <div className="shimmer h-[26px] w-3/5 rounded-sm bg-line" />
                    <div className="shimmer mt-3 h-3.5 w-full max-w-[420px] rounded-sm bg-line/60" />
                    <div className="shimmer mt-2 h-3.5 w-4/5 max-w-[420px] rounded-sm bg-line/60" />
                    <div className="shimmer mt-4 h-[30px] w-64 rounded-sm bg-line/70" />
                    <div className="mt-auto flex items-end justify-between gap-4 pt-6">
                      <div className="shimmer h-[34px] w-28 rounded-sm bg-line/70" />
                      <div className="shimmer h-[24px] w-32 rounded-sm bg-line" />
                    </div>
                  </div>
                </div>
              </Bagian>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
