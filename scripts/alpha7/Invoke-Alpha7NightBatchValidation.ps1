param(
    [string]$OpenPLCRepo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"
$OpenPLCRepo = (Resolve-Path $OpenPLCRepo).Path
$expectedBranch = "develop/alpha7-openplc-remote-io-rtu"
$branch = (& git -C $OpenPLCRepo branch --show-current).Trim()
if ($branch -ne $expectedBranch) {
    throw "Branch OpenPLC inesperado. Esperado: $expectedBranch ; actual: $branch"
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " ALPHA7 - BATCH SOFTWARE GATES (NO HARDWARE)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Repo   : $OpenPLCRepo"
Write-Host "Branch : $branch"
Write-Host "Scope  : VPP library provisioning + project named folder"
Write-Host ""

$libraryScript = Join-Path $PSScriptRoot "Apply-VppScopedArduinoLibraries.ps1"
$projectScript = Join-Path $PSScriptRoot "Apply-ProjectNamedFolder.ps1"

foreach ($script in @($libraryScript, $projectScript)) {
    if (-not (Test-Path -LiteralPath $script)) {
        throw "Falta script requerido: $script"
    }
}

Write-Host "=== APPLY VPP-SCOPED ARDUINO LIBRARIES ===" -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File $libraryScript -OpenPLCRepo $OpenPLCRepo
if ($LASTEXITCODE -ne 0) { throw "Fallo Apply-VppScopedArduinoLibraries.ps1" }

Write-Host "`n=== APPLY PROJECT NAMED FOLDER ===" -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File $projectScript -OpenPLCRepo $OpenPLCRepo
if ($LASTEXITCODE -ne 0) { throw "Fallo Apply-ProjectNamedFolder.ps1" }

Write-Host "`n=== TYPESCRIPT ===" -ForegroundColor Cyan
Push-Location $OpenPLCRepo
try {
    & npx.cmd tsc --noEmit --pretty false
    if ($LASTEXITCODE -ne 0) { throw "TypeScript fallo." }
} finally {
    Pop-Location
}
Write-Host "TYPESCRIPT=PASS" -ForegroundColor Green

Write-Host "`n=== DIFF CHECK ===" -ForegroundColor Cyan
& git -C $OpenPLCRepo diff --check
if ($LASTEXITCODE -ne 0) { throw "git diff --check fallo." }
Write-Host "DIFF_CHECK=PASS" -ForegroundColor Green

Write-Host "`n=== STATUS ===" -ForegroundColor Cyan
& git -C $OpenPLCRepo status --short --branch

Write-Host "`n=== BATCH RESULT ===" -ForegroundColor Cyan
Write-Host "VPP_LIBRARY_SCOPE_CODE=READY_FOR_RUNTIME_TEST"
Write-Host "PROJECT_NAMED_FOLDER_CODE=READY_FOR_UI_TEST"
Write-Host "FIRST_BUILD_SPEED_IMPROVEMENT=PENDING_MEASUREMENT"
Write-Host "PROJECT_FOLDER_UI=PENDING_RUNTIME_TEST"
Write-Host "FC02_REMOTE_INPUT=PENDING_24V_BENCH"
Write-Host "FC01_OUTPUT_FEEDBACK=PENDING_EXPLICIT_TEST"
Write-Host "OPENPLC_DEBUGGER_REMOTE_IO=PENDING_RUNTIME_TEST"
Write-Host "ALPHA7_NIGHT_BATCH_SOFTWARE=PASS" -ForegroundColor Green
