param(
    [Parameter(Mandatory = $true)]
    [string]$PlatformRepo
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Replace-ExactOnce {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$Old,
        [Parameter(Mandatory = $true)][string]$New,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $first = $Text.IndexOf($Old, [System.StringComparison]::Ordinal)
    if ($first -lt 0) { throw "No se encontro anchor requerido: $Label" }

    $second = $Text.IndexOf($Old, $first + $Old.Length, [System.StringComparison]::Ordinal)
    if ($second -ge 0) { throw "Anchor no unico; se cancela: $Label" }

    return $Text.Substring(0, $first) + $New + $Text.Substring($first + $Old.Length)
}

$repo = (Resolve-Path $PlatformRepo).Path
$expectedBranch = 'v2.1.0-alpha.7/feature/openplc-backplane-validation'
$halRel = 'openplc-editor-installers/v4.2.7/vpp/hal/jwplcbasic.cpp'
$manifestRel = 'openplc-editor-installers/v4.2.7/vpp/manifest.json'
$halPath = Join-Path $repo $halRel
$manifestPath = Join-Path $repo $manifestRel
$assetPath = Join-Path $PSScriptRoot 'assets/jwplc-rti-timing-probe.inc'

if (-not (Test-Path $assetPath)) { throw "No existe asset timing: $assetPath" }
if (-not (Test-Path $halPath)) { throw "No existe HAL: $halPath" }
if (-not (Test-Path $manifestPath)) { throw "No existe manifest: $manifestPath" }

Push-Location $repo
try {
    $branch = (git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer la rama de platform-jwplc.' }
    if ($branch -ne $expectedBranch) {
        throw "Rama inesperada '$branch'. Esperada '$expectedBranch'."
    }

    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host ' ALPHA7 - BACKPLANE RTU TIMING PROBE' -ForegroundColor Cyan
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host "Repo   : $repo"
    Write-Host "Branch : $branch"
    Write-Host 'Scope  : instrumentacion solamente'

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $hal = [System.IO.File]::ReadAllText($halPath).Replace("`r`n", "`n")

    if ($hal.Contains('JWPLC_ALPHA7_RTU_TIMING_DIAGNOSTICS')) {
        throw 'Timing probe ya aplicado; no se aplica dos veces.'
    }

    foreach ($anchor in @(
        'JWPLC_REMOTE_WRITE_START',
        'requestWriteMultipleCoils',
        'JWPLC_REMOTE_READ_START',
        'requestReadDiscreteInputs',
        'jwplcApplyRemoteInputs',
        'jwplcPackRemoteOutputs',
        'jwplcServiceRemoteRtu')) {
        if (-not $hal.Contains($anchor)) {
            throw "HAL no coincide con A7.3.1; falta anchor: $anchor"
        }
    }

    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $currentVersion = [string]$manifest.package.version
    if ($currentVersion -ne '2.1.0-alpha.16') {
        throw "VPP inesperada '$currentVersion'. Se esperaba 2.1.0-alpha.16."
    }

    $includeOld = '#include <JWPLC_ModbusRTU.h>'
    $includeNew = @'
#include <JWPLC_ModbusRTU.h>

// Probe temporal Alpha7.17: solo mide. No cambia parametros RTU.
#ifndef JWPLC_ALPHA7_RTU_TIMING_DIAGNOSTICS
#define JWPLC_ALPHA7_RTU_TIMING_DIAGNOSTICS 1
#endif
'@
    $hal = Replace-ExactOnce $hal $includeOld $includeNew 'include ModbusRTU'

    $probe = [System.IO.File]::ReadAllText($assetPath).Replace("`r`n", "`n").TrimEnd()
    $stateOld = 'static uint8_t jwplcRemoteOutputBits = 0;'
    $stateNew = $stateOld + "`n`n" + $probe
    $hal = Replace-ExactOnce $hal $stateOld $stateNew 'estado remoto + timing probe'

    $hal = Replace-ExactOnce $hal '    JWPLC_ModbusRTU.task();' @'
    JWPLC_ModbusRTU.task();
    jwplcTimingOnService();
'@ 'service timestamp'

    $hal = Replace-ExactOnce $hal @'
                &jwplcRemoteOutputBits,
                JWPLC_MODBUS_TIMEOUT_MS))
        {
            jwplcRemotePhase = JWPLC_REMOTE_WRITE_WAIT;
        }
'@ @'
                &jwplcRemoteOutputBits,
                JWPLC_MODBUS_TIMEOUT_MS))
        {
            jwplcTimingOnFc15Accepted();
            jwplcRemotePhase = JWPLC_REMOTE_WRITE_WAIT;
        }
'@ 'FC15 request accepted'

    $hal = Replace-ExactOnce $hal @'
    case JWPLC_REMOTE_WRITE_WAIT:
        if (JWPLC_ModbusRTU.masterDone())
        {
            JWPLC_ModbusRTU.clearMasterResult();
            jwplcRemotePhase = JWPLC_REMOTE_READ_START;
        }
        break;
'@ @'
    case JWPLC_REMOTE_WRITE_WAIT:
        if (JWPLC_ModbusRTU.masterDone())
        {
            const bool jwplcFc15Succeeded = JWPLC_ModbusRTU.masterSucceeded();
            jwplcTimingOnFc15Done(jwplcFc15Succeeded);
            JWPLC_ModbusRTU.clearMasterResult();
            jwplcRemotePhase = JWPLC_REMOTE_READ_START;
        }
        break;
'@ 'FC15 completion'

    $hal = Replace-ExactOnce $hal @'
                &jwplcRemoteInputBits,
                JWPLC_MODBUS_TIMEOUT_MS))
        {
            jwplcRemotePhase = JWPLC_REMOTE_READ_WAIT;
        }
'@ @'
                &jwplcRemoteInputBits,
                JWPLC_MODBUS_TIMEOUT_MS))
        {
            jwplcTimingOnFc02Accepted();
            jwplcRemotePhase = JWPLC_REMOTE_READ_WAIT;
        }
'@ 'FC02 request accepted'

    $hal = Replace-ExactOnce $hal @'
    case JWPLC_REMOTE_READ_WAIT:
        if (JWPLC_ModbusRTU.masterDone())
        {
            if (JWPLC_ModbusRTU.masterSucceeded())
            {
                jwplcApplyRemoteInputs();
            }

            JWPLC_ModbusRTU.clearMasterResult();
            jwplcRemotePhase = JWPLC_REMOTE_WRITE_START;
        }
        break;
'@ @'
    case JWPLC_REMOTE_READ_WAIT:
        if (JWPLC_ModbusRTU.masterDone())
        {
            const bool jwplcFc02Succeeded = JWPLC_ModbusRTU.masterSucceeded();
            jwplcTimingOnFc02Done(jwplcFc02Succeeded);
            if (jwplcFc02Succeeded)
            {
                jwplcTimingObserveRemoteInputs(jwplcRemoteInputBits);
                jwplcApplyRemoteInputs();
            }

            JWPLC_ModbusRTU.clearMasterResult();
            jwplcRemotePhase = JWPLC_REMOTE_WRITE_START;
        }
        break;
'@ 'FC02 completion/apply'

    $hal = Replace-ExactOnce $hal "void hardwareInit()`n{" @'
void hardwareInit()
{
    jwplcTimingInit();
'@ 'timing Serial0 init'

    $hal = Replace-ExactOnce $hal "void updateInputBuffers()`n{" @'
void updateInputBuffers()
{
    jwplcTimingOnScanStart();
'@ 'scan timestamp'

    $hal = Replace-ExactOnce $hal "void updateOutputBuffers()`n{" @'
void updateOutputBuffers()
{
    jwplcTimingOnOutputUpdate();
    if (jwplcRemoteEnabled)
    {
        jwplcTimingObserveRemoteOutputs(jwplcPackRemoteOutputs());
    }
'@ 'output timestamp'

    $outputFunctionIndex = $hal.IndexOf('void updateOutputBuffers()', [System.StringComparison]::Ordinal)
    if ($outputFunctionIndex -lt 0) { throw 'No se encontro updateOutputBuffers.' }
    $tailOld = "    jwplcServiceRemoteRtu();`n}"
    $tailIndex = $hal.IndexOf($tailOld, $outputFunctionIndex, [System.StringComparison]::Ordinal)
    if ($tailIndex -lt 0) { throw 'No se encontro tail de updateOutputBuffers.' }
    $tailNew = "    jwplcServiceRemoteRtu();`n    jwplcTimingMaybePrint();`n}"
    $hal = $hal.Substring(0, $tailIndex) + $tailNew + $hal.Substring($tailIndex + $tailOld.Length)

    [System.IO.File]::WriteAllText($halPath, $hal, $utf8NoBom)

    $manifestText = [System.IO.File]::ReadAllText($manifestPath).Replace("`r`n", "`n")
    $versionRegex = New-Object System.Text.RegularExpressions.Regex('"version"\s*:\s*"2\.1\.0-alpha\.16"')
    $matches = $versionRegex.Matches($manifestText)
    if ($matches.Count -ne 1) {
        throw "Se esperaba una sola version alpha.16 en manifest; encontradas: $($matches.Count)"
    }
    $manifestText = $versionRegex.Replace($manifestText, '"version": "2.1.0-alpha.17"', 1)
    [System.IO.File]::WriteAllText($manifestPath, $manifestText, $utf8NoBom)

    Write-Host "`n=== CONSTANTES RTU ===" -ForegroundColor Cyan
    Select-String -Path $halPath -Pattern 'JWPLC_MODBUS_BAUD|JWPLC_MODBUS_TIMEOUT_MS|JWPLC_MODBUS_FRAME_GAP_MS' |
        ForEach-Object { $_.Line.Trim() }

    Write-Host "`n=== DIFF CHECK ===" -ForegroundColor Cyan
    git diff --check -- $halRel $manifestRel
    if ($LASTEXITCODE -ne 0) { throw 'DIFF_CHECK=FAIL' }
    Write-Host 'DIFF_CHECK=PASS' -ForegroundColor Green

    Write-Host "`n=== DIFF STAT ===" -ForegroundColor Cyan
    git diff --stat -- $halRel $manifestRel

    Write-Host "`n=== RESULTADO ===" -ForegroundColor Cyan
    Write-Host 'RTU_TIMING_PROBE=APPLIED' -ForegroundColor Green
    Write-Host 'VPP_VERSION=2.1.0-alpha.17' -ForegroundColor Green
    Write-Host 'RTU_BEHAVIOR_CHANGED=NO' -ForegroundColor Green
    Write-Host 'BAUD_TIMEOUT_FRAME_GAP_CHANGED=NO' -ForegroundColor Green
    Write-Host 'TIMING_REPORT_PERIOD_MS=2000' -ForegroundColor Green
    Write-Host 'SERIAL0_TIMING_BAUD=115200' -ForegroundColor Green
    Write-Host 'LOCAL_MODBUS_RTU_FOR_CAPTURE=MUST_BE_OFF' -ForegroundColor Yellow
    Write-Host 'SIGNATURE=STALE_REQUIRES_REBUILD' -ForegroundColor Yellow
    Write-Host 'NEXT=BUILD_SIGN_INSTALL_ALPHA17' -ForegroundColor Cyan
}
finally {
    Pop-Location
}
