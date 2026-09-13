import Bagian from './Bagian'

/** Rangka seluruh landing page.
 *
 *  Catatan jujur: di landing, yang benar-benar menunggu server cuma tiga
 *  kartu "Rekomendasi Vendor". Sisanya statis dan sudah siap digambar.
 *  Rangka sehalaman penuh dipilih user demi konsistensi dengan halaman lain
 *  — layar yang seluruhnya tersusun terbaca sebagai "sedang memuat", bukan
 *  "aplikasinya yang lambat". Kalau suatu saat mau dibalik, cukup ganti
 *  pemakaiannya di LandingPage.tsx; rangka per-bloknya masih ada di riwayat.
 *
 *  Navbar dan footer tidak ikut, sama seperti rangka halaman lain. */
export default function LandingSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>

      {/* HERO — h-[560px] md:h-[720px], dengan panel cari yang menumpuk. */}
      <section className="relative">
        <Bagian urutan={0}>
          <div className="shimmer h-[560px] w-full bg-line md:h-[720px]" />
        </Bagian>

        <div className="relative z-10 mx-auto -mt-2 max-w-[1290px] px-6 md:px-12">
          <Bagian urutan={1}>
            <div className="bg-white px-6 py-5 shadow-[0_2px_20px_rgba(0,0,0,0.06)] md:px-8 md:py-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:gap-6">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex-1">
                    <div className="shimmer mb-2 h-[14px] w-24 rounded-sm bg-line" />
                    <div className="shimmer h-11 w-full rounded border border-line bg-line/70" />
                  </div>
                ))}
                <div className="shimmer h-11 rounded bg-line md:w-[180px]" />
              </div>
            </div>
          </Bagian>
        </div>
      </section>

      {/* LIMA KATEGORI */}
      <div className="mx-auto max-w-[1290px] px-6 pt-14 md:px-12">
        <Bagian urutan={2}>
          <div className="shimmer h-[26px] w-[420px] max-w-full rounded-sm bg-line" />
          <div className="shimmer mt-3 h-3 w-[480px] max-w-full rounded-sm bg-line/60" />
        </Bagian>

        <div className="mt-7 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Bagian key={i} urutan={3 + i}>
              <div className="shimmer h-[240px] w-full bg-line" />
              <div className="shimmer mx-auto mt-3 h-3.5 w-24 rounded-sm bg-line/70" />
            </Bagian>
          ))}
        </div>
      </div>

      {/* REKOMENDASI — satu kartu besar, dua kecil. */}
      <div className="mx-auto max-w-[1290px] px-6 pt-24 md:px-12">
        <Bagian urutan={8}>
          <div className="shimmer h-[30px] w-64 rounded-sm bg-line" />
          <div className="shimmer mt-3 h-3 w-72 max-w-full rounded-sm bg-line/60" />
        </Bagian>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          <Bagian urutan={9}>
            <div className="shimmer flex flex-col border border-line bg-white">
              <div className="h-[290px] w-full bg-line" />
              <div className="px-7 py-7">
                <div className="h-[30px] w-3/4 rounded-sm bg-line" />
                <div className="mt-4 flex gap-4">
                  <div className="h-6 w-24 rounded-sm bg-line/70" />
                  <div className="h-6 w-32 rounded-sm bg-line/50" />
                </div>
                <div className="mt-8 h-[50px] w-full rounded-sm bg-line" />
              </div>
            </div>
          </Bagian>

          <div className="grid gap-6">
            {[0, 1].map((i) => (
              <Bagian key={i} urutan={10 + i}>
                <div className="shimmer flex flex-col border border-line bg-white">
                  <div className="h-[150px] w-full bg-line" />
                  <div className="px-6 py-5">
                    <div className="h-[22px] w-2/3 rounded-sm bg-line" />
                    <div className="mt-3 h-3 w-40 rounded-sm bg-line/60" />
                  </div>
                </div>
              </Bagian>
            ))}
          </div>
        </div>
      </div>

      {/* 3 LANGKAH — blok lavender. */}
      <div className="mx-auto max-w-[1290px] px-6 pt-24 pb-10 md:px-12">
        <Bagian urutan={12}>
          <div className="bg-lavender px-8 py-14 md:px-16">
            <div className="shimmer mx-auto h-[26px] w-80 max-w-full rounded-sm bg-line" />
            <div className="mt-10 grid gap-10 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="shimmer h-[52px] w-[52px] rounded-sm bg-line" />
                  <div className="shimmer mt-4 h-4 w-36 rounded-sm bg-line/70" />
                  <div className="shimmer mt-3 h-3 w-48 max-w-full rounded-sm bg-line/50" />
                </div>
              ))}
            </div>
          </div>
        </Bagian>
      </div>
    </div>
  )
}
