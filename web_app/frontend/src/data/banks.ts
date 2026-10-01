/** Bank tujuan transfer (payout vendor & refund klien). Kodenya harus sama
 *  persis dengan BANK_CODES di backend/src/controllers/auth.controller.js —
 *  backend yang memutuskan sah atau tidak; di sini cuma label dan dropdown.
 *  Dipusatkan karena dipakai profil klien, profil vendor, keuangan vendor, dan
 *  escrow admin: kode yang meleset di salah satunya = label kosong tanpa error. */
export const BANKS: Record<string, string> = {
  bca: 'PT Bank Central Asia Tbk',
  bni: 'PT Bank Negara Indonesia Tbk',
  bri: 'PT Bank Rakyat Indonesia Tbk',
  mandiri: 'PT Bank Mandiri Tbk',
  bsi: 'PT Bank Syariah Indonesia Tbk',
  cimb: 'PT Bank CIMB Niaga Tbk',
  permata: 'PT Bank Permata Tbk',
  danamon: 'PT Bank Danamon Indonesia Tbk',
  btn: 'PT Bank Tabungan Negara Tbk',
  panin: 'PT Bank Panin Tbk',
  ocbc: 'PT Bank OCBC NISP Tbk',
  maybank: 'PT Bank Maybank Indonesia Tbk',
  jago: 'PT Bank Jago Tbk',
}

/** Empat digit depan dan belakang saja — cukup untuk pemilik mengenali
 *  rekeningnya sendiri tanpa memampang nomor penuh di layar. */
export const samarkanRekening = (n: string) =>
  n.length <= 8 ? n : `${n.slice(0, 4)} •••• •••• ${n.slice(-4)}`

export type Rekening = {
  bank_name: string | null
  bank_account_number: string | null
  bank_account_holder: string | null
}
