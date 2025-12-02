<#
PowerShell helper: prepare a standalone frontend repo copy for Vercel
Usage:
  .\extract_frontend_for_vercel.ps1 -RemoteUrl "git@github.com:youruser/frontend-repo.git" -Branch main

If you omit -RemoteUrl the script will create the folder and initialize git, but will not push.

This script should be run from the repository root (where this script exists).
#>
param(
  [string]$RemoteUrl = '',
  [string]$Branch = 'main',
  [string]$OutputFolder = ''
)

Set-StrictMode -Version Latest

$root = Get-Location
if (-not (Test-Path -Path (Join-Path $root 'Frontend'))) {
  Write-Error "Frontend folder not found under $root"
  exit 1
}

if (-not $OutputFolder -or $OutputFolder -eq '') {
  $timestamp = Get-Date -Format yyyyMMddHHmmss
  $OutputFolder = Join-Path $root "frontend-deploy-$timestamp"
}

Write-Host "Creating frontend copy at: $OutputFolder"
New-Item -ItemType Directory -Path $OutputFolder -Force | Out-Null

# Copy files (exclude node_modules, dist)
$exclude = @('node_modules','dist','.git','.cache','.venv')
Get-ChildItem -Path (Join-Path $root 'Frontend') -Force | ForEach-Object {
  $name = $_.Name
  if ($exclude -contains $name) { return }
  $src = $_.FullName
  $dest = Join-Path $OutputFolder $name
  if ($_.PSIsContainer) {
    Write-Host "Copying folder: $name"
    Copy-Item -Path $src -Destination $dest -Recurse -Force -ErrorAction Stop
  } else {
    Write-Host "Copying file: $name"
    Copy-Item -Path $src -Destination $dest -Force -ErrorAction Stop
  }
}

# Ensure package files exist
if (-not (Test-Path -Path (Join-Path $OutputFolder 'package.json'))) {
  Write-Host "Warning: package.json not found in Frontend. Creating minimal package.json"
  $pkg = @{
    name = 'frontend'
    version = '0.0.0'
    private = $true
    scripts = @{ build = 'ng build' }
  } | ConvertTo-Json -Depth 5
  $pkg | Out-File -FilePath (Join-Path $OutputFolder 'package.json') -Encoding UTF8
}

# Create .gitignore
$gitignorePath = Join-Path $OutputFolder '.gitignore'
if (-not (Test-Path $gitignorePath)) {
  @(
    'node_modules/',
    'dist/',
    '.env',
    '.DS_Store',
    'coverage/',
    '.idea/',
    '.vscode/',
    'npm-debug.log*'
  ) | Out-File -FilePath $gitignorePath -Encoding UTF8
}

# Initialize git repo
Push-Location $OutputFolder
if (-not (Test-Path -Path (Join-Path $OutputFolder '.git'))) {
  git init
  git add .
  git commit -m "chore: initial frontend export for Vercel"
} else {
  Write-Host "Git repo already exists in $OutputFolder"
}

if ($RemoteUrl -and $RemoteUrl -ne '') {
  Write-Host "Adding remote: $RemoteUrl"
  git remote add origin $RemoteUrl 2>$null
  git branch -M $Branch
  try {
    git push -u origin $Branch
    Write-Host "Pushed to $RemoteUrl (branch $Branch)"
  } catch {
    Write-Warning "Failed to push. Please check your git credentials or run 'git push' manually from $OutputFolder"
  }
} else {
  Write-Host "No remote provided. The prepared folder is: $OutputFolder"
}

Pop-Location

Write-Host "Done. If you want to delete the temporary copy after use, remove: $OutputFolder"
