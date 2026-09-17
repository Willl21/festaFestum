/** Dipisah dari icons.tsx karena file itu hanya boleh mengekspor KOMPONEN —
 *  satu ekspor objek di tengahnya mematikan Fast Refresh untuk seluruh file,
 *  jadi menyentuh ikon apa pun memicu reload penuh saat ngoding.
 */
/** Ikon kecil di kartu "Layanan Tersedia" halaman detail florist. */
export const serviceIcons = {
  sparkle: ({ className = 'h-4 w-4' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  ),
  table: ({ className = 'h-4 w-4' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M7 3v8m0 0v10m0-10a3 3 0 0 0 0-6M17 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4v9" strokeLinecap="round" />
    </svg>
  ),
  heart: ({ className = 'h-4 w-4' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 20s-7-4.5-7-9.5A3.9 3.9 0 0 1 12 7a3.9 3.9 0 0 1 7 3.5c0 5-7 9.5-7 9.5Z" strokeLinejoin="round" />
    </svg>
  ),
  flower: ({ className = 'h-4 w-4' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="9" r="2.4" />
      <path d="M12 6.6a2.4 2.4 0 1 0 0-.2M9.6 9a2.4 2.4 0 1 0-.2 0M14.4 9a2.4 2.4 0 1 0 .2 0M12 11.4a2.4 2.4 0 1 0 0 .2M12 14v7" strokeLinecap="round" />
    </svg>
  ),
} as const
