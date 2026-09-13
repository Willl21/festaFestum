import Bagian from './Bagian'
import { VendorCardSkeleton } from './VendorCard'

/** Rangka SELURUH halaman kategori selagi daftar vendor dimuat.
 *
 *  Kenapa seluruh halaman, bukan cuma kartunya: halaman yang tampil utuh
 *  dengan satu kotak menganga terbaca sebagai "backend-nya lambat", karena
 *  jelas semua kode kita sudah sampai di browser. Layar yang seluruhnya
 *  masih tersusun terbaca sebagai "sedang memuat" — dan pengunjung
 *  cenderung menyalahkan koneksinya sendiri, bukan aplikasinya.
 *
 *  Navbar dan footer SENGAJA tidak ikut: rangka yang tetap utuh itu yang
 *  membedakan "sedang memuat" dari "rusak".
 *
 *  Bagiannya masuk berurutan, bukan serentak. Kemunculan serentak menukar
 *  seluruh layar dalam satu frame dan justru terbaca sebagai kedipan. */
export default function KategoriSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>

      {/* HERO — menyalin h-[340px] md:h-[500px] dari halaman aslinya. */}
      <section className="relative">
        <Bagian urutan={0}>
          <div className="shimmer h-[340px] bg-line md:h-[500px]" />
        </Bagian>

        {/* Panel pencarian, termasuk tumpukan -mt-2 di atas hero. */}
        <div className="relative z-10 mx-auto -mt-2 max-w-[1330px] px-6 md:px-12">
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

      <section className="mx-auto max-w-[1330px] px-6 pt-10 md:px-12">
        <Bagian urutan={2}>
          <div className="shimmer h-[32px] w-56 rounded-sm bg-line" />
        </Bagian>

        <div className="mt-7 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Bagian key={i} urutan={3 + i}>
              <VendorCardSkeleton />
            </Bagian>
          ))}
        </div>
      </section>
    </div>
  )
}
