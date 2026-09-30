Add-Type -AssemblyName System.Drawing

$file = Get-ChildItem "C:\Users\kenan\Desktop" -Filter "*logo 111.png*" | Select-Object -First 1
Write-Host "Source image: $($file.FullName)"
$srcBmp = [System.Drawing.Bitmap]::FromFile($file.FullName)

# We will build a true 32-bit ARGB DIB icon
# Let's create sizes: 256, 128, 64, 48, 32, 16
$sizes = @(256, 128, 64, 48, 32, 16)
$entries = @()

foreach ($sz in $sizes) {
    $resized = New-Object System.Drawing.Bitmap $sz, $sz, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($resized)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $ratio = [Math]::Min($sz / $srcBmp.Width, $sz / $srcBmp.Height)
    $w = [int]($srcBmp.Width * $ratio)
    $h = [int]($srcBmp.Height * $ratio)
    $x = [int](($sz - $w) / 2)
    $y = [int](($sz - $h) / 2)
    $g.DrawImage($srcBmp, $x, $y, $w, $h)
    $g.Dispose()

    # Lock bits to get exact 32-bit BGRA pixels
    $rect = New-Object System.Drawing.Rectangle 0, 0, $sz, $sz
    $bmpData = $resized.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    
    $stride = [Math]::Abs($bmpData.Stride)
    $rawPixels = New-Object byte[] ($stride * $sz)
    [System.Runtime.InteropServices.Marshal]::Copy($bmpData.Scan0, $rawPixels, 0, $rawPixels.Length)
    $resized.UnlockBits($bmpData)
    $resized.Dispose()

    # BMP rows are stored bottom-to-top
    $xorMask = New-Object byte[] ($sz * $sz * 4)
    for ($row = 0; $row -lt $sz; $row++) {
        $srcRow = ($sz - 1 - $row) * $stride
        $dstRow = $row * ($sz * 4)
        [Array]::Copy($rawPixels, $srcRow, $xorMask, $dstRow, $sz * 4)
    }

    # 1-bit AND mask (all zeroes for 32-bit ARGB with alpha channel)
    $andRowBytes = [int][Math]::Ceiling($sz / 32.0) * 4
    $andMask = New-Object byte[] ($andRowBytes * $sz)

    # Build DIB chunk: 40 bytes BITMAPINFOHEADER + XOR mask + AND mask
    $dibStream = New-Object System.IO.MemoryStream
    $dibWriter = New-Object System.IO.BinaryWriter $dibStream

    # BITMAPINFOHEADER
    $dibWriter.Write([UInt32]40)                # biSize
    $dibWriter.Write([Int32]$sz)                # biWidth
    $dibWriter.Write([Int32]($sz * 2))          # biHeight (XOR + AND)
    $dibWriter.Write([UInt16]1)                 # biPlanes
    $dibWriter.Write([UInt16]32)                # biBitCount (32-bit ARGB)
    $dibWriter.Write([UInt32]0)                 # biCompression (BI_RGB)
    $dibWriter.Write([UInt32]($xorMask.Length + $andMask.Length)) # biSizeImage
    $dibWriter.Write([Int32]0)                  # biXPelsPerMeter
    $dibWriter.Write([Int32]0)                  # biYPelsPerMeter
    $dibWriter.Write([UInt32]0)                 # biClrUsed
    $dibWriter.Write([UInt32]0)                 # biClrImportant

    # Pixel data
    $dibWriter.Write($xorMask)
    $dibWriter.Write($andMask)
    $dibWriter.Flush()

    $dibBytes = $dibStream.ToArray()
    $dibWriter.Dispose()
    $dibStream.Dispose()

    $entries += ,@($sz, $dibBytes)
}
$srcBmp.Dispose()

# Assemble complete ICO file
$icoStream = New-Object System.IO.MemoryStream
$icoWriter = New-Object System.IO.BinaryWriter $icoStream

# ICO Header
$icoWriter.Write([UInt16]0)                     # Reserved
$icoWriter.Write([UInt16]1)                     # Type 1 = ICO
$icoWriter.Write([UInt16]$entries.Count)        # Number of images

# Directory Entries
$offset = 6 + ($entries.Count * 16)
foreach ($e in $entries) {
    $sz = $e[0]
    $dib = $e[1]

    $wByte = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }
    $hByte = if ($sz -ge 256) { [byte]0 } else { [byte]$sz }

    $icoWriter.Write($wByte)                    # Width
    $icoWriter.Write($hByte)                    # Height
    $icoWriter.Write([byte]0)                   # Colors
    $icoWriter.Write([byte]0)                   # Reserved
    $icoWriter.Write([UInt16]1)                 # Planes
    $icoWriter.Write([UInt16]32)                # Bits per pixel
    $icoWriter.Write([UInt32]$dib.Length)       # Image data size
    $icoWriter.Write([UInt32]$offset)           # Image data offset

    $offset += $dib.Length
}

# Image Data chunks
foreach ($e in $entries) {
    $icoWriter.Write($e[1])
}

$icoWriter.Flush()
$finalIco = $icoStream.ToArray()
$icoWriter.Dispose()
$icoStream.Dispose()

# Save icon to multiple destinations
$targetPath = "D:\Backup\.webapp\app_truecolor.ico"
[System.IO.File]::WriteAllBytes($targetPath, $finalIco)
[System.IO.File]::WriteAllBytes("D:\Backup\.webapp\app_icon.ico", $finalIco)
[System.IO.File]::WriteAllBytes("D:\Backup\.webapp\favicon.ico", $finalIco)
[System.IO.File]::WriteAllBytes("C:\Users\kenan\Desktop\Kenan\inaner.tr\public\app_icon.ico", $finalIco)
[System.IO.File]::WriteAllBytes("C:\Users\kenan\Desktop\Kenan\inaner.tr\public\favicon.ico", $finalIco)

Write-Host "Successfully generated TRUE-COLOR 32-bit ARGB ICO: $targetPath ($($finalIco.Length) bytes)"
