import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout, { inputClass } from '../components/AuthLayout'
import { EyeIcon, EyeOffIcon } from '../components/icons'
import TombolGoogle from '../components/TombolGoogle'
import { post, saveAuth, pesanSesiHabis, tujuanLanjut, type AuthResponse } from '../lib/api'

export default function LoginPage() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  // Nilai awalnya terisi kalau kita sendiri yang melempar orang ini ke sini
  // karena sesinya kedaluwarsa (?sesi=habis).
  const [error, setError] = useState(pesanSesiHabis())
  const [loading, setLoading] = useState(false)
  const lanjut = tujuanLanjut()
  // Penjelasan kenapa orang ini ada di sini: baru daftar (RegisterPage), atau
  // dilempar WajibMasuk dari halaman pesan. Bukan galat, jadi warnanya beda.
  const info = new URLSearchParams(window.location.search).get('terdaftar')
    ? 'Akun berhasil dibuat. Silakan masuk untuk melanjutkan.'
    : lanjut ? 'Masuk dulu untuk melanjutkan.' : ''

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
      saveAuth(auth)
      navigate(lanjut ?? '/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      image="/img/auth-login.jpg"
      imageAlt="Resepsi formal di ballroom"
      body="Welcome back to Festa Festum. Access your high-trust event orchestration dashboard and continue planning with confidence."
      panelClass="bg-[#f7f8fb]"
    >
      <h1 className="font-display text-[32px] leading-tight font-semibold text-navy-900">
        Selamat Datang Kembali
      </h1>
      <p className="mt-2 text-[14px] text-muted">Silakan masukkan detail Anda untuk masuk.</p>
      {info && !error && (
        <p role="status" className="mt-4 rounded bg-lavender px-4 py-3 text-[14px] text-navy-900">
          {info}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-7">
        <label htmlFor="email" className="block text-[12px] font-semibold tracking-[0.08em] text-navy-900">
          ALAMAT EMAIL
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="name@example.com"
          className={`mt-2.5 ${inputClass}`}
        />

        <div className="mt-5 flex items-baseline justify-between">
          <label htmlFor="password" className="text-[12px] font-semibold tracking-[0.08em] text-navy-900">
            KATA SANDI
          </label>
          {/* Belum ada endpoint reset password di backend. */}
          <span className="text-[13px] font-semibold text-navy-900/70">Lupa kata sandi?</span>
        </div>
        <div className="relative mt-2.5">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className={`${inputClass} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink/45 hover:text-ink"
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-[14px] text-maroon">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-7 h-11 w-full rounded bg-navy-900 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? 'Memproses…' : 'Masuk'}
        </button>
      </form>

      <div className="mt-7 flex items-center gap-4">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[11px] font-semibold tracking-[0.12em] text-muted">ATAU LANJUTKAN DENGAN</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="mt-5">
        <TombolGoogle teks="signin_with" />
      </div>

      <p className="mt-7 text-center text-[14px] text-ink">
        Belum punya akun?{' '}
        <Link to={lanjut ? `/daftar?lanjut=${encodeURIComponent(lanjut)}` : '/daftar'} className="ml-1 text-[13px] font-semibold tracking-[0.1em] text-[#2e6b52] hover:underline">
          DAFTAR
        </Link>
      </p>

      <p className="mt-7 text-center text-[11px] tracking-[0.06em] text-muted">
        BY SIGNING IN, YOU AGREE TO OUR TERMS OF SERVICE & PRIVACY POLICY.
      </p>
    </AuthLayout>
  )
}
