import { useState } from 'react'
import { inputClass } from './AuthLayout'
import Dropdown from './Dropdown'
import { kirim } from '../lib/api'
import { BANKS, samarkanRekening, type Rekening } from '../data/banks'

const label = 'block text-[12px] font-semibold tracking-wide text-navy-900 uppercase'

/** Kartu rekening tersimpan + form gantinya. Dipakai profil klien (rekening
 *  refund) dan profil vendor (rekening pencairan) — kontraknya sama persis:
 *  PATCH /auth/rekening dengan sandi.
 *
 *  Sengaja BUKAN <form>: di ProfilPage blok ini duduk di dalam form profil,
 *  dan form bersarang tidak sah di HTML. Rekening juga punya tombol simpannya
 *  sendiri karena menuntut sandi — tidak nebeng "Simpan Perubahan" profil. */
export default function RekeningBank({
  rekening,
  onTersimpan,
}: {
  rekening: Rekening
  onTersimpan: (r: Rekening) => void
}) {
  const ada = !!rekening.bank_name
  const [ubah, setUbah] = useState(!ada)
  const [isi, setIsi] = useState({
    bank_name: rekening.bank_name ?? '',
    bank_account_number: rekening.bank_account_number ?? '',
    bank_account_holder: rekening.bank_account_holder ?? '',
  })
  const [sandi, setSandi] = useState('')
  const [sibuk, setSibuk] = useState(false)
  const [galat, setGalat] = useState('')
  const [pesan, setPesan] = useState('')

  async function simpan() {
    setGalat('')
    setPesan('')
    setSibuk(true)
    try {
      const { user } = await kirim<{ user: Rekening }>('/auth/rekening', 'PATCH', {
        ...isi,
        current_password: sandi,
      })
      onTersimpan(user)
      setSandi('')
      setUbah(!user.bank_name)
      setPesan(user.bank_name ? 'Rekening tersimpan.' : 'Rekening dicabut.')
    } catch (err) {
      setGalat((err as Error).message)
    } finally {
      setSibuk(false)
    }
  }

  // Enter di kolom mana pun menyimpan REKENING, bukan ikut men-submit form
  // profil yang membungkusnya.
  const enterSimpan = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      simpan()
    }
  }

  if (!ubah && ada) {
    return (
      <div className="mt-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-4 rounded bg-navy-900 px-6 py-5 text-white">
          <span className="flex h-11 w-14 shrink-0 items-center justify-center rounded bg-white text-[13px] font-bold tracking-wide text-navy-900 uppercase">
            {rekening.bank_name}
          </span>
          {/* basis-40: kolom ini tidak boleh menyusut di bawah 160px. Di kolom
              sempit (profil vendor di HP) tombol Ganti yang mengalah turun ke
              baris sendiri, bukan nama bank yang patah per kata. */}
          <div className="min-w-0 flex-1 basis-40">
            <p className="font-display text-[17px] font-semibold">
              {BANKS[rekening.bank_name!] ?? rekening.bank_name!.toUpperCase()}
            </p>
            <p className="mt-0.5 font-mono text-[14px] tracking-widest text-white/70">
              {samarkanRekening(rekening.bank_account_number ?? '')}
            </p>
            <p className="mt-0.5 text-[12px] tracking-wide text-white/90 uppercase">
              a.n {rekening.bank_account_holder}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setUbah(true); setPesan('') }}
            className="h-10 shrink-0 rounded bg-white px-5 text-[14px] font-semibold text-navy-900 transition-opacity hover:opacity-90"
          >
            Ganti Rekening
          </button>
        </div>
        {pesan && <p className="mt-3 text-[13px] font-semibold text-[#2e6b52]" role="status">{pesan}</p>}
      </div>
    )
  }

  return (
    <div className="mt-5 grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="bank_name" className={label}>Nama Bank</label>
        <Dropdown
          id="bank_name"
          value={isi.bank_name}
          onChange={(v) => setIsi((x) => ({ ...x, bank_name: v }))}
          className={`mt-2 ${inputClass}`}
        >
          <option value="">Pilih bank</option>
          {Object.entries(BANKS).map(([kode, nama]) => (
            <option key={kode} value={kode}>{nama}</option>
          ))}
        </Dropdown>
      </div>

      <div>
        <label htmlFor="bank_account_number" className={label}>Nomor Rekening</label>
        <input
          id="bank_account_number"
          inputMode="numeric"
          autoComplete="off"
          maxLength={20}
          value={isi.bank_account_number}
          onChange={(e) => setIsi((x) => ({ ...x, bank_account_number: e.target.value.replace(/\D/g, '') }))}
          onKeyDown={enterSimpan}
          placeholder="8271000012349402"
          className={`mt-2 ${inputClass}`}
        />
        <p className="mt-1 text-[12px] text-muted">8-20 digit, tanpa spasi.</p>
      </div>

      <div>
        <label htmlFor="bank_account_holder" className={label}>Nama Pemilik Rekening</label>
        <input
          id="bank_account_holder"
          autoComplete="off"
          maxLength={60}
          value={isi.bank_account_holder}
          onChange={(e) => setIsi((x) => ({ ...x, bank_account_holder: e.target.value }))}
          onKeyDown={enterSimpan}
          placeholder="Sesuai KTP"
          className={`mt-2 ${inputClass}`}
        />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="sandi_rekening" className={label}>Kata Sandi Akun</label>
        <input
          id="sandi_rekening"
          type="password"
          autoComplete="current-password"
          value={sandi}
          onChange={(e) => setSandi(e.target.value)}
          onKeyDown={enterSimpan}
          className={`mt-2 ${inputClass}`}
        />
        <p className="mt-1 text-[12px] text-muted">
          Rekening ini tujuan transfer dana, jadi menggantinya perlu sandi Anda.
          {ada && ' Kosongkan ketiga kolom rekening lalu simpan untuk mencabutnya.'}
        </p>
      </div>

      {galat && <p className="text-[13px] text-maroon sm:col-span-2" role="alert">{galat}</p>}
      {/* Sesudah dicabut, tampilan kembali ke form ini, jadi pesannya harus
          ikut tampil di sini juga. Dulu "Rekening dicabut." tidak pernah terlihat. */}
      {pesan && <p className="text-[13px] font-semibold text-[#2e6b52] sm:col-span-2" role="status">{pesan}</p>}

      <div className="flex gap-3 sm:col-span-2">
        <button
          type="button"
          onClick={simpan}
          disabled={sibuk || !sandi}
          className="h-11 rounded bg-navy-900 px-6 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {sibuk ? 'Menyimpan…' : 'Simpan Rekening'}
        </button>
        {ada && (
          <button
            type="button"
            onClick={() => {
              setUbah(false)
              setGalat('')
              setSandi('')
              setIsi({
                bank_name: rekening.bank_name ?? '',
                bank_account_number: rekening.bank_account_number ?? '',
                bank_account_holder: rekening.bank_account_holder ?? '',
              })
            }}
            className="h-11 px-2 text-[14px] font-medium underline underline-offset-4"
          >
            Batal
          </button>
        )}
      </div>
    </div>
  )
}
