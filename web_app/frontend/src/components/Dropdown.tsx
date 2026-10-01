import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ChevronDown } from './icons'

/** Pengganti <select> dengan animasi buka ala Animated Dropdown (21st.dev,
 *  @Shatlyk1011). Anaknya tetap <option> biasa, jadi di halaman cukup ganti
 *  <select> jadi <Dropdown> dan onChange menerima nilainya langsung.
 *
 *  Yang dipertahankan dari <select> bawaan: id (label htmlFor tetap jalan),
 *  name + required (lewat input tersembunyi, jadi FormData & validasi browser
 *  tetap jalan), value/defaultValue, dan keyboard (panah, Enter, Esc, Home/End).
 *  Opsi `disabled` dianggap placeholder: tampil di tombol, tidak di daftar. */
type Opsi = { value: string; label: ReactNode; disabled?: boolean }

export default function Dropdown({
  id,
  name,
  value,
  defaultValue,
  onChange,
  required,
  keAtas,
  className = '',
  'aria-label': ariaLabel,
  children,
}: {
  id?: string
  name?: string
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  required?: boolean
  /** Buka ke atas — untuk dropdown yang menempel di dasar panel (kotak chat). */
  keAtas?: boolean
  className?: string
  'aria-label'?: string
  children: ReactNode
}) {
  const opsi: Opsi[] = Children.toArray(children).flatMap((c) =>
    isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(c)
      ? [{ value: String(c.props.value ?? ''), label: c.props.children, disabled: c.props.disabled }]
      : [],
  )
  const [sendiri, setSendiri] = useState(defaultValue ?? '')
  const nilai = value ?? sendiri
  // Sama seperti <select>: nilai yang tidak cocok dengan opsi mana pun
  // menampilkan opsi pertama.
  const terpilih = opsi.find((o) => o.value === nilai) ?? opsi[0]
  const pilihan = opsi.filter((o) => !o.disabled)

  const [buka, setBuka] = useState(false)
  const [aktif, setAktif] = useState(0)
  const tombol = useRef<HTMLButtonElement>(null)
  const daftar = useRef<HTMLUListElement>(null)
  const idDaftar = `${id ?? name ?? 'dropdown'}-daftar`

  function bukaDaftar() {
    setAktif(Math.max(0, pilihan.findIndex((o) => o.value === nilai)))
    setBuka(true)
  }

  function pilih(v: string) {
    setSendiri(v)
    if (v !== nilai) onChange?.(v)
    setBuka(false)
    tombol.current?.focus()
  }

  // Fokus pindah ke daftar selagi terbuka, jadi tombol panah/Enter tidak
  // pernah berebut dengan klik bawaan <button>.
  useEffect(() => {
    if (buka) daftar.current?.focus()
  }, [buka])

  useEffect(() => {
    if (buka) daftar.current?.children[aktif]?.scrollIntoView({ block: 'nearest' })
  }, [buka, aktif])

  function tombolKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      bukaDaftar()
    }
  }

  function daftarKeyDown(e: React.KeyboardEvent) {
    const akhir = pilihan.length - 1
    const geser: Record<string, number> = {
      ArrowDown: Math.min(akhir, aktif + 1),
      ArrowUp: Math.max(0, aktif - 1),
      Home: 0,
      End: akhir,
    }
    if (e.key in geser) {
      e.preventDefault()
      setAktif(geser[e.key])
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (pilihan[aktif]) pilih(pilihan[aktif].value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation() // jangan ikut menutup <dialog> yang membungkusnya
      setBuka(false)
      tombol.current?.focus()
    }
  }

  return (
    <div
      className="relative"
      // Klik di luar & Tab keluar sama-sama berarti fokus meninggalkan pembungkus.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setBuka(false)
      }}
    >
      <button
        ref={tombol}
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={buka}
        aria-controls={idDaftar}
        onClick={() => (buka ? setBuka(false) : bukaDaftar())}
        onKeyDown={tombolKeyDown}
        className={`flex items-center justify-between gap-2 text-left ${className}`}
      >
        <span className={`truncate ${terpilih?.disabled || terpilih?.value === '' ? 'text-ink/55' : ''}`}>
          {terpilih?.label}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ink/50 transition-transform duration-200 ${buka ? 'rotate-180' : ''}`}
        />
      </button>

      {(name || required) && (
        // Bukan type="hidden": input tersembunyi dilewati validasi `required`.
        // Kalau browser memfokusnya karena kosong, fokusnya dioper ke tombol.
        <input
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          required={required}
          value={nilai}
          onChange={() => {}}
          onFocus={() => tombol.current?.focus()}
          className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0"
        />
      )}

      {/* ponytail: tanpa animasi tutup (daftar langsung dilepas). AnimatePresence
          bersarang pernah macet di proyek ini (lihat TukarHalus); pasang kalau
          sudah dicek jalan. */}
      {buka && (
        <motion.ul
          ref={daftar}
          id={idDaftar}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${idDaftar}-${aktif}`}
          onKeyDown={daftarKeyDown}
          initial={{ opacity: 0, y: keAtas ? 10 : -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={`absolute left-0 z-50 max-h-64 min-w-full overflow-y-auto overscroll-contain rounded-sm border border-line bg-white py-1 shadow-lg outline-none ${
            keAtas ? 'bottom-[calc(100%+0.375rem)] origin-bottom' : 'top-[calc(100%+0.375rem)] origin-top'
          }`}
        >
          {pilihan.map((o, i) => (
            <motion.li
              key={o.value}
              id={`${idDaftar}-${i}`}
              role="option"
              aria-selected={o.value === nilai}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              // Dibatasi 8 langkah: daftar 20 kota tidak boleh baru lengkap 0,6 dtk kemudian.
              transition={{ delay: Math.min(i, 8) * 0.03, duration: 0.2, ease: 'easeOut' }}
              onMouseEnter={() => setAktif(i)}
              onClick={() => pilih(o.value)}
              className={`cursor-pointer px-3 py-2 text-[14px] transition-colors duration-150 ${
                i === aktif ? 'bg-lavender/60' : ''
              } ${o.value === nilai ? 'font-semibold text-navy-900' : 'text-ink'}`}
            >
              {o.label}
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  )
}
