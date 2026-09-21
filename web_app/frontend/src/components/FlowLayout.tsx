import { Link } from 'react-router-dom'

/** Kerangka halaman alur pemesanan (isi data → checkout → pembayaran).
 *  Sengaja tanpa navigasi supaya user tidak keluar alur di tengah jalan. */
export default function FlowLayout({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="border-b border-line bg-cream">
        <div className="mx-auto max-w-[1330px] px-6 py-6 md:px-12">
          <Link to="/" className="font-display text-[26px] font-semibold">
            Festa Festum
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1330px] flex-1 px-6 pt-10 pb-16 md:px-12">
        {title && <h1 className="font-display text-[26px] md:text-[32px] font-semibold">{title}</h1>}
        {children}
      </main>

      <footer className="border-t border-line py-6 text-center text-[13px] text-muted">
        © 2026 Festa Festum. Secure Escrow Payments Guaranteed.
      </footer>
    </div>
  )
}
