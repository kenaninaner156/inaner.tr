Add-Type -AssemblyName System.Drawing

# Find the target logo file safely
$sourcePng = $null
$foundInBackup = Get-ChildItem "D:\Backup\latest" -Filter "*logo 111.png*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($foundInBackup) {
    $sourcePng = $foundInBackup.FullName
} else {
    $foundInPublic = Get-ChildItem "C:\Users\kenan\Desktop\Kenan\inaner.tr\public" -Filter "*logo 111.png*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($foundInPublic) {
        $sourcePng = $foundInPublic.FullName
    } else {
        $sourcePng = "C:\Users\kenan\Desktop\Kenan\inaner.tr\public\logo.png"
    }
}

Write-Host "Source logo image: $sourcePng"

$img = [System.Drawing.Image]::FromFile($sourcePng)
Write-Host "Original dimensions: $($img.Width)x$($img.Height)"

# Multi-resolution ICO: 256, 128, 64, 48, 32, 16
$sizes = @(256, 128, 64, 48, 32, 16)
$pngStreams = @()

foreach ($sz in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $sz, $sz
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($img, 0, 0, $sz, $sz)
    $g.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $bytes = $ms.ToArray()
    $ms.Dispose()

    $pngStreams += ,@($sz, $bytes)
}
$img.Dispose()

# Build ICO binary
$icoMs = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $icoMs

# Header
$writer.Write([UInt16]0) # Reserved
$writer.Write([UInt16]1) # Type 1 = ICO
$writer.Write([UInt16]$pngStreams.Count) # Count

# Directory entries
$offset = 6 + ($pngStreams.Count * 16)

foreach ($entry in $pngStreams) {
    $sz = $entry[0]
    $data = $entry[1]
    
    $widthByte = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }
    $heightByte = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }

    $writer.Write($widthByte)
    $writer.Write($heightByte)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$data.Length)
    $writer.Write([UInt32]$offset)

    $offset += $data.Length
}

# Image data chunks
foreach ($entry in $pngStreams) {
    $writer.Write($entry[1])
}

$writer.Flush()
$icoBytes = $icoMs.ToArray()
$writer.Dispose()
$icoMs.Dispose()

# Save to D:\Backup\.webapp\app_icon.ico
$targetDir = "D:\Backup\.webapp"
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}
$targetIco = Join-Path $targetDir "app_icon.ico"
[System.IO.File]::WriteAllBytes($targetIco, $icoBytes)
Write-Host "Successfully saved: $targetIco"

# Save to public/app_icon.ico and public/favicon.ico
$publicDir = "C:\Users\kenan\Desktop\Kenan\inaner.tr\public"
if (Test-Path $publicDir) {
    [System.IO.File]::WriteAllBytes((Join-Path $publicDir "app_icon.ico"), $icoBytes)
    [System.IO.File]::WriteAllBytes((Join-Path $publicDir "favicon.ico"), $icoBytes)
    Copy-Item -Path $sourcePng -Destination (Join-Path $publicDir "logo.png") -Force
    Write-Host "Successfully copied logo and icon to public/ directory"
}
