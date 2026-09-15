import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { inputClass } from '../components/AuthLayout'
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon, HelpIcon, NoteIcon } from '../components/icons'
import { post, saveAuth, clearAuth, type AuthResponse } from '../lib/api'

/** Masuk ke workspace vendor. Endpointnya sama persis dengan /masuk
 *  (POST /auth/login) — yang beda cuma pintunya: akun customer ditolak di
 *  sini supaya tidak mendarat di dashboard kosong. */
export default function VendorLoginPage() {
  const navigate = useNavigate()
  const [lihatSandi, setLihatSandi] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const form = new FormData(e.currentTarget)
    try {
      const auth = await post<AuthResponse>('/auth/login', {
        email: form.get('email'),
        password: form.get('password'),
      })

      // Pengecekan role di browser cuma soal pengalaman, bukan keamanan:
      // backend tetap menolak endpoint vendor lewat requireRole.
      if (auth.user.role !== 'vendor_owner') {
        clearAuth()
        setError('Akun ini bukan akun vendor. Masuk lewat halaman pelanggan.')
        return
      }

      saveAuth(auth)
      navigate('/vendor')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-[440px] rounded-lg border border-line bg-white px-8 py-10 sm:px-11">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-lavender">
          {/* ponytail: PNG 31x27 dari Figma, dipasang apa adanya. Di layar
              retina dia mulai buram kalau diperbesar lewat 24px — ganti ke
              SVG inline di icons.tsx kalau nanti butuh lebih besar atau butuh
              ikut warna teks. */}
          <img src="/img/icon-vendor.png" alt="" width={22} height={19} />
        </div>

        <h1 className="mt-6 text-center font-display text-[30px] font-semibold text-navy-900">
          Vendor Workspace
        </h1>
        <p className="mt-2 text-center text-[14px] leading-relaxed text-muted">
          Masuk untuk mengelola layanan, pemesanan, dan portofolio Anda di Festa Festum.
        </p>

        <form onSubmit={handleSubmit} className="mt-8">
          <label htmlFor="email" className="block text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
            Email Bisnis
          </label>
          <div className="relative mt-2">
            <MailIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink/40" />
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="nama@perusahaan.com"
              className={`${inputClass} pl-10`}
            />
          </div>

          <div className="mt-5 flex items-baseline justify-between">
            <label htmlFor="password" className="text-[12px] font-semibold tracking-wide text-navy-900 uppercase">
              Kata Sandi
            </label>
            {/* Reset password belum ada endpointnya — tombolnya dimatikan,
                bukan ditaruh sebagai link bohong. */}
            <button
              type="button"
              disabled
              title="Reset kata sandi belum tersedia"
              className="text-[13px] font-semibold text-amber disabled:opacity-60"
            >
              Lupa Kata Sandi?
            </button>
          </div>
          <div className="relative mt-2">
            <LockIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink/40" />
            <input
              id="password"
              name="password"
              type={lihatSandi ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className={`${inputClass} pr-11 pl-10`}
            />
            <button
              type="button"
              onClick={() => setLihatSandi((v) => !v)}
              aria-label={lihatSandi ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-ink/45"
            >
              {lihatSandi ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>

          {error && (
            <p role="alert" className="mt-5 text-[14px] text-maroon">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-7 h-12 w-full rounded bg-navy-900 text-[13px] font-semibold tracking-wide text-white uppercase transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading ? 'Memproses…' : 'Masuk ke Workspace'}
          </button>
        </form>

        <p className="mt-8 border-t border-line pt-6 text-center text-[14px] text-ink">
          Belum menjadi mitra Festa?{' '}
          <Link to="/vendor/daftar" className="font-semibold hover:underline">
            Daftar sebagai Vendor
          </Link>
        </p>
      </div>

      <div className="mt-10 text-center text-[13px] text-muted">
        <p className="font-semibold text-navy-900">Butuh Bantuan Teknis?</p>
        <p className="mt-3 flex items-center justify-center gap-4">
          <span className="flex items-center gap-2">
            <HelpIcon className="h-4 w-4" /> Hubungi Support
          </span>
          <span className="h-4 w-px bg-line" />
          <span className="flex items-center gap-2">
            <NoteIcon className="h-4 w-4" /> Panduan Vendor
          </span>
        </p>
        <p className="mt-6 text-[12px] text-muted/80">
          © 2026 Festa Festum. Secure Escrow Protected.
        </p>
      </div>
    </div>
  )
}
