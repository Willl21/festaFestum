import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { inputClass } from '../components/AuthLayout'
import {
  ArrowRight,
  BankIcon,
  BellIcon,
  CalendarIcon,
  LockIcon,
  MapPinIcon,
  CheckCircleIcon,
  InfoIcon,
  PhotoIcon,
  ShieldIcon,
  UserCircleIcon,
} from '../components/icons'
import { get, getToken, kirim, simpanUser } from '../lib/api'
import { AVATAR, kecilkanGambar } from '../lib/gambar'

/** Pengaturan profil pelanggan. Semua field di sini persis kolom yang
 *  diizinkan backend di PATCH /auth/me — tidak ada yang cuma hidup di state.
 *
 *  Satu-satunya yang keluar dari pola itu adalah ganti sandi: dia butuh sandi
 *  lama sebagai bukti, jadi endpointnya sendiri (PATCH /auth/password) dan
 *  tombolnya type="button" supaya tidak ikut menyubmit form profil.
 *
 *  Rekening bank cuma disimpan, tidak dipakai mentransfer apa pun: pengembalian
 *  dana dan payout tetap dikerjakan manual di luar sistem (lihat migrasi 005). */

type Profil = {
  user_id: string
  name: string
  full_name: string | null
  email: string
  phone: string | null
  birth_date: string | null
  shipping_address: string | null
  shipping_note: string | null
  avatar_url: string | null
  is_verified: boolean
  verified_at: string | null
  notification_prefs: Record<string, boolean> | null
  bank_name: string | null
  bank_account_number: string | null
  bank_account_holder: string | null
  role: string
  created_at: string
}

const notifikasi = [
  { key: 'pengingat_jadwal', judul: 'Pengingat Jadwal Acara (H-7 & H-1)', catatan: 'Briefing final vendor, jadwal gladi resik, dan checklist katering.' },
  { key: 'status_pembayaran', judul: 'Status Pembayaran & Tagihan Vendor', catatan: 'Pemberitahuan saat pembayaran diverifikasi atau tagihan termin diterbitkan.' },
  { key: 'chat_vendor', judul: 'Chat Langsung dari Vendor Resmi', catatan: 'Pesan instan via WhatsApp dari fotografer & wedding organizer.' },
  { key: 'promo_ai', judul: 'Promo & Rekomendasi Vendor AI', catatan: 'Penawaran kurasi musiman dari vendor wedding & corporate.' },
]

/** Kodenya harus sama persis dengan BANK_CODES di auth.controller.js — backend
 *  yang memutuskan sah atau tidak, daftar di sini cuma untuk label dan dropdown. */
const BANKS: Record<string, string> = {
  bca: 'PT Bank Central Asia Tbk',
  bni: 'PT Bank Negara Indonesia Tbk',
  bri: 'PT Bank Rakyat Indonesia Tbk',
  mandiri: 'PT Bank Mandiri Tbk',
  bsi: 'PT Bank Syariah Indonesia Tbk',
  cimb: 'PT Bank CIMB Niaga Tbk',
  permata: 'PT Bank Permata Tbk',
  danamon: 'PT Bank Danamon Indonesia Tbk',
  btn: 'PT Bank Tabungan Negara Tbk',
  panin: 'PT Bank Panin Tbk',
  ocbc: 'PT Bank OCBC NISP Tbk',
  maybank: 'PT Bank Maybank Indonesia Tbk',
  jago: 'PT Bank Jago Tbk',
}

/** Empat digit depan dan belakang saja — cukup untuk pemilik mengenali
 *  rekeningnya sendiri tanpa memampang nomor penuh di layar. */
const samarkanRekening = (n: string) =>
  n.length <= 8 ? n : `${n.slice(0, 4)} •••• •••• ${n.slice(-4)}`

/** Menu sidebar mengikuti mockup. Yang `href`-nya null belum punya halaman
 *  maupun kolom DB (2FA, rekening pribadi, privasi) — ditampilkan mati
 *  bertanda "Segera" supaya tidak jadi tautan bohong saat demo. */
const menu = [
  { label: 'Informasi Pribadi & Biodata', icon: UserCircleIcon, href: '#biodata' },
  { label: 'Keamanan Akun & Kata Sandi', icon: LockIcon, href: '#keamanan' },
  { label: 'Rekening Bank & Kartu', icon: BankIcon, href: '#rekening' },
  { label: 'Pengaturan Notifikasi', icon: BellIcon, href: '#notifikasi' },
  { label: 'Alamat Pengiriman Tersimpan', icon: MapPinIcon, href: '#alamat' },
  { label: 'Privasi & Kebijakan Data', icon: ShieldIcon, href: null },
]

const bulanId = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

export default function ProfilPage() {
  const masuk = Boolean(getToken())

  const [profil, setProfil] = useState<Profil | null>(null)
  const [prefs, setPrefs] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const [pesan, setPesan] = useState('')
  const [loading, setLoading] = useState(false)
  const [aktif, setAktif] = useState('#biodata')
  const [avatar, setAvatar] = useState<string | null>(null)
  // Rekening yang sudah tersimpan ditampilkan sebagai kartu, bukan form, supaya
  // nomornya tidak terpampang penuh setiap kali halaman dibuka.
  const [ubahRekening, setUbahRekening] = useState(false)

  // Ganti sandi punya endpoint, tombol, dan pesannya sendiri — tidak nebeng
  // state form profil supaya dua pesan sukses tidak saling menimpa.
  const [sandi, setSandi] = useState({ lama: '', baru: '', ulang: '' })
  const [sandiError, setSandiError] = useState('')
  const [sandiPesan, setSandiPesan] = useState('')
  const [sandiLoading, setSandiLoading] = useState(false)

  useEffect(() => {
    if (!masuk) return
    get<{ user: Profil }>('/auth/me')
      .then(({ user }) => {
        setProfil(user)
        setPrefs(user.notification_prefs ?? {})
        setAvatar(user.avatar_url)
        setUbahRekening(!user.bank_name)
      })
      .catch((err) => setError((err as Error).message))
  }, [masuk])

  async function pilihFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // supaya memilih berkas yang sama lagi tetap memicu onChange
    if (!file) return
    setError('')
    try {
      setAvatar(await kecilkanGambar(file, ...AVATAR))
      setPesan('Foto siap — tekan Simpan Perubahan.')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function gantiSandi() {
    setSandiError('')
    setSandiPesan('')

    // Konfirmasi dicek di sini, bukan di backend: salah ketik sandi baru berarti
    // terkunci dari akun sendiri, dan backend tidak punya cara mendeteksinya.
    if (sandi.baru !== sandi.ulang) {
      return setSandiError('Konfirmasi sandi tidak sama dengan sandi baru.')
    }

    setSandiLoading(true)
    try {
      await kirim<{ message: string }>('/auth/password', 'PATCH', {
        current_password: sandi.lama,
        new_password: sandi.baru,
      })
      setSandi({ lama: '', baru: '', ulang: '' })
      setSandiPesan('Sandi berhasil diganti. Sesi di perangkat lain belum otomatis keluar.')
    } catch (err) {
      setSandiError((err as Error).message)
    } finally {
      setSandiLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setPesan('')
    setLoading(true)

    const form = new FormData(e.currentTarget)
    try {
      const { user } = await kirim<{ user: Profil }>('/auth/me', 'PATCH', {
        full_name: form.get('full_name'),
        name: form.get('name'),
        phone: form.get('phone'),
        birth_date: form.get('birth_date') || '',
        shipping_address: form.get('shipping_address'),
        shipping_note: form.get('shipping_note'),
        notification_prefs: prefs,
        avatar_url: avatar ?? '',
        // Kalau kartu rekening sedang tertutup, field-nya tidak ada di DOM dan
        // form.get() mengembalikan null — backend akan membacanya sebagai
        // "cabut rekening" dan menghapus data yang tidak diapa-apakan user.
        ...(ubahRekening
          ? {
              bank_name: form.get('bank_name'),
              bank_account_number: form.get('bank_account_number'),
              bank_account_holder: form.get('bank_account_holder'),
            }
          : {}),
      })
      setProfil(user)
      setUbahRekening(!user.bank_name)
      // Navbar membaca identitasnya dari localStorage, bukan dari GET /auth/me.
      simpanUser({
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
      })
      setPesan('Perubahan tersimpan.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (!masuk) {
    return (
      <div className="mx-auto max-w-[1330px] px-6 pt-12 pb-20 md:px-12">
        <div className="mx-auto mt-10 max-w-[520px] rounded-sm border border-line bg-white px-8 py-12 text-center">
          <h1 className="font-display text-[30px] font-semibold">Masuk dulu, ya</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink/75">
            Halaman profil berisi data pribadi yang terikat ke akun Anda — alamat pengiriman,
            kontak, dan preferensi pemberitahuan.
          </p>
          <Link
            to="/masuk"
            className="mt-7 inline-flex h-11 items-center rounded bg-navy-900 px-8 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Masuk
          </Link>
        </div>
      </div>
    )
  }

  if (!profil) {
    return (
      <div className="mx-auto max-w-[1330px] px-6 py-20 md:px-12">
        <p className="text-[15px] text-muted">{error || 'Memuat profil…'}</p>
      </div>
    )
  }

  const bergabung = new Date(profil.created_at)
  const inisial = (profil.name || profil.email).slice(0, 1).toUpperCase()

  return (
    <div className="mx-auto max-w-[1330px] px-6 pt-10 pb-20 md:px-12">
      <p className="text-[12px] tracking-wide text-muted uppercase">
        Akun Pengguna <span className="mx-2">›</span>
        <span className="font-semibold text-navy-900">Pengaturan Profil</span>
      </p>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="h-fit space-y-4">
          <div className="rounded-lg border border-line bg-white p-6 text-center">
            <div className="relative mx-auto h-[92px] w-[92px]">
              {avatar ? (
                <img
                  src={avatar}
                  alt={`Foto profil ${profil.name}`}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-lavender font-display text-[34px] font-semibold text-navy-900">
                  {inisial}
                </div>
              )}
              <label
                htmlFor="foto"
                title="Ganti foto profil"
                className="absolute right-0 bottom-0 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-navy-900 text-white"
              >
                <PhotoIcon className="h-3.5 w-3.5" />
                <span className="sr-only">Ganti foto profil</span>
              </label>
              <input
                id="foto"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={pilihFoto}
                className="hidden"
              />
            </div>
            <p className="mt-4 font-display text-[20px] font-semibold text-navy-900">
              {profil.full_name || profil.name}
            </p>
            <p className="mt-1 text-[13px] text-muted">{profil.email}</p>

            {profil.is_verified ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-navy-900 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-white uppercase">
                <CheckCircleIcon className="h-3.5 w-3.5 text-amber" />
                Pengguna Terverifikasi
              </p>
            ) : (
              <p
                title="Verifikasi dilakukan admin Festa Festum"
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[11px] font-semibold tracking-wide text-ink/45 uppercase"
              >
                Belum Terverifikasi
              </p>
            )}

            <p className="mt-5 flex items-center justify-between border-t border-line pt-4 text-[12px] tracking-wide text-muted uppercase">
              <span className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                Bergabung
              </span>
              <span className="font-semibold text-navy-900 normal-case">
                {bulanId[bergabung.getMonth()]} {bergabung.getFullYear()}
              </span>
            </p>
          </div>

          <nav className="rounded-lg border border-line bg-white p-2">
            {menu.map((m) =>
              m.href ? (
                <a
                  key={m.label}
                  href={m.href}
                  onClick={() => setAktif(m.href!)}
                  className={`flex items-center gap-3 rounded px-4 py-3 text-[14px] ${
                    aktif === m.href
                      ? 'bg-navy-900 font-semibold text-white'
                      : 'text-ink/80 hover:bg-cream'
                  }`}
                >
                  <m.icon className={`h-4 w-4 shrink-0 ${aktif === m.href ? 'text-amber' : 'text-ink/50'}`} />
                  <span className="flex-1 text-left">{m.label}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 opacity-60" />
                </a>
              ) : (
                <span
                  key={m.label}
                  title="Belum tersedia"
                  className="flex cursor-not-allowed items-center gap-3 rounded px-4 py-3 text-[14px] text-ink/35"
                >
                  <m.icon className="h-4 w-4 shrink-0 text-ink/25" />
                  <span className="flex-1 text-left">{m.label}</span>
                  <span className="text-[11px] tracking-wide uppercase">Segera</span>
                </span>
              ),
            )}
          </nav>

          <div className="flex gap-3 rounded-lg border border-lavender bg-lavender/40 p-4 text-left">
            <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
            <div>
              <p className="text-[13px] font-semibold text-navy-900">Jaminan Layanan Resmi</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink/75">
                Setiap transaksi Anda dilindungi perjanjian kemitraan dengan vendor terverifikasi.
              </p>
            </div>
          </div>
        </aside>

        <div className="space-y-6">
          <section id="biodata" className="scroll-mt-6 rounded-lg border border-line bg-white p-7">
            <h1 className="font-display text-[26px] font-semibold text-navy-900">
              Informasi Pribadi &amp; Biodata
            </h1>
            <p className="mt-2 text-[14px] text-muted">
              Kelola identitas resmi Anda untuk kontrak vendor, konfirmasi acara, dan transaksi
              pemesanan.
            </p>

            <h2 className="mt-7 flex items-center gap-2 text-[17px] font-semibold text-navy-900">
              <UserCircleIcon className="h-5 w-5 text-amber" />
              Biodata &amp; Verifikasi Kontak
            </h2>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="full_name" className="block text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
                  Nama Lengkap (sesuai KTP)
                </label>
                <input
                  id="full_name"
                  name="full_name"
                  defaultValue={profil.full_name ?? ''}
                  className={`mt-2 ${inputClass}`}
                />
                <p className="mt-1 text-[12px] text-muted">Dipakai di kontrak resmi vendor.</p>
              </div>

              <div>
                <label htmlFor="name" className="block text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
                  Nama Panggilan / Display
                </label>
                <input id="name" name="name" required defaultValue={profil.name} className={`mt-2 ${inputClass}`} />
                <p className="mt-1 text-[12px] text-muted">Ditampilkan di pesanan dan navbar.</p>
              </div>

              <div>
                <label htmlFor="email" className="block text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
                  Alamat Email Utama
                </label>
                <div className="relative mt-2">
                  <input
                    id="email"
                    value={profil.email}
                    readOnly
                    className={`${inputClass} cursor-not-allowed bg-cream pr-10`}
                  />
                  <LockIcon className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-ink/40" />
                </div>
                <p className="mt-1 text-[12px] text-muted">
                  Email dipakai untuk masuk, jadi belum bisa diubah sendiri.
                </p>
              </div>

              <div>
                <label htmlFor="birth_date" className="block text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
                  Tanggal Lahir
                </label>
                <input
                  id="birth_date"
                  name="birth_date"
                  type="date"
                  defaultValue={profil.birth_date?.slice(0, 10) ?? ''}
                  className={`mt-2 ${inputClass}`}
                />
              </div>
            </div>

            <div className="mt-6 rounded border border-lavender bg-lavender/40 p-5">
              <p className="text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
                Nomor WhatsApp Resmi
              </p>
              <p className="mt-1 text-[13px] text-ink/80">
                Digunakan untuk konfirmasi darurat hari H dan verifikasi keamanan pemesanan.
              </p>
              <input
                name="phone"
                type="tel"
                required
                defaultValue={profil.phone ?? ''}
                placeholder="0812-3456-7890"
                className={`mt-3 ${inputClass}`}
              />
            </div>
          </section>

          <section id="keamanan" className="scroll-mt-6 rounded-lg border border-line bg-white p-7">
            <h2 className="flex items-center gap-2 text-[17px] font-semibold text-navy-900">
              <LockIcon className="h-5 w-5 text-amber" />
              Keamanan Akun &amp; Kata Sandi
            </h2>
            <p className="mt-2 text-[14px] text-muted">
              Ganti sandi secara berkala, terutama kalau Anda pernah masuk dari perangkat bersama.
            </p>

            {/* Enter di kolom sandi kalau dibiarkan akan menyubmit form profil di
                luarnya — dibelokkan ke tombol yang benar. */}
            <div
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                if (!sandiLoading) void gantiSandi()
              }}
              className="mt-5 grid gap-5 sm:grid-cols-2"
            >
              <div className="sm:col-span-2">
                <label htmlFor="sandi_lama" className="block text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
                  Sandi Saat Ini
                </label>
                <input
                  id="sandi_lama"
                  type="password"
                  autoComplete="current-password"
                  value={sandi.lama}
                  onChange={(e) => setSandi((v) => ({ ...v, lama: e.target.value }))}
                  className={`mt-2 ${inputClass}`}
                />
              </div>

              <div>
                <label htmlFor="sandi_baru" className="block text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
                  Sandi Baru
                </label>
                <input
                  id="sandi_baru"
                  type="password"
                  autoComplete="new-password"
                  value={sandi.baru}
                  onChange={(e) => setSandi((v) => ({ ...v, baru: e.target.value }))}
                  className={`mt-2 ${inputClass}`}
                />
                <p className="mt-1 text-[12px] text-muted">Minimal 8 karakter.</p>
              </div>

              <div>
                <label htmlFor="sandi_ulang" className="block text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
                  Ulangi Sandi Baru
                </label>
                <input
                  id="sandi_ulang"
                  type="password"
                  autoComplete="new-password"
                  value={sandi.ulang}
                  onChange={(e) => setSandi((v) => ({ ...v, ulang: e.target.value }))}
                  className={`mt-2 ${inputClass}`}
                />
              </div>
            </div>

            {sandiError && (
              <p role="alert" className="mt-4 text-[14px] text-maroon">
                {sandiError}
              </p>
            )}
            {sandiPesan && (
              <p className="mt-4 text-[14px] font-semibold text-[#2e6b52]">{sandiPesan}</p>
            )}

            <div className="mt-5 flex items-center justify-between gap-4 border-t border-line pt-5">
              <p className="text-[12px] leading-relaxed text-muted">
                Verifikasi dua langkah (2FA) belum tersedia.
              </p>
              <button
                type="button"
                onClick={gantiSandi}
                disabled={sandiLoading || !sandi.lama || !sandi.baru}
                className="h-11 shrink-0 rounded border border-navy-900 px-6 text-[14px] font-semibold text-navy-900 transition-opacity hover:opacity-80 disabled:opacity-40"
              >
                {sandiLoading ? 'Mengganti…' : 'Ganti Sandi'}
              </button>
            </div>
          </section>

          <section id="alamat" className="scroll-mt-6 rounded-lg border border-line bg-white p-7">
            <h2 className="flex items-center gap-2 text-[17px] font-semibold text-navy-900">
              <MapPinIcon className="h-5 w-5 text-amber" />
              Alamat Pengiriman &amp; Fitting
            </h2>
            <p className="mt-2 text-[14px] text-muted">
              Lokasi kurir untuk pengiriman mockup dekor, buket bunga, suvenir, serta jadwal fitting
              desainer.
            </p>

            <label htmlFor="shipping_address" className="mt-5 block text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
              Alamat Lengkap
            </label>
            <textarea
              id="shipping_address"
              name="shipping_address"
              rows={3}
              defaultValue={profil.shipping_address ?? ''}
              placeholder="Nama gedung, jalan, kelurahan, kota, kode pos"
              className="mt-2 w-full rounded border border-line bg-cream px-4 py-3 text-[14px] text-ink outline-none placeholder:text-ink/55 focus:border-navy-900"
            />

            <label htmlFor="shipping_note" className="mt-5 block text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
              Patokan / Catatan Kurir
            </label>
            <input
              id="shipping_note"
              name="shipping_note"
              defaultValue={profil.shipping_note ?? ''}
              placeholder="Misal: titipkan ke concierge lobi utara"
              className={`mt-2 ${inputClass}`}
            />
          </section>


          <section id="rekening" className="scroll-mt-6 rounded-lg border border-line bg-white p-7">
            <h2 className="flex items-center gap-2 text-[17px] font-semibold text-navy-900">
              <BankIcon className="h-5 w-5 text-amber" />
              Rekening Bank &amp; Pengembalian Dana
            </h2>
            <p className="mt-2 text-[14px] text-muted">
              Rekening terdaftar untuk penarikan saldo atau pencairan dana sesuai kebijakan
              pengembalian dana pembatalan.
            </p>

            {!ubahRekening && profil.bank_name ? (
              <div className="mt-5 flex items-center gap-5 rounded bg-navy-900 px-6 py-5 text-white">
                <span className="flex h-11 w-14 shrink-0 items-center justify-center rounded bg-white text-[13px] font-bold tracking-wide text-navy-900 uppercase">
                  {profil.bank_name}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[17px] font-semibold">
                    {BANKS[profil.bank_name] ?? profil.bank_name.toUpperCase()}
                  </p>
                  <p className="mt-0.5 font-mono text-[14px] tracking-widest text-white/70">
                    {samarkanRekening(profil.bank_account_number ?? '')}
                  </p>
                  <p className="mt-0.5 text-[12px] tracking-wide text-white/90 uppercase">
                    a.n {profil.bank_account_holder}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setUbahRekening(true)}
                  className="h-10 shrink-0 rounded bg-white px-5 text-[14px] font-semibold text-navy-900 transition-opacity hover:opacity-90"
                >
                  Ganti Rekening
                </button>
              </div>
            ) : (
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="bank_name" className="block text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
                    Nama Bank
                  </label>
                  <select
                    id="bank_name"
                    name="bank_name"
                    defaultValue={profil.bank_name ?? ''}
                    className={`mt-2 ${inputClass}`}
                  >
                    <option value="">— Pilih bank —</option>
                    {Object.entries(BANKS).map(([kode, nama]) => (
                      <option key={kode} value={kode}>
                        {nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="bank_account_number" className="block text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
                    Nomor Rekening
                  </label>
                  <input
                    id="bank_account_number"
                    name="bank_account_number"
                    inputMode="numeric"
                    maxLength={20}
                    defaultValue={profil.bank_account_number ?? ''}
                    placeholder="8271000012349402"
                    className={`mt-2 ${inputClass}`}
                  />
                  <p className="mt-1 text-[12px] text-muted">8-20 digit, tanpa spasi.</p>
                </div>

                <div>
                  <label htmlFor="bank_account_holder" className="block text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
                    Nama Pemilik Rekening
                  </label>
                  <input
                    id="bank_account_holder"
                    name="bank_account_holder"
                    maxLength={60}
                    defaultValue={profil.bank_account_holder ?? ''}
                    placeholder="CLARA VALERY SUDIBYO"
                    className={`mt-2 ${inputClass}`}
                  />
                </div>

                {profil.bank_name && (
                  <p className="text-[12px] text-muted sm:col-span-2">
                    Kosongkan ketiganya lalu simpan untuk mencabut rekening.
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 flex gap-3 rounded border border-line bg-cream p-4">
              <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink/50" />
              <p className="text-[12px] leading-relaxed text-ink/75">
                Nama pada rekening tujuan wajib sama persis dengan Kartu Identitas (KTP) demi
                mematuhi regulasi Anti-Money Laundering (AML) serta keamanan transaksi dan
                verifikasi pengembalian dana. Transfer dilakukan manual oleh admin, bukan otomatis
                oleh sistem pembayaran.
              </p>
            </div>
          </section>

          <section id="notifikasi" className="scroll-mt-6 rounded-lg border border-line bg-white p-7">
            <h2 className="text-[17px] font-semibold text-navy-900">
              Preferensi Notifikasi &amp; Peringatan Acara
            </h2>
            <p className="mt-2 text-[14px] text-muted">
              Kendalikan bagaimana kami dan para mitra vendor menghubungi Anda.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {notifikasi.map((n) => (
                <label
                  key={n.key}
                  htmlFor={n.key}
                  className="flex cursor-pointer gap-3 rounded border border-line bg-cream p-4"
                >
                  <input
                    id={n.key}
                    type="checkbox"
                    checked={prefs[n.key] ?? false}
                    onChange={(e) => setPrefs((p) => ({ ...p, [n.key]: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-navy-900"
                  />
                  <span>
                    <span className="block text-[14px] font-semibold text-navy-900">{n.judul}</span>
                    <span className="mt-1 block text-[12px] leading-relaxed text-muted">{n.catatan}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {error && (
            <p role="alert" className="text-[14px] text-maroon">
              {error}
            </p>
          )}
          {pesan && <p className="text-[14px] font-semibold text-[#2e6b52]">{pesan}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="h-11 rounded bg-amber px-8 text-[15px] font-semibold text-navy-900 transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? 'Menyimpan…' : 'Simpan Perubahan'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
