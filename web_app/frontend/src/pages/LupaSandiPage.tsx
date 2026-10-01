import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout, { inputClass } from '../components/AuthLayout'
import { post } from '../lib/api'

/** Lupa kata sandi (migrasi 022): email -> kode 6 digit -> sandi baru.
 *
 *  Satu halaman untuk pelanggan, vendor, dan admin — akunnya satu tabel, jadi
 *  yang berbeda cuma halaman masuk tujuan kembalinya (?dari=vendor|admin).
 *
 *  Server SELALU membalas "kalau email itu terdaftar, kode sudah dikirim",
 *  terdaftar atau tidak, supaya halaman ini tidak bisa dipakai mengecek email
 *  mana yang punya akun. Sesudah berhasil, semua sesi di perangkat lain
 *  dikeluarkan server. */
const MASUK: Record<string, string> = { vendor: '/vendor/masuk', admin: '/admin/masuk' }

export default function LupaSandiPage() {
  const dari = new URLSearchParams(window.location.search).get('dari') ?? ''
  const halamanMasuk = MASUK[dari] ?? '/masuk'

  const [email, setEmail] = useState('')
  const [tiket, setTiket] = useState('')
  const [info, setInfo] = useState('')
  const [kode, setKode] = useState('')
  const [sandi, setSandi] = useState({ baru: '', ulang: '' })
  const [galat, setGalat] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [selesai, setSelesai] = useState(false)

  async function mintaKode(e: React.FormEvent) {
    e.preventDefault()
    setGalat('')
    setSibuk(true)
    try {
      const r = await post<{ tiket: string; message: string }>('/auth/lupa-sandi', { email })
      setTiket(r.tiket)
      setInfo(r.message)
    } catch (err) {
      setGalat((err as Error).message)
    } finally {
      setSibuk(false)
    }
  }

  async function aturUlang(e: React.FormEvent) {
    e.preventDefault()
    setGalat('')
    // Dicek di sini, bukan di backend: salah ketik sandi baru = terkunci dari
    // akun sendiri, dan backend tidak punya cara mendeteksinya.
    if (sandi.baru !== sandi.ulang) return setGalat('Konfirmasi sandi tidak sama dengan sandi baru.')
    setSibuk(true)
    try {
      await post('/auth/reset-sandi', { tiket, kode, sandi_baru: sandi.baru })
      setSelesai(true)
    } catch (err) {
      setGalat((err as Error).message)
    } finally {
      setSibuk(false)
    }
  }

  const label = 'block text-[12px] font-semibold tracking-[0.08em] text-navy-900'

  return (
    <AuthLayout
      image="/img/auth-login.jpg"
      imageAlt="Resepsi formal di ballroom"
      body="Atur ulang kata sandi Anda dengan kode yang kami kirim ke email terdaftar."
      panelClass="bg-[#f7f8fb]"
    >
      <h1 className="font-display text-[32px] leading-tight font-semibold text-navy-900">
        Lupa Kata Sandi
      </h1>

      {selesai ? (
        <>
          <p role="status" className="mt-6 rounded bg-lavender px-4 py-3 text-[14px] text-navy-900">
            Kata sandi sudah diganti. Semua sesi di perangkat lain ikut dikeluarkan.
          </p>
          <Link
            to={halamanMasuk}
            className="mt-6 flex h-11 w-full items-center justify-center rounded bg-navy-900 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Masuk dengan sandi baru
          </Link>
        </>
      ) : !tiket ? (
        <form onSubmit={mintaKode} className="mt-7">
          <p className="text-[14px] text-muted">Masukkan email akun Anda. Kami kirim kode 6 digit ke sana.</p>
          <label htmlFor="email" className={`mt-6 ${label}`}>ALAMAT EMAIL</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className={`mt-2.5 ${inputClass}`}
          />
          {galat && <p role="alert" className="mt-4 text-[14px] text-maroon">{galat}</p>}
          <button
            type="submit"
            disabled={sibuk}
            className="mt-7 h-11 w-full rounded bg-navy-900 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {sibuk ? 'Mengirim…' : 'Kirim Kode'}
          </button>
        </form>
      ) : (
        <form onSubmit={aturUlang} className="mt-7">
          <p role="status" className="rounded bg-lavender px-4 py-3 text-[14px] text-navy-900">{info}</p>

          <label htmlFor="kode" className={`mt-5 ${label}`}>KODE VERIFIKASI</label>
          <input
            id="kode"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            pattern="\d{6}"
            maxLength={6}
            value={kode}
            onChange={(e) => setKode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className={`mt-2.5 ${inputClass} text-center font-mono tracking-[0.5em]`}
          />

          <label htmlFor="sandi_baru" className={`mt-5 ${label}`}>KATA SANDI BARU</label>
          <input
            id="sandi_baru"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={sandi.baru}
            onChange={(e) => setSandi((s) => ({ ...s, baru: e.target.value }))}
            className={`mt-2.5 ${inputClass}`}
          />
          <p className="mt-1 text-[12px] text-muted">Minimal 8 karakter.</p>

          <label htmlFor="sandi_ulang" className={`mt-4 ${label}`}>ULANGI SANDI BARU</label>
          <input
            id="sandi_ulang"
            type="password"
            required
            autoComplete="new-password"
            value={sandi.ulang}
            onChange={(e) => setSandi((s) => ({ ...s, ulang: e.target.value }))}
            className={`mt-2.5 ${inputClass}`}
          />

          {galat && <p role="alert" className="mt-4 text-[14px] text-maroon">{galat}</p>}

          <button
            type="submit"
            disabled={sibuk || kode.length !== 6}
            className="mt-7 h-11 w-full rounded bg-navy-900 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {sibuk ? 'Menyimpan…' : 'Atur Ulang Kata Sandi'}
          </button>
          <p className="mt-4 text-center text-[13px] text-muted">
            Belum menerima kode? Cek folder spam, atau{' '}
            <button
              type="button"
              onClick={() => { setTiket(''); setKode(''); setGalat('') }}
              className="font-semibold text-navy-900 underline underline-offset-4"
            >
              kirim ulang
            </button>
            .
          </p>
        </form>
      )}

      <p className="mt-8 text-center text-[14px] text-ink">
        Ingat sandinya?{' '}
        <Link to={halamanMasuk} className="ml-1 font-semibold text-[#2e6b52] hover:underline">
          Kembali masuk
        </Link>
      </p>
    </AuthLayout>
  )
}
