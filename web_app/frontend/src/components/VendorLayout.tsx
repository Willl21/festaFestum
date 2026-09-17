import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { cekAkses } from './PenjagaAkses'
import { useEffect, useState } from 'react'
import { clearAuth, getMyVendor, usePengguna, type ApiVendor } from '../lib/api'
import Img from './Img'
import {
  GridIcon, CalendarIcon, ClockIcon, FolderIcon, WalletIcon,
  BellIcon, ChatIcon, UserCircleIcon, HelpIcon, SettingsIcon,
} from './icons'

/** Kerangka dashboard vendor: sidebar kiri tetap + topbar, isinya lewat
 *  <Outlet />. Sengaja terpisah dari SiteLayout karena sisi vendor tidak
 *  memakai navbar/footer marketplace sama sekali.
 *
 *  Semua halaman vendor lewat sini, jadi penjaga aksesnya cukup satu di
 *  layout ini — sama seperti AdminLayout. Lihat PenjagaAkses.tsx. */

const menu = [
  { to: '/vendor', label: 'Dashboard', icon: GridIcon, end: true },
  { to: '/vendor/pemesanan', label: 'Pemesanan', icon: CalendarIcon },
  // Menu ini tidak ada di mockup. Ditambahkan karena tanpa kalender
  // ketersediaan, tabel vendor_schedules tidak punya cara diisi dari UI —
  // dan itu sumber data untuk pencarian berbasis tanggal.
  { to: '/vendor/jadwal', label: 'Jadwal & Ketersediaan', icon: ClockIcon },
  { to: '/vendor/layanan', label: 'Layanan & Portofolio', icon: FolderIcon },
  { to: '/vendor/keuangan', label: 'Keuangan & Payout', icon: WalletIcon },
]

export default function VendorLayout() {
  const navigate = useNavigate()
  // SEMUA hook dipanggil sebelum cabang penolakan di bawah. Dulu usePengguna()
  // ada DI BAWAH early return, jadi saat keluar (clearAuth memicu render ulang
  // lewat event ff-user) jumlah hook-nya berkurang dan React melempar
  // "Rendered fewer hooks than expected". AdminLayout sudah urut begini.
  const user = usePengguna()
  const [vendor, setVendor] = useState<ApiVendor | null>(null)

  useEffect(() => {
    // Nama bisnis & status verifikasi tidak ada di objek user — keduanya milik
    // tabel vendors. Satu panggilan per pasang layout, bukan per halaman.
    getMyVendor()
      .then((r) => setVendor(r.vendor))
      .catch(() => {}) // vendor baru yang profilnya belum jadi: biarkan kosong
  }, [])

  const tolak = cekAkses('vendor_owner', '/vendor/masuk')
  if (tolak) return tolak

  function keluar() {
    clearAuth()
    navigate('/vendor/masuk')
  }

  return (
    <div className="flex min-h-screen bg-[#f7f8fc]">
      <aside className="sticky top-0 hidden h-screen w-[258px] shrink-0 flex-col border-r border-line bg-white lg:flex">
        <div className="px-6 pt-8 pb-6 text-center">
          <Img
            src={user?.avatar_url || '/img/vendor-avatar.jpg'}
            alt="Foto profil vendor"
            className="mx-auto h-[74px] w-[74px] rounded-lg object-cover"
          />
          <p className="mt-4 font-display text-[22px] font-semibold">
            {vendor?.business_name ?? user?.name ?? 'Vendor'}
          </p>
          {/* Badge terverifikasi cuma muncul kalau memang terverifikasi.
              Sebelumnya "Verified Enterprise" tertulis untuk semua vendor,
              termasuk yang belum lolos tinjauan admin. */}
          <p className="text-[12px] text-muted">
            {vendor?.is_verified ? 'Vendor Terverifikasi' : 'Menunggu verifikasi admin'}
          </p>
        </div>

        <nav className="space-y-1 px-3">
          {menu.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-4 py-3 text-[14px] transition-colors ${
                  isActive
                    ? 'border-r-2 border-ink bg-lavender/40 font-semibold text-ink'
                    : 'text-ink/75 hover:bg-lavender/20'
                }`
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-line p-5">
          {/* Mockup menaruh "Mulai Sesi Baru" di sini, tapi tombol itu tidak
              punya arti apa pun di aplikasi ini. Slotnya dipakai untuk keluar,
              yang memang dibutuhkan vendor. */}
          <p className="truncate text-[13px] font-semibold text-ink">{user?.name ?? 'Vendor'}</p>
          <p className="truncate text-[12px] text-muted">{user?.email}</p>
          <button
            type="button"
            onClick={keluar}
            className="mt-4 w-full rounded-md bg-navy-900 py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Keluar
          </button>
          <div className="mt-5 flex justify-around text-[12px] text-ink/70">
            <span className="flex items-center gap-1.5">
              <HelpIcon /> Bantuan
            </span>
            <span className="flex items-center gap-1.5">
              <SettingsIcon /> Pengaturan
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-line bg-white px-6 py-4 md:px-10">
          <p className="font-display text-[24px] font-semibold">Festa Marketplace</p>
          <div className="flex items-center gap-4 text-ink/70">
            <span className="rounded-full bg-lavender/50 px-3 py-1 text-[12px] font-semibold text-navy-900">
              <span className="text-amber">●</span> Status: Aktif
            </span>
            <BellIcon />
            <ChatIcon />
            <UserCircleIcon className="h-6 w-6" />
            <button
              type="button"
              onClick={keluar}
              className="rounded-md border border-line px-4 py-1.5 text-[12px] font-semibold text-ink/80 transition-colors hover:border-navy-900 hover:text-navy-900 lg:hidden"
            >
              Keluar
            </button>
          </div>
        </header>

        <main className="flex-1 px-6 py-9 md:px-10">
          <div className="mx-auto max-w-[980px]">
            <Outlet />
          </div>
        </main>

        <footer className="bg-lavender/40 px-6 py-8 text-[13px] text-ink/70 md:px-10">
          <p className="font-display text-[24px] font-semibold text-ink">Festa</p>
          <p className="mt-1">© 2026 Festa Marketplace. Secure Escrow Protected.</p>
        </footer>
      </div>
    </div>
  )
}

/** Judul + deskripsi di atas tiap halaman dashboard. */
export function VendorPageHeader({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-[34px] font-semibold">{title}</h1>
        <p className="mt-1 max-w-[620px] text-[15px] text-ink/70">{description}</p>
      </div>
      {action}
    </div>
  )
}

/** Pil status berwarna yang dipakai di tabel pesanan & riwayat payout. */
export function StatusPill({
  tone,
  children,
}: {
  tone: 'info' | 'warn' | 'muted' | 'danger'
  children: React.ReactNode
}) {
  const tones = {
    info: 'bg-lavender/60 text-navy-900',
    warn: 'border border-amber/60 bg-amber/12 text-[#8a5a06]',
    muted: 'bg-stone-100 text-ink/70',
    danger: 'border border-maroon/40 bg-maroon/5 text-maroon',
  }
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-[12px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}
