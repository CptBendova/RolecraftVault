# Pad Android launcher icons so the crest sits inside the adaptive-icon safe zone.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = "C:\Rolecraft\rolecraft-vault"
$crestPath = Join-Path $root "app\vendor\crest-1024.png"
$navy = [System.Drawing.Color]::FromArgb(10, 14, 28)

function HQ($g) {
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
}
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
function Save-Png($bmp, $path) {
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

$crest = [System.Drawing.Image]::FromFile($crestPath)
$mip = @{
  "mipmap-mdpi" = @{ tile = 48; fg = 108 }
  "mipmap-hdpi" = @{ tile = 72; fg = 162 }
  "mipmap-xhdpi" = @{ tile = 96; fg = 216 }
  "mipmap-xxhdpi" = @{ tile = 144; fg = 324 }
  "mipmap-xxxhdpi" = @{ tile = 192; fg = 432 }
}
foreach ($kv in $mip.GetEnumerator()) {
  $dir = Join-Path $root ("mobile\android\app\src\main\res\" + $kv.Key)
  $a = Fit-Crest $crest $kv.Value.tile 0.86 $true
  Save-Png $a (Join-Path $dir "ic_launcher.png")
  Save-Png $a (Join-Path $dir "ic_launcher_round.png")
  $fg = Fit-Crest $crest $kv.Value.fg 0.62 $false
  Save-Png $fg (Join-Path $dir "ic_launcher_foreground.png")
  Write-Host ("  " + $kv.Key + " tile=" + $kv.Value.tile + " fg=" + $kv.Value.fg)
  $a.Dispose(); $fg.Dispose()
}
$fgBig = Fit-Crest $crest 432 0.62 $false
Save-Png $fgBig (Join-Path $root "mobile\android\app\src\main\res\drawable\ic_launcher_foreground.png")
$fgBig.Dispose()
$crest.Dispose()
Write-Host "padded android launcher icons"
