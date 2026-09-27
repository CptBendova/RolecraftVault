# Pack crest into app and setup icons, Android icons, and splash.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

# Derived from this script's own location, so a clone works anywhere.
$brandDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent (Split-Path -Parent $brandDir)
$brand = $brandDir
$crest = Join-Path $brand "crest-1024.png"
$setupSrc = Join-Path $brand "src\setup-source.jpg"

function Load-Img($p) { [System.Drawing.Image]::FromFile($p) }
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
$navy = [System.Drawing.Color]::FromArgb(10, 14, 28)

# --- app icon 256 png ---
$crestImg = Load-Img $crest
$icon256 = Scale-To $crestImg 256 256
Save-Png $icon256 (Join-Path $root "app\icon.png")

# --- setup icon crop ---
$setupRaw = Load-Img $setupSrc
$setupSq = Crop-SquareNoMark $setupRaw
$setup1024 = Scale-To $setupSq 1024 1024
$setupRaw.Dispose(); $setupSq.Dispose()

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
$splash.Dispose()
Write-Host "packed brand rasters"
