<#
.SYNOPSIS
  Packages the SiteLens AI Chrome Extension into a clean, Chrome Web Store / Edge Add-ons ready .zip archive.
  Automatically excludes Chrome-generated _metadata/, temporary files, and OS junk.
#>

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ExtDir = Join-Path $RepoRoot 'extension'
$DistDir = Join-Path $RepoRoot 'dist'
$ManifestPath = Join-Path $ExtDir 'manifest.json'

if (-not (Test-Path $ManifestPath)) {
  throw "manifest.json not found at $ManifestPath"
}

$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$Version = $Manifest.version
$ZipName = "devwebaudit-v$Version-chrome-extension.zip"
$ZipPath = Join-Path $DistDir $ZipName
$StageDir = Join-Path $DistDir "_stage_v$Version"

New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
if (Test-Path $StageDir) { Remove-Item $StageDir -Recurse -Force }
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

New-Item -ItemType Directory -Force -Path $StageDir | Out-Null

# Copy clean extension files excluding _metadata and hidden/OS files
Get-ChildItem -Path $ExtDir -Force | Where-Object {
  $_.Name -notin @('_metadata', '.DS_Store', 'Thumbs.db')
} | ForEach-Object {
  Copy-Item -Path $_.FullName -Destination $StageDir -Recurse -Force
}

Compress-Archive -Path (Join-Path $StageDir '*') -DestinationPath $ZipPath -CompressionLevel Optimal
Remove-Item $StageDir -Recurse -Force

$SizeKB = [Math]::Round((Get-Item $ZipPath).Length / 1KB, 1)
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " DevWebAudit v$Version Extension Packaged Successfully!" -ForegroundColor Green
Write-Host " Archive: $ZipPath ($SizeKB KB)" -ForegroundColor White
Write-Host " Ready for Chrome Web Store, Edge Add-ons & GitHub Releases." -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
