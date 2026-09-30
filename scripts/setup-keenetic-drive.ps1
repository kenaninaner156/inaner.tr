# Inaner Logistics - Keenetic USB Ag Surucusu Baglama Scripti
# Bu script, Keenetic modeme takilan USB diski Windows'ta Z: surucusu olarak tanimlar.

param (
    [string]$RouterIP = "192.168.1.1",
    [string]$ShareName = "Yedekler",
    [string]$DriveLetter = "Z:"
)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "   KEENETIC USB DISK AG SURUCUSU BAGLAMA ARACI    " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Modem IP       : $RouterIP"
Write-Host "Paylasim Adi   : $ShareName"
Write-Host "Surucu Harfi   : $DriveLetter"
Write-Host "--------------------------------------------------"

$networkPath = "\\$RouterIP\$ShareName"

# 1. Modeme erisim testi
Write-Host "1. Modem erisimi kontrol ediliyor ($RouterIP)..." -NoNewline
if (Test-Connection -ComputerName $RouterIP -Count 1 -Quiet) {
    Write-Host " [OK]" -ForegroundColor Green
} else {
    Write-Host " [HATA]" -ForegroundColor Red
    Write-Host "Modeme ulasilamiyor. Lutfen ayni Wi-Fi/Ethernet aginda oldugunuzdan emin olun." -ForegroundColor Yellow
    exit 1
}

# 2. SMB Portu Testi (445)
Write-Host "2. Windows Dosya Paylasimi (SMB) kontrol ediliyor..." -NoNewline
$portTest = Test-NetConnection -ComputerName $RouterIP -Port 445 -WarningAction SilentlyContinue
if ($portTest.TcpTestSucceeded) {
    Write-Host " [OK]" -ForegroundColor Green
} else {
    Write-Host " [UYARI]" -ForegroundColor Yellow
    Write-Host "Keenetic uzerinde 'Windows Agi (SMB) Dosya Paylasimi' henuz aktif edilmemis olabilir." -ForegroundColor Yellow
    Write-Host "Aktivasyon Icin: http://192.168.1.1 -> Ag Uygulamalari -> Windows Agi (SMB) -> Aktif Edin." -ForegroundColor Cyan
}

# 3. Surucu Harfi Kontrolu
if (Get-PSDrive -Name $DriveLetter.TrimEnd(':') -ErrorAction SilentlyContinue) {
    Write-Host "3. $DriveLetter surucusu zaten bagli. Yeniden yapilandiriliyor..." -ForegroundColor Yellow
    net use $DriveLetter /delete /y | Out-Null
}

Write-Host "4. Ag Surucusu baglaniyor ($networkPath -> $DriveLetter)..."
net use $DriveLetter $networkPath /persistent:yes

if ($LASTEXITCODE -eq 0) {
    Write-Host "--------------------------------------------------"
    Write-Host "TEBRIKLER: $DriveLetter surucusu basariyla baglandi!" -ForegroundColor Green
    Write-Host "Yedekler artik dogrudan modeme bagli USB diske yazilacaktir." -ForegroundColor Green
} else {
    Write-Host "--------------------------------------------------"
    Write-Host "Baglanti basarisiz oldu. Keenetic arayuzunde kullanici adi/sifre tanimliysa asagidaki gibi baglanabilirsiniz:" -ForegroundColor Yellow
    Write-Host "net use $DriveLetter $networkPath /user:KULLANICI_ADI SIFRE /persistent:yes" -ForegroundColor Cyan
}
