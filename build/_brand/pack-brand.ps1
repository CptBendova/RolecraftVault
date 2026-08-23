# Pack Imagine crest into app icon, setup icon, installer bitmaps, Android, splash.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

# Derived from this script's own location, so a clone works anywhere.
$brandDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent (Split-Path -Parent $brandDir)
$brand = $brandDir
$crest = Join-Path $brand "crest-1024.png"
$setupSrc = Join-Path $brand "src\setup-source.jpg"
$welcomeSrc = Join-Path $brand "src\welcome-source.jpg"
$headerSrc = Join-Path $brand "src\header-source.jpg"

function Load-Img($p) { [System.Drawing.Image]::FromFile($p) }
function New-Bmp($w,$h) {
  $b = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $b
}
function HQ($g) {
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
}
function Crop-SquareNoMark([System.Drawing.Image]$src) {
  $cut = [int]([Math]::Min($src.Width,$src.Height) * 0.06)
  $side = [Math]::Min($src.Width,$src.Height) - (2 * $cut)
  $bmp = New-Object System.Drawing.Bitmap $side, $side, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp); HQ $g
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle 0,0,$side,$side), (New-Object System.Drawing.Rectangle $cut,$cut,$side,$side), [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  return $bmp
}
function Scale-To([System.Drawing.Image]$src, $w, $h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp); HQ $g
  $g.DrawImage($src, 0, 0, $w, $h)
  $g.Dispose()
  return $bmp
}
function Save-Png($bmp, $path) {
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}
function Save-Bmp24($src, $path) {
  $bmp = New-Object System.Drawing.Bitmap $src.Width, $src.Height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($src, 0, 0, $src.Width, $src.Height)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bmp.Dispose()
}

$navy = [System.Drawing.Color]::FromArgb(10, 14, 28)
$brass = [System.Drawing.Color]::FromArgb(217, 178, 92)
$brassDim = [System.Drawing.Color]::FromArgb(156, 117, 48)
$cream = [System.Drawing.Color]::FromArgb(232, 228, 216)

# --- app icon 256 png ---
$crestImg = Load-Img $crest
$icon256 = Scale-To $crestImg 256 256
Save-Png $icon256 (Join-Path $root "app\icon.png")
Save-Png $icon256 (Join-Path $brand "icon-256.png")

# --- setup icon crop ---
$setupRaw = Load-Img $setupSrc
$setupSq = Crop-SquareNoMark $setupRaw
$setup1024 = Scale-To $setupSq 1024 1024
Save-Png $setup1024 (Join-Path $brand "setup-1024.png")
$setupRaw.Dispose(); $setupSq.Dispose()

# --- welcome: crop center column of the tall-panel render, 164x314 ---
$welRaw = Load-Img $welcomeSrc
$cx0 = [int]($welRaw.Width * 0.28)
$cw = [int]($welRaw.Width * 0.44)
$welCol = New-Object System.Drawing.Bitmap $cw, $welRaw.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gw = [System.Drawing.Graphics]::FromImage($welCol); HQ $gw
$gw.DrawImage($welRaw, (New-Object System.Drawing.Rectangle 0,0,$cw,$welRaw.Height), (New-Object System.Drawing.Rectangle $cx0,0,$cw,$welRaw.Height), [System.Drawing.GraphicsUnit]::Pixel)
$gw.Dispose()
$welRaw.Dispose()
$welcome = Scale-To $welCol 164 314
$welCol.Dispose()
$gWel = [System.Drawing.Graphics]::FromImage($welcome); HQ $gWel
# title block in the empty lower half
$titleFont = New-Object System.Drawing.Font "Georgia", 13, ([System.Drawing.FontStyle]::Bold)
$tagFont = New-Object System.Drawing.Font "Segoe UI", 6.5, ([System.Drawing.FontStyle]::Regular)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$brassBrush = New-Object System.Drawing.SolidBrush $brass
$dimBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(180, 217, 178, 92))
$gWel.DrawString("Rolecraft", $titleFont, $brassBrush, (New-Object System.Drawing.RectangleF 6, 210, 152, 22), $sf)
$gWel.DrawString("Vault", $titleFont, $brassBrush, (New-Object System.Drawing.RectangleF 6, 230, 152, 22), $sf)
$gWel.DrawString("PRIVATE  -  OFFLINE", $tagFont, $dimBrush, (New-Object System.Drawing.RectangleF 6, 258, 152, 16), $sf)
$gWel.Dispose()
Save-Png $welcome (Join-Path $brand "welcome-preview.png")
Save-Bmp24 $welcome (Join-Path $root "build\welcome.bmp")

# --- header 150x57: navy, crest left, wordmark right ---
$header = New-Bmp 150 57
$gH = [System.Drawing.Graphics]::FromImage($header); HQ $gH
$gH.Clear($navy)
$gH.DrawImage($crestImg, 6, 6, 45, 45)
$hTitle = New-Object System.Drawing.Font "Georgia", 9.5, ([System.Drawing.FontStyle]::Bold)
$hSub = New-Object System.Drawing.Font "Georgia", 8, ([System.Drawing.FontStyle]::Regular)
$gH.DrawString("Rolecraft", $hTitle, $brassBrush, 56, 10)
$gH.DrawString("Vault", $hSub, $dimBrush, 56, 28)
$gH.Dispose()
Save-Png $header (Join-Path $brand "header-preview.png")
Save-Bmp24 $header (Join-Path $root "build\header.bmp")

# --- wordmark logo (horizontal) ---
$word = New-Object System.Drawing.Bitmap 1024, 320, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gWo = [System.Drawing.Graphics]::FromImage($word); HQ $gWo
$gWo.Clear($navy)
$gWo.DrawImage($crestImg, 40, 24, 272, 272)
$wTitle = New-Object System.Drawing.Font "Georgia", 48, ([System.Drawing.FontStyle]::Bold)
$wSub = New-Object System.Drawing.Font "Segoe UI", 16, ([System.Drawing.FontStyle]::Regular)
$gWo.DrawString("Rolecraft Vault", $wTitle, $brassBrush, 340, 90)
$gWo.DrawString("Private  -  Offline", $wSub, $dimBrush, 344, 168)
$gWo.Dispose()
Save-Png $word (Join-Path $brand "wordmark.png")

# --- splash navy + crest ---
$splash = Scale-To $crestImg 1024 1024
Save-Png $splash (Join-Path $root "mobile\android\app\src\main\res\drawable\splash.png")

# --- android mipmaps ---
# Adaptive icons crop to about the inner 66dp of a 108dp layer. Scaling the
# crest to the full canvas made the shield look zoomed in. Foreground layers
# are 108dp with the crest inset; legacy launcher tiles keep a little padding.
function Fit-Crest([System.Drawing.Image]$src, $canvas, $fill, $navyFill) {
  $bmp = New-Object System.Drawing.Bitmap $canvas, $canvas, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp); HQ $g
  if ($navyFill) { $g.Clear($navy) }
  $side = [Math]::Max(1, [int]($canvas * $fill))
  $x = [int](($canvas - $side) / 2)
  $g.DrawImage($src, $x, $x, $side, $side)
  $g.Dispose()
  return $bmp
}
$mip = @{
  "mipmap-mdpi" = @{ tile = 48; fg = 108 }
  "mipmap-hdpi" = @{ tile = 72; fg = 162 }
  "mipmap-xhdpi" = @{ tile = 96; fg = 216 }
  "mipmap-xxhdpi" = @{ tile = 144; fg = 324 }
  "mipmap-xxxhdpi" = @{ tile = 192; fg = 432 }
}
foreach ($kv in $mip.GetEnumerator()) {
  $dir = Join-Path $root ("mobile\android\app\src\main\res\" + $kv.Key)
  $a = Fit-Crest $crestImg $kv.Value.tile 0.86 $true
  Save-Png $a (Join-Path $dir "ic_launcher.png")
  Save-Png $a (Join-Path $dir "ic_launcher_round.png")
  $fg = Fit-Crest $crestImg $kv.Value.fg 0.62 $false
  Save-Png $fg (Join-Path $dir "ic_launcher_foreground.png")
  $a.Dispose(); $fg.Dispose()
}
# adaptive foreground at 432 (xxxhdpi 108dp)
$fgBig = Fit-Crest $crestImg 432 0.62 $false
Save-Png $fgBig (Join-Path $root "mobile\android\app\src\main\res\drawable\ic_launcher_foreground.png")
$fgBig.Dispose()

# --- ico size pngs ---
$icoSizes = 16,24,32,48,64,128,256
$icoDir = Join-Path $brand "ico-app"
$setupIcoDir = Join-Path $brand "ico-setup"
New-Item -ItemType Directory -Force -Path $icoDir, $setupIcoDir | Out-Null
foreach ($s in $icoSizes) {
  $a = Scale-To $crestImg $s $s
  Save-Png $a (Join-Path $icoDir "$s.png")
  $a.Dispose()
  $b = Scale-To $setup1024 $s $s
  Save-Png $b (Join-Path $setupIcoDir "$s.png")
  $b.Dispose()
}

$icon256.Dispose(); $crestImg.Dispose(); $setup1024.Dispose()
$welcome.Dispose(); $header.Dispose(); $word.Dispose(); $splash.Dispose()
$titleFont.Dispose(); $tagFont.Dispose(); $hTitle.Dispose(); $hSub.Dispose()
$wTitle.Dispose(); $wSub.Dispose(); $brassBrush.Dispose(); $dimBrush.Dispose()
Write-Host "packed brand rasters"
