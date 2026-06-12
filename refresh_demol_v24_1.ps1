param(
    [string]$ZipPath = "$env:USERPROFILE\Downloads\DEMOL_v24_1_android_encoding_fix.zip",
    [string]$Repo = "C:\Users\Gysgh\Desktop\Fers\testLLL\reference_projects\Computational-Physics"
)

$ErrorActionPreference = "Stop"

$target = Join-Path $Repo "Args\Phy\Struttura\DEMOL"
$tmp = Join-Path $Repo "_DEMOL_unpack_tmp"

Write-Host "ZIP:    $ZipPath"
Write-Host "REPO:   $Repo"
Write-Host "TARGET: $target"

if (!(Test-Path $ZipPath)) {
    Write-Error "Zip non trovato: $ZipPath"
    exit 1
}

if (!(Test-Path $Repo)) {
    Write-Error "Repo non trovato: $Repo"
    exit 1
}

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $tmp | Out-Null

Expand-Archive -Path $ZipPath -DestinationPath $tmp -Force

if (Test-Path (Join-Path $tmp "DEMOL\index.html")) {
    $src = Join-Path $tmp "DEMOL"
} elseif (Test-Path (Join-Path $tmp "index.html")) {
    $src = $tmp
} else {
    Write-Error "Non trovo index.html nello zip estratto. Controlla lo zip."
    exit 1
}

Write-Host "SOURCE: $src"

robocopy $src $target /MIR
$robocopyExit = $LASTEXITCODE
if ($robocopyExit -ge 8) {
    Write-Error "Robocopy fallito con exit code $robocopyExit"
    exit $robocopyExit
}

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Remove-Item (Join-Path $Repo "Args\Phy\Struttura\Computational-Physics.lnk") -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $Repo "Args\Phy\Struttura\DEMOL_current_data_js.zip") -Force -ErrorAction SilentlyContinue

Set-Location $Repo

git add --sparse -A --force Args/Phy/Struttura/DEMOL Args/Phy/Struttura/DEMOL_current_data_js.zip Args/Phy/Struttura/Computational-Physics.lnk

Write-Host ""
Write-Host "=== git status --short ==="
git status --short
Write-Host ""
Write-Host "Se vedi modifiche corrette, esegui:"
Write-Host "git commit -m \"Replace DEMOL with v24.1 Android fixed version\""
Write-Host "git push"
