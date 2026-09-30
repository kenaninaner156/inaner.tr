# Inaner Logistics - Otomatik Gece Yedekleme Zamanlayicisi (Windows Task Scheduler)
# Bu script, run-backup.bat dosyasini her gece saat 02:00'de otomatik calisacak sekilde zamanlar.

param (
    [string]$TaskName = "Inaner_Logistics_Daily_Backup",
    [string]$Time = "02:00"
)

$projectDir = (Get-Item $PSScriptRoot).Parent.FullName
$batPath = Join-Path $projectDir "run-backup.bat"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "    OTOMATIK GECE YEDEKLEME ZAMANLAYICI KURULUMU  " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Gorev Adi  : $TaskName"
Write-Host "Saat       : Her gece $Time"
Write-Host "Calisacak  : $batPath"
Write-Host "--------------------------------------------------"

if (-not (Test-Path $batPath)) {
    Write-Host "[HATA] $batPath bulunamadi!" -ForegroundColor Red
    exit 1
}

$action = New-ScheduledTaskAction -Execute $batPath -WorkingDirectory $projectDir
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries:$false -DontStopIfGoingOnBatteries:$true -StartWhenAvailable:$true

try {
    # Eski gorev varsa kaldir
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    
    # Yeni gorevi kaydet
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Inaner Logistics otomatik gece senkron yedekleme gorevi" | Out-Null

    Write-Host "--------------------------------------------------"
    Write-Host "TEBRIKLER: Gorev basariyla olusturuldu!" -ForegroundColor Green
    Write-Host "Sisteminiz her gece saat $Time'de verilerinizi modeme otomatik yedekleyecektir." -ForegroundColor Green
} catch {
    Write-Host "[HATA] Zamanlanmis gorev kaydedilemedi: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Lutfen PowerShell'i 'Yonetici Olarak Calistir' (Run as Administrator) secenegiyle acip tekrar deneyin." -ForegroundColor Yellow
}
