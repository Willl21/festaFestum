import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { GridIcon, ShieldIcon, WalletIcon, UserCircleIcon, BellIcon, MenuIcon } from './icons'
import { cekAkses } from './PenjagaAkses'
import { clearAuth, usePengguna } from '../lib/api'

/** Kerangka Pusat Kendali admin: sidebar gelap + topbar, isinya lewat
 *  <Outlet />. Terpisah dari VendorLayout karena menunya beda total dan
 *  tampilannya gelap.
 *
 *  Keempat menunya sudah ada halamannya.
 *
 *  Penjaga aksesnya di layout ini, bukan di tiap halaman: keempat halaman
 *  admin lewat sini, jadi satu pemeriksaan menutup semuanya — dan halaman
 *  admin baru ikut terjaga tanpa perlu diingat. Lihat PenjagaAkses.tsx.
 *
 *  Drawer di bawah lg dengan pola yang sama persis seperti VendorLayout —
 *  sidebar yang sama digeser, bukan menu kedua. Sengaja disalin dan tidak
 *  diangkat jadi komponen bersama: dua kemunculan, dan warnanya beda
 *  (navy vs putih). Kalau muncul yang ketiga, baru disatukan. */

const menu = [
  { to: '/admin', label: 'Ringkasan', icon: GridIcon, end: true },
  { to: '/admin/vendor', label: 'Persetujuan Vendor', icon: ShieldIcon },
  { to: '/admin/escrow', label: 'Pusat Escrow', icon: WalletIcon },
  { to: '/admin/akun', label: 'Akun Pengguna & Vendor', icon: UserCircleIcon },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const user = usePengguna()
  // Sebelum cabang penolakan — sama seperti di VendorLayout, hook di bawah
  // early return bikin jumlahnya berubah saat keluar.
  const [menuBuka, setMenuBuka] = useState(false)
  const tolak = cekAkses('admin', '/admin/masuk')
  if (tolak) return tolak

  function keluar() {
    clearAuth()
    navigate('/admin/masuk')
  }

  return (
    <div
      className="flex min-h-screen bg-[#f7f8fc]"
      onKeyDown={(e) => e.key === 'Escape' && setMenuBuka(false)}
    >
      {menuBuka && (
        <button
          type="button"
          aria-label="Tutup menu"
          onClick={() => setMenuBuka(false)}
          className="fixed inset-0 z-30 bg-ink/50 lg:hidden"
        />
      )}

      <aside
        id="menu-admin"
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-[268px] shrink-0 flex-col overflow-y-auto bg-navy-900 transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0 ${
          menuBuka ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-6 pt-7 pb-8">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 font-display text-[18px] font-semibold text-amber">
            F.
          </span>
          <span>
            <span className="block font-display text-[20px] leading-none font-semibold text-white">
              Festa Festum
            </span>
            <span className="mt-1 block text-[10px] tracking-[0.18em] text-amber uppercase">
              Pusat Kendali
            </span>
          </span>
        </div>

        <nav className="space-y-1 px-3" onClick={() => setMenuBuka(false)}>
          {menu.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-4 py-3 text-[14px] transition-colors ${
                  isActive ? 'bg-white/10 font-semibold text-white' : 'text-white/65 hover:bg-white/5'
                }`
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-3 border-t border-white/10 p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-[13px] font-semibold text-white">
            {(user?.name ?? 'A').slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-white">
              {user?.name ?? 'Admin'}
            </span>
            <span className="block text-[10px] tracking-wide text-amber uppercase">Super Admin</span>
          </span>
          <button
            type="button"
            onClick={keluar}
            className="text-[12px] font-semibold text-white/60 hover:text-white"
          >
            Keluar
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-4 border-b border-line bg-white px-6 py-4 md:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Buka menu"
              aria-expanded={menuBuka}
              aria-controls="menu-admin"
              onClick={() => setMenuBuka(true)}
              className="shrink-0 rounded-md border border-line p-1.5 text-ink/80 transition-colors hover:border-navy-900 hover:text-navy-900 lg:hidden"
            >
              <MenuIcon />
            </button>
            <p className="text-[12px] tracking-wide text-muted uppercase">
              Konsol Marketplace Institusional <span className="mx-2 text-amber">•</span> Hub
              Sentral Jabodetabek
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 text-[12px] text-ink/70">
              <span className="h-2 w-2 rounded-full bg-[#2e6b52]" /> Gateway Escrow: Sandbox
            </span>
            <BellIcon className="h-5 w-5 text-ink/50" />
          </div>
        </header>

        <main className="px-6 py-8 md:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
