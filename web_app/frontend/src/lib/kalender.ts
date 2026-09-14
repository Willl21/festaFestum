/** Bagian kalender yang dipakai bersama KalenderSlot dan KalenderTanggal.
 *
 *  Ditaruh di lib/, bukan di file komponen: mengekspor konstanta dan fungsi
 *  dari file yang juga mengekspor komponen mematikan fast refresh Vite. */

/** YYYY-MM-DD dari waktu LOKAL. toISOString() tidak bisa dipakai — dia
 *  mengubah ke UTC lebih dulu, jadi tanggal 1 pukul 00:30 WIB akan terbaca
 *  sebagai tanggal sebelumnya. */
export function isoLokal(d: Date) {
  const b = String(d.getMonth() + 1).padStart(2, '0')
  const t = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${b}-${t}`
}

/** Seluruh tampilan kalender dari token proyek — react-day-picker cuma
 *  dipakai untuk grid dan aksesibilitas keyboardnya. Dibagi dengan
 *  KalenderSlot supaya keduanya tidak pernah melenceng. */
export const KELAS_KALENDER = {
  months: 'relative',
  month_caption: 'flex h-9 items-center justify-center',
  caption_label: 'text-[15px] font-semibold capitalize',
  nav: 'absolute inset-x-0 top-0 flex h-9 items-center justify-between',
  button_previous:
    'flex h-7 w-7 items-center justify-center rounded-sm text-ink/70 transition-colors hover:bg-lavender/50 disabled:opacity-30',
  button_next:
    'flex h-7 w-7 items-center justify-center rounded-sm text-ink/70 transition-colors hover:bg-lavender/50 disabled:opacity-30',
  month_grid: 'mt-2 w-full border-collapse',
  weekdays: 'text-[11px] tracking-wide text-muted uppercase',
  weekday: 'pb-2 font-normal',
  day: 'p-0.5 text-center',
  day_button:
    'h-9 w-9 rounded-sm text-[13px] transition-colors hover:bg-lavender/50 disabled:cursor-not-allowed disabled:text-ink/25 disabled:hover:bg-transparent',
  selected: '[&>button]:bg-navy-900 [&>button]:text-white [&>button:hover]:bg-navy-900',
  today: '[&>button]:font-semibold [&>button]:text-maroon',
  outside: 'opacity-45',
}
