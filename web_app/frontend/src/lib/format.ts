/** Satu format Rupiah untuk seluruh situs: "Rp 3.500.000". Dulu `rupiah`
 *  menulis ",00" sementara invoice & dasbor memakai `rupiahBulat`, jadi angka
 *  yang sama tampil dua cara. Semua nominal di sistem ini bilangan bulat.
 *  Dua nama dipertahankan supaya pemanggil lama tidak perlu diubah. */
export const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`
export const rupiahBulat = rupiah
