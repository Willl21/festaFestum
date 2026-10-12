// Validasi foto (lib/gambar.js) terhadap input serangan. Tidak butuh server.
//   node tests/test-gambar.js
// Endpoint foto me-redirect ke nilai yang lolos di sini, jadi URL luar yang
// lolos = open redirect di domain kita (audit 12 Okt 2026).
const assert = require('assert');
const { gambarBermasalah } = require('../src/lib/gambar');

const ditolak = [
  'https://situs-phishing.com',
  'http://contoh.com/a.jpg',
  '//evil.com/a.png',
  '/img/../../etc/passwd',
  'javascript:alert(1)',
  'data:image/svg+xml;base64,PHN2Zz4=', // SVG bisa membawa skrip
  'data:text/html;base64,PGgxPg==',
];
const diterima = ['/img/pexels-123.jpg', 'data:image/png;base64,iVBORw0KGgo='];

for (const v of ditolak) assert.ok(gambarBermasalah(v, 1e6), `harusnya ditolak: ${v}`);
for (const v of diterima) assert.strictEqual(gambarBermasalah(v, 1e6), null, `harusnya diterima: ${v}`);
console.log(`OK  ${ditolak.length} input serangan ditolak, ${diterima.length} foto sah diterima`);
