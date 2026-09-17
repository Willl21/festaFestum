/** Tiga shift, lengkap mengikuti enum time_slot di DB.
 *
 *  'siang' dulu sengaja dihilangkan karena mockup cuma menggambar dua kolom.
 *  Akibatnya slot siang jadi kapasitas hantu: barisnya ada di
 *  vendor_schedules (ratusan), tapi tidak bisa dipesan customer DAN tidak
 *  bisa dilihat atau ditutup vendornya sendiri. Satu-satunya ongkos
 *  menghidupkannya cuma kolom ketiga di beberapa grid.
 *
 *  Dipakai bersama semua halaman detail vendor, halaman pesan, dan
 *  /vendor/jadwal — jadi nilainya harus satu sumber. */
export const shifts = [
  { value: 'pagi', label: 'Pagi', hours: '08.00-12.00' },
  { value: 'siang', label: 'Siang', hours: '12.00-16.00' },
  { value: 'malam', label: 'Sore/malam', hours: '16.00-22.00' },
] as const
