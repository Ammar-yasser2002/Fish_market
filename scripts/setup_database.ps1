# PostgreSQL Database Setup Script for Fishe POS
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "SilentlyContinue"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   PostgreSQL Database Auto-Setup - Fishe POS System    " -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Search for PostgreSQL bin directory
$pgBin = $null
$installedPaths = Get-ChildItem "C:\Program Files\PostgreSQL" -ErrorAction SilentlyContinue | Sort-Object Name -Descending

foreach ($dir in $installedPaths) {
    $candidate = Join-Path $dir.FullName "bin"
    if (Test-Path (Join-Path $candidate "psql.exe")) {
        $pgBin = $candidate
        break
    }
}

if (-not $pgBin) {
    Write-Host "`n[!] Could not locate PostgreSQL in C:\Program Files\PostgreSQL" -ForegroundColor Red
    Write-Host "Please make sure PostgreSQL is installed first." -ForegroundColor White
    Read-Host "Press Enter to exit..."
    exit 1
}

Write-Host "`n[+] Found PostgreSQL at: $pgBin" -ForegroundColor Green

# 2. Set default password for postgres user
$env:PGPASSWORD = "19702002Ay"
$createdbExe = Join-Path $pgBin "createdb.exe"
$psqlExe = Join-Path $pgBin "psql.exe"
$sqlFile = Join-Path $PSScriptRoot "setup_database.sql"

# 3. Create database if it does not exist
Write-Host "`n[1/2] Checking and creating database 'fishe_db'..." -ForegroundColor Yellow
& $createdbExe -U postgres -p 5432 fishe_db 2>$null

# 4. Execute SQL table creation script
Write-Host "[2/2] Creating and verifying tables and indexes..." -ForegroundColor Yellow
& $psqlExe -U postgres -p 5432 -d fishe_db -f $sqlFile

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "  Database setup successfully completed!               " -ForegroundColor Green
Write-Host "  You can now launch Fishe POS application.            " -ForegroundColor Green
Write-Host "========================================================`n" -ForegroundColor Green

Read-Host "Press Enter to finish..."
