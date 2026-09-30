$ErrorActionPreference = 'Stop'

# Target shortcut name using Unicode char 0x0130 for Turkish dotted uppercase İ
$dotI = [char]0x0130
$shortcutName = "$($dotI)naner.tr Offline.lnk"
$shortcutPath = "D:\$shortcutName"

# Clean any existing or corrupted shortcut variants
Get-ChildItem -Path "D:\" -Filter "*naner.tr Offline.lnk" -Force -ErrorAction SilentlyContinue | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
}

# Create Desktop / D: Shortcut
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "C:\Windows\System32\wscript.exe"
$shortcut.Arguments = "`"D:\Backup\.webapp\start_silent.vbs`""
$shortcut.WorkingDirectory = "D:\Backup\.webapp"
$localIcon = "$env:LOCALAPPDATA\Inaner\app_logo.ico"
if (-not (Test-Path $localIcon)) {
    $localIcon = "$env:ProgramData\Inaner\app_logo.ico"
}
$shortcut.IconLocation = "$localIcon,0"
$shortcut.Description = "İnaner Logistics - Çevrimdışı Web Uygulaması"
$shortcut.Save()

# Set .webapp as hidden and system
cmd /c "attrib +h +s D:\Backup\.webapp"

Write-Host "Shortcut created successfully at $shortcutPath"
