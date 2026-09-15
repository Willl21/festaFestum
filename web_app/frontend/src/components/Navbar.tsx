import { NavLink, Link, useNavigate } from 'react-router-dom'
import { clearAuth, usePengguna } from '../lib/api'

export default function Navbar() {
  const navigate = useNavigate()
  // Halaman profil duduk di dalam SiteLayout, jadi navbar TIDAK ter-mount ulang
  // setelah nama atau foto disimpan — usePengguna() yang bikin ikut berubah.
  const user = usePengguna()

  // "Pesanan Saya" hanya untuk yang sudah masuk; tamu tidak punya pesanan.
  const links = [
    { to: '/', label: 'Beranda' },
    { to: '/festa-ai', label: 'Festa AI' },
    ...(user ? [{ to: '/pesanan', label: 'Pesanan Saya' }] : []),
  ]

  function keluar() {
    clearAuth()
    navigate('/masuk')
  }

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-cream/95 backdrop-blur">
      <div className="mx-auto flex h-[70px] max-w-[1440px] items-center justify-between px-6 md:px-12">
        <Link to="/" className="font-display text-2xl font-semibold tracking-tight md:text-[28px]">
          Festa Festum
        </Link>

        <nav className="hidden items-center gap-10 md:flex">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `pb-1 text-[15px] transition-colors ${
                  isActive
                    ? 'border-b-2 border-ink font-medium text-ink'
                    : 'border-b-2 border-transparent text-ink/80 hover:text-ink'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        {user ? (
          <div className="flex items-center gap-3">
            <Link
              to={user.role === 'vendor_owner' ? '/vendor' : '/profil'}
              className="flex items-center gap-2.5"
              title={user.email}
            >
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 text-[14px] font-medium text-white">
                  {user.name.trim().charAt(0).toUpperCase()}
                </span>
              )}
              <span className="hidden max-w-[140px] truncate text-[15px] text-ink md:block">
                {user.name}
              </span>
            </Link>
            <button
              type="button"
              onClick={keluar}
              className="text-[13px] font-semibold tracking-[0.06em] text-muted transition-colors hover:text-maroon"
            >
              KELUAR
            </button>
          </div>
        ) : (
          <Link
            to="/masuk"
            className="flex h-9 items-center rounded bg-navy-900 px-5 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Masuk
          </Link>
        )}
      </div>
    </header>
  )
}
