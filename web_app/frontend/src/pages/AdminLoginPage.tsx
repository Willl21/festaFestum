import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout, { inputClass } from '../components/AuthLayout'
import { EyeIcon, EyeOffIcon, ShieldIcon } from '../components/icons'
import LangkahKode from '../components/LangkahKode'
import { post, saveAuth, clearAuth, pesanSesiHabis, type AuthResponse, type TantanganKode } from '../lib/api'

/** Masuk ke Pusat Kendali admin.
 *
 *  Memakai <AuthLayout> sama seperti halaman masuk/daftar lainnya. Dulu
 *  halaman ini punya tata letak sendiri (latar navy gelap, kartu 420px)
 *  yang mengikuti sidebar halaman admin — bagus sendirian, tapi membuatnya
 *  jadi satu-satunya halaman masuk yang bentuknya beda.
 *
 *  SENGAJA TIDAK ADA PENDAFTARAN: akun admin dibuat langsung di database.
 *  Backend juga menutup jalurnya — POST /auth/register hanya menerima
 *  'customer' dan 'vendor_owner' (ALLOWED_SELF_REGISTER_ROLES), peran lain
 *  diturunkan jadi customer. Jadi tidak ada cara mendaftar jadi admin
 *  lewat API, dan halaman ini tidak perlu menutup celah apa pun. */
export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [lihatSandi, setLihatSandi] = useState(false)
  // Nilai awalnya terisi kalau kita sendiri yang melempar orang ini ke sini
  // karena sesinya kedaluwarsa (?sesi=habis).
  const [error, setError] = useState(pesanSesiHabis())
  const [loading, setLoading] = useState(false)
  const [tantangan, setTantangan] = useState<TantanganKode | null>(null)

  function selesai(auth: AuthResponse) {
    // Penjaga di browser cuma soal pengalaman; endpoint /admin/* tetap
    // dijaga requireRole('admin') di backend.
    if (auth.user.role !== 'admin') {
      clearAuth()
      setTantangan(null)
      setError('Akun ini tidak punya akses Pusat Kendali.')
      return
    }
    saveAuth(auth)
    navigate('/admin')
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const form = new FormData(e.currentTarget)
    try {
      const r = await post<AuthResponse | TantanganKode>('/auth/login', {
        email: form.get('email'),
        password: form.get('password'),
      })
      // Admin SELALU lewat langkah kode (2FA wajib, migrasi 022).
      if ('butuh_kode' in r) return setTantangan(r)
      selesai(r)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      image="/img/auth-login.jpg"
      imageAlt="Ballroom acara formal"
      body="Konsol internal untuk kurasi vendor, rekening bersama, dan registri akun."
    >
      <p className="font-display text-[22px] font-semibold text-navy-900">Festa Festum</p>
      <p className="mt-1 text-[11px] tracking-[0.18em] text-amber uppercase">Pusat Kendali</p>

      <h1 className="mt-4 font-display text-[26px] font-semibold text-navy-900">
        Masuk Pusat Kendali
      </h1>

      {tantangan ? (
        <LangkahKode tantangan={tantangan} onMasuk={selesai} onBatal={() => setTantangan(null)} />
      ) : (
        <form onSubmit={handleSubmit} className="mt-6">
          <div className="mb-4">
            <label htmlFor="email" className="block text-[13px] font-semibold text-navy-900">
              Email Admin
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="admin@festafestum.id"
              className={`mt-2 ${inputClass}`}
            />
          </div>
  
          <div className="mb-4">
            <div className="flex items-baseline justify-between">
              <label htmlFor="password" className="block text-[13px] font-semibold text-navy-900">
                Kata Sandi
              </label>
              <Link to="/lupa-sandi?dari=admin" className="text-[12px] font-semibold text-navy-900/70 hover:underline">
                Lupa kata sandi?
              </Link>
            </div>
            <div className="relative mt-2">
              <input
                id="password"
                name="password"
                type={lihatSandi ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className={`${inputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setLihatSandi((v) => !v)}
                aria-label={lihatSandi ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-ink/45 transition-colors hover:text-ink"
              >
                {lihatSandi ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </button>
            </div>
          </div>
  
          {error && (
            <p role="alert" className="mb-4 text-[14px] text-maroon">
              {error}
            </p>
          )}
  
          <button
            type="submit"
            disabled={loading}
            className="mt-2 h-11 w-full rounded bg-ink text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading ? 'Memeriksa…' : 'Masuk Pusat Kendali'}
          </button>
        </form>
      )}

      <p className="mt-5 flex gap-2 border-t border-line pt-5 text-[12px] leading-relaxed text-muted">
        <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
        Akun Pusat Kendali dibuat langsung oleh tim internal — tidak ada pendaftaran mandiri.
      </p>
    </AuthLayout>
  )
}
