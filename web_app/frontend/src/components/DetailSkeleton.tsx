import Bagian from './Bagian'

/** Rangka halaman detail vendor (/florist/:id, /mua/:id, dst).
 *
 *  Lima halaman detail itu salinan satu sama lain — beda kategorinya saja —
 *  jadi rangkanya cukup satu. Ukurannya menyalin layout aslinya: galeri dua
 *  blok 520px, kolom kanan 420px untuk kartu pemesanan. */
export default function DetailSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto max-w-[1330px] px-6 pt-12 pb-20 md:px-12"
    >
      <span className="sr-only">{label}</span>

      <Bagian urutan={0}>
        <div className="shimmer h-4 w-28 rounded-sm bg-line" />
        <div className="shimmer mt-5 h-[38px] w-[420px] max-w-full rounded-sm bg-line" />
        <div className="shimmer mt-3 h-[30px] w-64 rounded-full bg-line/70" />
      </Bagian>

      {/* GALERI — dua blok, besar di kiri, sama seperti aslinya. */}
      <Bagian urutan={1} className="mt-6">
        <div className="grid gap-2.5 md:grid-cols-3">
          <div className="shimmer h-[300px] w-full bg-line md:col-span-2 md:h-[520px]" />
          <div className="shimmer h-[300px] w-full bg-line md:h-[520px]" />
        </div>
      </Bagian>

      <div className="mt-14 grid gap-12 lg:grid-cols-[1fr_420px]">
        <div>
          <Bagian urutan={2}>
            <div className="shimmer h-[26px] w-72 max-w-full rounded-sm bg-line" />
            <div className="mt-5 max-w-[560px] space-y-3">
              <div className="shimmer h-3.5 w-full rounded-sm bg-line/70" />
              <div className="shimmer h-3.5 w-full rounded-sm bg-line/70" />
              <div className="shimmer h-3.5 w-3/5 rounded-sm bg-line/70" />
            </div>
          </Bagian>

          <Bagian urutan={3} className="mt-12 border-t border-line pt-12">
            <div className="shimmer h-[26px] w-52 rounded-sm bg-line" />
          </Bagian>

          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Bagian key={i} urutan={4 + i}>
                <div className="flex flex-col border border-line bg-white p-5">
                  <div className="shimmer h-[22px] w-3/4 rounded-sm bg-line" />
                  <div className="shimmer mt-3 h-3 w-full rounded-sm bg-line/60" />
                  <div className="shimmer mt-2 h-3 w-4/5 rounded-sm bg-line/60" />
                  <div className="shimmer mt-5 h-[21px] w-32 rounded-sm bg-line" />
                </div>
              </Bagian>
            ))}
          </div>
        </div>

        {/* Kolom kanan: kartu pemesanan yang menempel. */}
        <Bagian urutan={2}>
          <div className="border border-line bg-white p-6">
            <div className="shimmer h-[22px] w-40 rounded-sm bg-line" />
            <div className="mt-6 space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <div className="shimmer mb-2 h-3 w-24 rounded-sm bg-line/60" />
                  <div className="shimmer h-11 w-full rounded border border-line bg-line/70" />
                </div>
              ))}
            </div>
            <div className="shimmer mt-6 h-12 w-full rounded-sm bg-line" />
          </div>
        </Bagian>
      </div>
    </div>
  )
}
