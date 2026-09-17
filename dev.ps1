# Nyalakan backend + frontend sekaligus.
# Pakai: .\dev.ps1   (tutup jendelanya untuk stop)
$root = $PSScriptRoot
foreach ($sisi in 'backend', 'frontend') {
  Write-Host "Membuka $sisi ..." -ForegroundColor Cyan
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\web_app\$sisi'; npm run dev"
}
Write-Host "Frontend: http://localhost:5173   Backend: http://localhost:4000" -ForegroundColor Green
