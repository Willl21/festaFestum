import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { cekAkses } from './PenjagaAkses'
import { useEffect, useState } from 'react'
import {
  clearAuth, getMyVendor, pesanBelumDibaca, usePengguna, type ApiVendor,
} from '../lib/api'
import Img from './Img'
import {
  GridIcon, CalendarIcon, ClockIcon, FolderIcon, WalletIcon,
  BellIcon, ChatIcon, UserCircleIcon, HelpIcon, SettingsIcon, MenuIcon,
} from './icons'

/** Kerangka dashboard vendor: sidebar kiri tetap + topbar, isinya lewat
 *  <Outlet />. Sengaja terpisah dari SiteLayout karena sisi vendor tidak
 *  memakai navbar/footer marketplace sama sekali.
 *
 *  Semua halaman vendor lewat sini, jadi penjaga aksesnya cukup satu di
 *  layout ini — sama seperti AdminLayout. Lihat PenjagaAkses.tsx.
 *
 *  Di bawah lg, sidebar yang SAMA dipakai sebagai drawer (fixed + digeser
 *  keluar layar), bukan disembunyikan lalu digantikan menu kedua. Sebelumnya
 *  dia `hidden` tanpa pengganti apa pun, jadi vendor yang membuka dari HP
 *  mendarat di dashboard lalu mentok — tidak ada jalan ke Jadwal, Layanan,
 *  Pemesanan, atau Keuangan. */

const menu = [
  { to: '/vendor', label: 'Dashboard', icon: GridIcon, end: true },
  { to: '/vendor/pemesanan', label: 'Pemesanan', icon: CalendarIcon },
  // Menu ini tidak ada di mockup. Ditambahkan karena tanpa kalender
  // ketersediaan, tabel vendor_schedules tidak punya cara diisi dari UI —
  // dan itu sumber data untuk pencarian berbasis tanggal.
  { to: '/vendor/jadwal', label: 'Jadwal & Ketersediaan', icon: ClockIcon },
  { to: '/vendor/layanan', label: 'Layanan & Portofolio', icon: FolderIcon },
  { to: '/vendor/keuangan', label: 'Keuangan & Payout', icon: WalletIcon },
  { to: '/vendor/pesan', label: 'Pusat Obrolan', icon: ChatIcon },
]

export default function VendorLayout() {
  const navigate = useNavigate()
  // SEMUA hook dipanggil sebelum cabang penolakan di bawah. Dulu usePengguna()
  // ada DI BAWAH early return, jadi saat keluar (clearAuth memicu render ulang
  // lewat event ff-user) jumlah hook-nya berkurang dan React melempar
  // "Rendered fewer hooks than expected". AdminLayout sudah urut begini.
  const user = usePengguna()
  const [vendor, setVendor] = useState<ApiVendor | null>(null)
  const [menuBuka, setMenuBuka] = useState(false)
  const [belumDibaca, setBelumDibaca] = useState(0)

  useEffect(() => {
    // Nama bisnis & status verifikasi tidak ada di objek user — keduanya milik
    // tabel vendors. Satu panggilan per pasang layout, bukan per halaman.
    getMyVendor()
      .then((r) => setVendor(r.vendor))
      .catch(() => {}) // vendor baru yang profilnya belum jadi: biarkan kosong
  }, [])

  // Lencana obrolan ditarik di layout, bukan di halamannya: angkanya harus
  // terlihat dari halaman vendor mana pun. Satu angka, bukan seluruh daftar.
  // ponytail: polling 30 detik. Ikut naik ke SSE kalau halaman obrolannya naik.
  useEffect(() => {
    let hidup = true
    const tarik = () =>
      pesanBelumDibaca()
        .then((r) => hidup && setBelumDibaca(r.jumlah))
        .catch(() => {}) // lencana bukan alasan menggagalkan seluruh dashboard
    tarik()
    const t = setInterval(tarik, 30_000)
    return () => {
      hidup = false
      clearInterval(t)
    }
  }, [])

  const tolak = cekAkses('vendor_owner', '/vendor/masuk')
  if (tolak) return tolak

  function keluar() {
    clearAuth()
    navigate('/vendor/masuk')
  }

  return (
    <div
      className="flex min-h-screen bg-[#f7f8fc]"
      onKeyDown={(e) => e.key === 'Escape' && setMenuBuka(false)}
    >
      {/* Latar gelap cuma ada selagi drawer terbuka. <button>, bukan <div>,
          supaya bisa ditutup lewat keyboard juga. */}
      {menuBuka && (
        <button
          type="button"
          aria-label="Tutup menu"
          onClick={() => setMenuBuka(false)}
          className="fixed inset-0 z-30 bg-ink/40 lg:hidden"
        />
      )}

      <aside
        id="menu-vendor"
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-[258px] shrink-0 flex-col overflow-y-auto border-r border-line bg-white transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0 ${
          menuBuka ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
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

        {/* Menutup drawer lewat nav-nya, bukan lewat useEffect yang mengintai
            perubahan rute: yang bisa membukanya cuma menu ini. */}
        <nav className="space-y-1 px-3" onClick={() => setMenuBuka(false)}>
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
            {/* Hiasan di sini tidak muat bareng tombol menu di layar 375px —
                header-nya melar 13px dan SELURUH halaman vendor bisa digeser
                ke samping. Ikon obrolan DIKECUALIKAN: sejak punya halaman
                sungguhan dia satu-satunya yang bisa diklik, jadi tetap tampil
                di HP. Lonceng & avatar masih hiasan, itu yang dikorbankan. */}
            <span className="hidden items-center gap-4 sm:flex">
              <span className="rounded-full bg-lavender/50 px-3 py-1 text-[12px] font-semibold text-navy-900">
                <span className="text-amber">●</span> Status: Aktif
              </span>
              <BellIcon />
            </span>
            <Link
              to="/vendor/pesan"
              aria-label={
                belumDibaca > 0
                  ? `Pusat Obrolan, ${belumDibaca} pesan belum dibaca`
                  : 'Pusat Obrolan'
              }
              className="relative text-ink/70 transition-colors hover:text-navy-900"
            >
              <ChatIcon />
              {belumDibaca > 0 && (
                <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-maroon px-1 text-[10px] font-semibold text-white">
                  {belumDibaca > 9 ? '9+' : belumDibaca}
                </span>
              )}
            </Link>
            <span className="hidden sm:flex">
              <UserCircleIcon className="h-6 w-6" />
            </span>
            {/* Tombol Keluar yang dulu di sini dibuang: sidebar sudah punya
                satu, dan sekarang sidebarnya terjangkau dari HP. */}
            <button
              type="button"
              aria-label="Buka menu"
              aria-expanded={menuBuka}
              aria-controls="menu-vendor"
              onClick={() => setMenuBuka(true)}
              className="rounded-md border border-line p-1.5 text-ink/80 transition-colors hover:border-navy-900 hover:text-navy-900 lg:hidden"
            >
              <MenuIcon />
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
