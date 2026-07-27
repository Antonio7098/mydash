$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 20 or later is required." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm is required." }
if (-not (Test-Path "node_modules")) {
  Write-Host "Installing MyDash dependencies..."
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
}
Write-Host "Starting MyDash..."
npm start
