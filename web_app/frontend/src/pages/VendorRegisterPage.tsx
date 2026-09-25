import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout, { inputClass } from '../components/AuthLayout'
import { ShieldIcon } from '../components/icons'
import { categories } from '../data/categories'
import { post, saveAuth, type AuthResponse, type ApiVendor } from '../lib/api'

/** Langkah 1 onboarding vendor: bikin akun (role vendor_owner) lalu profil
 *  vendornya. Dua request berurutan karena backend memang memisahkan users
 *  dan vendors — akun dulu, profil bisnis menyusul.
 *
 *  Kategori layanan TIDAK tersimpan di sini: kolom `category` ada di tabel
 *  services, bukan vendors (keputusan desain — satu vendor boleh lintas
 *  kategori). Pilihannya dititipkan ke halaman onboarding lewat navigate
 *  state, dan di sana jadi layanan pertama vendor.
 *
 *  Tata letaknya memakai <AuthLayout>, sama persis dengan halaman daftar
 *  user: dulu halaman ini punya layout sendiri (layar penuh, panel kiri
 *  separuh, judul 44px) sehingga terasa seperti aplikasi yang berbeda. */
const isian = [
  {
    name: 'business_name',
    label: 'Nama Perusahaan',
    type: 'text',
    placeholder: 'Misal: Elegance Florist',
    autoComplete: 'organization',
  },
  {
    name: 'name',
    label: 'Nama Penanggung Jawab',
    type: 'text',
    placeholder: 'Nama lengkap Anda',
    autoComplete: 'name',
  },
  {
    name: 'email',
    label: 'Email Bisnis',
    type: 'email',
    placeholder: 'kontak@bisnis.com',
    autoComplete: 'email',
  },
  {
    name: 'phone',
    label: 'Nomor WhatsApp',
    type: 'tel',
    placeholder: '0812-3456-7890',
    autoComplete: 'tel',
  },
  {
    name: 'password',
    label: 'Kata Sandi',
    type: 'password',
    placeholder: 'Minimal 8 karakter',
    autoComplete: 'new-password',
  },
]

export default function VendorRegisterPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const form = new FormData(e.currentTarget)
    try {
      const auth = await post<AuthResponse>('/auth/register', {
        name: form.get('name'),
        email: form.get('email'),
        phone: form.get('phone'),
        password: form.get('password'),
        role: 'vendor_owner',
      })
      saveAuth(auth)

      const { vendor } = await post<{ vendor: ApiVendor }>('/vendors', {
        business_name: form.get('business_name'),
      })

      // Langkah 2 (dokumen) lalu langkah 3 (profil), mengikuti urutan mockup.
      navigate('/vendor/dokumen', {
        state: { vendorId: vendor.vendor_id, category: form.get('category') },
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      image="/img/auth-register.jpg"
      imageAlt="Rangkaian bunga di ballroom klasik"
      body="Raih klien high-end dan kelola pemesanan dengan aman melalui perlindungan escrow Festa Festum."
      // Enam field bertumpuk di kolom 360px bikin kartunya kepanjangan sampai
      // perlu di-scroll. Dilebarkan supaya muat dua kolom.
      isiClass="max-w-[420px]"
    >
      <p className="font-display text-[22px] font-semibold text-navy-900">
        Festa <span className="text-amber italic">Vendor</span>
      </p>
      <h1 className="mt-4 font-display text-[26px] font-semibold text-navy-900">
        Daftar sebagai Vendor
      </h1>
      <p className="mt-2 text-[13px] text-muted">
        Lengkapi data di bawah untuk bergabung sebagai vendor terverifikasi.
      </p>

      <form onSubmit={handleSubmit} className="mt-6">
        {/* Satu grid untuk semua field; jarak antar field diurus `gap`,
            jadi tiap field tidak lagi bawa mb-4 sendiri. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="category" className="block text-[13px] font-semibold text-navy-900">
              Kategori Layanan
            </label>
            <select
              id="category"
              name="category"
              required
              defaultValue=""
              className={`mt-2 ${inputClass}`}
            >
              <option value="" disabled>
                Pilih Kategori Utama
              </option>
              {Object.values(categories).map((c) => (
                <option key={c.apiCategory} value={c.apiCategory}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {isian.map((f) => (
            // Kata sandi melebar penuh: jumlah field-nya ganjil, jadi kalau
            // dipasangkan barisnya timpang sebelah.
            <div key={f.name} className={f.name === 'password' ? 'sm:col-span-2' : undefined}>
              <label htmlFor={f.name} className="block text-[13px] font-semibold text-navy-900">
                {f.label}
              </label>
              <input
                id={f.name}
                name={f.name}
                type={f.type}
                required
                autoComplete={f.autoComplete}
                placeholder={f.placeholder}
                // Backend menolak password < 8 karakter; cegat di browser dulu.
                minLength={f.name === 'password' ? 8 : undefined}
                className={`mt-2 ${inputClass}`}
              />
            </div>
          ))}
        </div>

        <div className="mt-5 flex gap-3 rounded border border-lavender bg-lavender/40 p-3.5">
          <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
          <p className="text-[12px] leading-relaxed text-ink/80">
            <span className="font-semibold text-navy-900">Festa Verified Vendor Program.</span> Tim
            kami akan memverifikasi portofolio dan legalitas Anda sebelum akun diaktifkan.
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-[14px] text-maroon">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 h-11 w-full rounded bg-ink text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? 'Memproses…' : 'Daftar sebagai Vendor'}
        </button>
      </form>

      <p className="mt-5 text-center text-[14px] text-ink">
        Sudah memiliki akun vendor?{' '}
        <Link to="/vendor/masuk" className="font-semibold hover:underline">
          Masuk di sini
        </Link>
      </p>

      <p className="mt-5 text-center text-[12px] leading-relaxed text-muted">
        Dengan mendaftar, Anda menyetujui <span className="underline">Syarat &amp; Ketentuan</span>{' '}
        dan <span className="underline">Kebijakan Privasi</span>.
      </p>
    </AuthLayout>
  )
}
