import { SearchIcon, ChevronDown } from './icons'

type Pilihan = { value: string; label: string }

type SelectField = {
  kind: 'select'
  /** Kunci di objek `nilai`. */
  key: string
  label: string
  options: Pilihan[]
}

type DateField = {
  kind: 'date'
  key: string
  label: string
}

export type Field = SelectField | DateField

/** Panel pencarian putih yang menumpuk di atas hero.
 *  Dipakai landing page (Tanggal/Lokasi/Vendor) dan halaman kategori
 *  (Lokasi/Harga/Urutan) — isinya beda, bingkainya sama.
 *
 *  Terkendali penuh: panel ini tidak menyimpan state apa pun, halamannya yang
 *  pegang. Sebelumnya semua field di sini hanya hiasan — nol `useState`, nol
 *  `onChange`, dan tombol Cari tanpa `onClick` — jadi enam halaman memasang
 *  kontrol yang tidak melakukan apa-apa. */
export default function SearchPanel({
  fields,
  nilai,
  onUbah,
  onCari,
  labelTombol = 'Cari',
  sibuk = false,
}: {
  fields: Field[]
  /** Isi tiap field, dikunci `key`. */
  nilai: Record<string, string>
  onUbah: (key: string, value: string) => void
  onCari: () => void
  labelTombol?: string
  sibuk?: boolean
}) {
  return (
    // <form> supaya Enter di dalam field ikut mencari — di panel berisi tanggal
    // dan dropdown, menekan Enter adalah hal yang paling wajar dilakukan orang.
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onCari()
      }}
      className="bg-white px-6 py-5 shadow-[0_2px_20px_rgba(0,0,0,0.06)] md:px-8 md:py-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:gap-6">
        {fields.map((f) => (
          <div key={f.key} className="flex-1">
            <label htmlFor={f.key} className="mb-2 block text-[14px] text-ink/80">
              {f.label}
            </label>

            {f.kind === 'date' ? (
              <input
                id={f.key}
                type="date"
                value={nilai[f.key] ?? ''}
                onChange={(e) => onUbah(f.key, e.target.value)}
                // Tanggal acara yang sudah lewat tidak bisa dipesan; membiarkan
                // orang memilihnya cuma menghasilkan hasil kosong tanpa sebab.
                min={new Date().toISOString().slice(0, 10)}
                className="h-11 w-full rounded border border-line bg-white px-3 text-[14px] text-ink/70 outline-none focus:border-navy-900"
              />
            ) : (
              <div className="relative">
                <select
                  id={f.key}
                  value={nilai[f.key] ?? ''}
                  onChange={(e) => onUbah(f.key, e.target.value)}
                  className="h-11 w-full appearance-none rounded border border-line bg-white px-3 pr-9 text-[14px] text-ink/80 outline-none focus:border-navy-900"
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50" />
              </div>
            )}
          </div>
        ))}

        <button
          type="submit"
          disabled={sibuk}
          className="flex h-11 items-center justify-center gap-2.5 rounded bg-navy-900 px-10 text-[15px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:w-[180px]"
        >
          <SearchIcon className="h-[18px] w-[18px]" />
          {sibuk ? 'Mencari…' : labelTombol}
        </button>
      </div>
    </form>
  )
}
