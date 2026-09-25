import { useEffect, useState } from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ChatIcon, MenuIcon } from './icons'
import { clearAuth, listMyBookings, pesanBelumDibaca, usePengguna } from '../lib/api'

export default function Navbar() {
  const navigate = useNavigate()
  // Halaman profil duduk di dalam SiteLayout, jadi navbar TIDAK ter-mount ulang
  // setelah nama atau foto disimpan — usePengguna() yang bikin ikut berubah.
  const user = usePengguna()
  // Di bawah md tautan navigasi tidak muat di bilah; tanpa panel ini
  // Beranda/Festa AI/Pesanan Saya sama sekali tidak bisa dijangkau dari HP.
  const [menuBuka, setMenuBuka] = useState(false)
  const [belumDibaca, setBelumDibaca] = useState(0)
  // Pesanan yang sudah DITERIMA vendor tapi DP-nya belum dibayar (revisi PM:
  // "taunya udah dikonfirmasi gimana?"). Tanpa ini customer harus rajin
  // membuka Pesanan Saya sendiri untuk tahu gilirannya membayar.
  const [perluBayar, setPerluBayar] = useState(0)

  // Navbar ikut di semua halaman pelanggan, jadi lencananya ditarik di sini —
  // satu angka lewat /chat/belum-dibaca, bukan seluruh daftar percakapan.
  // Tamu tidak punya obrolan, jadi tidak ada permintaan sama sekali sebelum
  // masuk. ponytail: polling 30 detik, sama dengan lencana di dashboard vendor.
  useEffect(() => {
    // Tidak perlu menolkan saat keluar: ikonnya cuma dirender kalau ada user,
    // dan masuk lagi memicu efek ini menarik angka yang segar.
    if (!user) return
    let hidup = true
    const tarik = () => {
      pesanBelumDibaca()
        .then((r) => hidup && setBelumDibaca(r.jumlah))
        .catch(() => {}) // lencana bukan alasan merusak navbar di semua halaman
      // Memakai GET /bookings yang sudah ada, bukan endpoint hitung baru:
      // pesanan satu customer cuma belasan baris. Vendor & admin dilewati —
      // "Pesanan Saya" milik pelanggan.
      if (user.role === 'customer') {
        listMyBookings()
          .then((r) => hidup && setPerluBayar(r.data.filter(
            (b) => b.confirm_status === 'diterima' && b.payment_status === 'pending',
          ).length))
          .catch(() => {})
      }
    }
    tarik()
    const t = setInterval(tarik, 30_000)
    return () => {
      hidup = false
      clearInterval(t)
    }
  }, [user])

  // "Pesanan Saya" hanya untuk yang sudah masuk; tamu tidak punya pesanan.
  const links = [
    { to: '/', label: 'Beranda' },
    { to: '/festa-ai', label: 'Festa AI' },
    ...(user ? [{ to: '/pesanan', label: 'Pesanan Saya', lencana: perluBayar }] : []),
  ] as { to: string; label: string; lencana?: number }[]

  /** Titik angka di "Pesanan Saya". Dipakai dua kali: bilah desktop & menu HP. */
  const lencana = (n?: number) =>
    n ? (
      <span
        title={`${n} pesanan sudah diterima vendor dan menunggu pembayaran DP`}
        className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-maroon px-1 align-top text-[10px] font-semibold text-white"
      >
        {n > 9 ? '9+' : n}
      </span>
    ) : null

  function keluar() {
    clearAuth()
    navigate('/masuk')
  }

  return (
    <header
      className="sticky top-0 z-50 border-b border-line bg-cream/95 backdrop-blur"
      onKeyDown={(e) => e.key === 'Escape' && setMenuBuka(false)}
    >
      <div className="mx-auto flex h-[70px] max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 md:px-12">
        <Link to="/" className="font-display text-2xl font-semibold tracking-tight md:text-[28px]">
          Festa Festum
        </Link>

        <nav className="hidden items-center gap-10 md:flex">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              // Border bawahnya tetap ada di SEMUA tautan tapi selalu bening —
              // garis aktifnya sekarang elemen tersendiri. Bordernya disisakan
              // murni sebagai pengganjal 2px supaya tinggi tautan tidak berubah
              // dan navbar tidak bergeser sepiksel pun.
              className={({ isActive }) =>
                `relative border-b-2 border-transparent pb-1 text-[15px] transition-colors ${
                  isActive ? 'font-medium text-ink' : 'text-ink/80 hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {l.label}
                  {lencana(l.lencana)}
                  {isActive && (
                    <motion.span
                      // Satu-satunya yang bikin garisnya meluncur, bukan
                      // lompat: `layoutId` yang sama membuat motion mengenali
                      // garis yang dicopot di tautan lama dan yang dipasang di
                      // tautan baru sebagai BENDA YANG SAMA, lalu menganimasikan
                      // jarak antar keduanya sendiri.
                      layoutId="garis-navbar"
                      // -bottom-0.5 menaruhnya persis di tempat border-b-2 tadi:
                      // posisi absolut diukur dari kotak padding, sedangkan
                      // border duduk 2px di luarnya.
                      className="absolute -bottom-0.5 left-0 h-0.5 w-full bg-ink"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              {/* Vendor yang sedang membuka sisi marketplace tetap dibawa ke
                  pusat obrolannya sendiri, sama seperti tautan avatar. */}
              <Link
                to={user.role === 'vendor_owner' ? '/vendor/pesan' : '/pesan'}
                aria-label={
                  belumDibaca > 0
                    ? `Obrolan, ${belumDibaca} pesan belum dibaca`
                    : 'Obrolan'
                }
                className="relative mr-1 text-ink/75 transition-colors hover:text-ink"
              >
                <ChatIcon className="h-[22px] w-[22px]" />
                {belumDibaca > 0 && (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-maroon px-1 text-[10px] font-semibold text-white">
                    {belumDibaca > 9 ? '9+' : belumDibaca}
                  </span>
                )}
              </Link>

              {/* Pemisah: lencananya menjorok ke kanan (-right-2), jadi tanpa
                  garis ini ikon obrolan terbaca menempel ke avatar. */}
              <span aria-hidden className="h-6 w-px bg-line" />

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

          <button
            type="button"
            aria-label="Buka menu"
            aria-expanded={menuBuka}
            aria-controls="menu-utama"
            onClick={() => setMenuBuka((v) => !v)}
            className="rounded-md border border-line p-1.5 text-ink/80 transition-colors hover:border-navy-900 hover:text-navy-900 md:hidden"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Menu HP: tautan yang sama, ditumpuk di bawah bilah. Ditutup lewat
          onClick di <nav> (bubbling dari tautan yang ditekan), bukan efek
          yang mengintai rute — pola yang sama dengan drawer VendorLayout. */}
      {menuBuka && (
        <nav
          id="menu-utama"
          onClick={() => setMenuBuka(false)}
          className="border-t border-line bg-cream px-4 py-2 sm:px-6 md:hidden"
        >
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `block rounded px-2 py-3 text-[15px] ${
                  isActive ? 'font-medium text-ink' : 'text-ink/80'
                }`
              }
            >
              {l.label}
              {lencana(l.lencana)}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}
