Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot "..\public\icon.png"
$buildDir = Join-Path $PSScriptRoot "..\build"
$icoPath = Join-Path $buildDir "icon.ico"
$favPath = Join-Path $PSScriptRoot "..\public\favicon.ico"

if (-not (Test-Path $buildDir)) {
    New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
}

$bmp = [System.Drawing.Bitmap]::FromFile($srcPath)
$resized = New-Object System.Drawing.Bitmap $bmp, 256, 256
$hIcon = $resized.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)

$fs = [System.IO.File]::OpenWrite($icoPath)
$icon.Save($fs)
$fs.Close()
$resized.Dispose()
$bmp.Dispose()

Copy-Item $icoPath $favPath -Force
Write-Output "ICO successfully generated at $icoPath and $favPath"
