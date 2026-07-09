$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

if (-not (Test-Path ".\.env")) {
  Copy-Item ".\.env.example" ".\.env"
  Write-Host "Created .env from .env.example."
  Write-Host "Open .env, add your real RESEND_API_KEY, then run this file again."
  exit 0
}

node .\dev-server.cjs
