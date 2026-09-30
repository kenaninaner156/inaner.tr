# Configure Windows Internet Settings to trust 192.168.1.1 as Local Intranet Zone (Zone 1)
$rangePath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings\ZoneMap\Ranges\Range1"
if (-not (Test-Path $rangePath)) {
    New-Item -Path $rangePath -Force | Out-Null
}
Set-ItemProperty -Path $rangePath -Name ":Range" -Value "192.168.1.1" -Force
Set-ItemProperty -Path $rangePath -Name "file" -Value 1 -Type DWord -Force
Set-ItemProperty -Path $rangePath -Name "*" -Value 1 -Type DWord -Force

# Trust UNC paths as intranet
$zoneMap = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings\ZoneMap"
Set-ItemProperty -Path $zoneMap -Name "UNCAsIntranet" -Value 1 -Type DWord -Force
Set-ItemProperty -Path $zoneMap -Name "AutoDetect" -Value 0 -Type DWord -Force

# Trust inaner.keenetic.pro
$domainPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings\ZoneMap\Domains\keenetic.pro\inaner"
if (-not (Test-Path $domainPath)) {
    New-Item -Path $domainPath -Force | Out-Null
}
Set-ItemProperty -Path $domainPath -Name "https" -Value 1 -Type DWord -Force

Write-Host "Successfully configured 192.168.1.1 and D: as Local Intranet (Zone 1)!"
