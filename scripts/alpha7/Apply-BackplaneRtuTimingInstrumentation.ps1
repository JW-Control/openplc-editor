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
    if ($first -lt 0) {
        throw "No se encontro anchor requerido: $Label"
    }

    $second = $Text.IndexOf($Old, $first + $Old.Length, [System.StringComparison]::Ordinal)
    if ($second -ge 0) {
        throw "Anchor no unico; se cancela para no parchear de mas: $Label"
    }

    return $Text.Substring(0, $first) + $New + $Text.Substring($first + $Old.Length)
}

$repo = (Resolve-Path $PlatformRepo).Path
$expectedBranch = 'v2.1.0-alpha.7/feature/openplc-backplane-validation'
$vppRoot = Join-Path $repo 'openplc-editor-installers/v4.2.7/vpp'
$halPath = Join-Path $vppRoot 'hal/jwplcbasic.cpp'
$manifestPath = Join-Path $vppRoot 'manifest.json'

if (-not (Test-Path $halPath)) { throw "No existe HAL: $halPath" }
if (-not (Test-Path $manifestPath)) { throw "No existe manifest: $manifestPath" }

Push-Location $repo
try {
    $branch = (git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer la rama de platform-jwplc.' }
    if ($branch -ne $expectedBranch) {
        throw "Rama inesperada: '$branch'. Esperada: '$expectedBranch'."
    }

    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host ' ALPHA7 - INSTRUMENTACION LATENCIA BACKPLANE RTU' -ForegroundColor Cyan
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host "Repo   : $repo"
    Write-Host "Branch : $branch"
    Write-Host 'Scope  : diagnostico solamente; NO cambia baud/timeout/frame gap'

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $hal = [System.IO.File]::ReadAllText($halPath)
    $hal = $hal.Replace("`r`n", "`n")

    if ($hal.Contains('JWPLC_ALPHA7_RTU_TIMING_DIAGNOSTICS')) {
        throw 'La instrumentacion de timing ya parece aplicada. No se vuelve a aplicar.'
    }

    $requiredAnchors = @(
        'JWPLC_REMOTE_WRITE_START',
        'requestWriteMultipleCoils',
        'JWPLC_REMOTE_READ_START',
        'requestReadDiscreteInputs',
        'jwplcApplyRemoteInputs',
        'jwplcPackRemoteOutputs',
        'jwplcServiceRemoteRtu'
    )
    foreach ($anchor in $requiredAnchors) {
        if (-not $hal.Contains($anchor)) {
            throw "HAL no coincide con A7.3.1; falta anchor: $anchor"
        }
    }

    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $currentVersion = [string]$manifest.package.version
    if ($currentVersion -ne '2.1.0-alpha.16') {
        throw "Version VPP inesperada: '$currentVersion'. Se esperaba 2.1.0-alpha.16 para generar alpha.17."
    }

    $includeAnchor = '#include <JWPLC_ModbusRTU.h>'
    $includeReplacement = @'
#include <JWPLC_ModbusRTU.h>

// A7 timing probe temporal. Mantener en 1 solamente para la VPP alpha.17
// de diagnostico. No altera baudrate, timeout, frame gap ni el ciclo RTU.
#ifndef JWPLC_ALPHA7_RTU_TIMING_DIAGNOSTICS
#define JWPLC_ALPHA7_RTU_TIMING_DIAGNOSTICS 1
#endif
'@
    $hal = Replace-ExactOnce $hal $includeAnchor $includeReplacement 'include JWPLC_ModbusRTU'

    $stateAnchor = 'static uint8_t jwplcRemoteOutputBits = 0;'
    $timingBlock = @'
static uint8_t jwplcRemoteOutputBits = 0;

#if JWPLC_ALPHA7_RTU_TIMING_DIAGNOSTICS
struct JWPLCRtuTimingStat
{
    uint32_t lastUs = 0;
    uint32_t maxUs = 0;
    uint64_t totalUs = 0;
    uint32_t count = 0;
};

static JWPLCRtuTimingStat jwplcTimingScanPeriod;
static JWPLCRtuTimingStat jwplcTimingServiceGap;
static JWPLCRtuTimingStat jwplcTimingFc02Rtt;
static JWPLCRtuTimingStat jwplcTimingFc02PollPeriod;
static JWPLCRtuTimingStat jwplcTimingInputToOutputUpdate;
static JWPLCRtuTimingStat jwplcTimingInputToRemoteQ;
static JWPLCRtuTimingStat jwplcTimingRemoteQToFc15;
static JWPLCRtuTimingStat jwplcTimingFc15Rtt;
static JWPLCRtuTimingStat jwplcTimingFc15Cycle;

static uint32_t jwplcTimingLastScanUs = 0;
static uint32_t jwplcTimingLastServiceUs = 0;
static uint32_t jwplcTimingFc02StartUs = 0;
static uint32_t jwplcTimingLastFc02StartUs = 0;
static uint32_t jwplcTimingFc15StartUs = 0;
static uint32_t jwplcTimingLastFc15StartUs = 0;
static uint32_t jwplcTimingInputChangeUs = 0;
static uint32_t jwplcTimingRemoteQChangeUs = 0;
static uint32_t jwplcTimingLastPrintMs = 0;

static bool jwplcTimingInputInitialized = false;
static bool jwplcTimingRemoteQInitialized = false;
static bool jwplcTimingPendingInputToOutputUpdate = false;
static bool jwplcTimingPendingInputToRemoteQ = false;
static bool jwplcTimingPendingRemoteQToFc15 = false;
static uint8_t jwplcTimingLastInputBits = 0;
static uint8_t jwplcTimingLastRemoteQBits = 0;

static uint32_t jwplcTimingInputChanges = 0;
static uint32_t jwplcTimingRemoteQChanges = 0;
static uint32_t jwplcTimingFc02Ok = 0;
static uint32_t jwplcTimingFc02Fail = 0;
static uint32_t jwplcTimingFc15Ok = 0;
static uint32_t jwplcTimingFc15Fail = 0;

static inline void jwplcTimingRecord(JWPLCRtuTimingStat &stat, uint32_t valueUs)
{
    stat.lastUs = valueUs;
    if (valueUs > stat.maxUs)
    {
        stat.maxUs = valueUs;
    }
    stat.totalUs += valueUs;
    ++stat.count;
}

static inline uint32_t jwplcTimingAverage(const JWPLCRtuTimingStat &stat)
{
    return stat.count == 0 ? 0U : (uint32_t)(stat.totalUs / stat.count);
}

static void jwplcTimingInit()
{
    // IMPORTANTE: durante este probe el Modbus RTU local/debugger de Serial0
    // debe estar OFF. El Backplane sigue exclusivamente sobre Serial2.
    Serial.begin(115200);
    delay(20);
    Serial.println();
    Serial.println("[RTU-TIMING] alpha17 diagnostics enabled; keep local Modbus RTU/Serial0 OFF");
}

static void jwplcTimingOnScanStart()
{
    const uint32_t nowUs = micros();
    if (jwplcTimingLastScanUs != 0)
    {
        jwplcTimingRecord(jwplcTimingScanPeriod, nowUs - jwplcTimingLastScanUs);
    }
    jwplcTimingLastScanUs = nowUs;
}

static void jwplcTimingOnService()
{
    const uint32_t nowUs = micros();
    if (jwplcTimingLastServiceUs != 0)
    {
        jwplcTimingRecord(jwplcTimingServiceGap, nowUs - jwplcTimingLastServiceUs);
    }
    jwplcTimingLastServiceUs = nowUs;
}

static void jwplcTimingObserveRemoteInputs(uint8_t bits)
{
    if (!jwplcTimingInputInitialized)
    {
        jwplcTimingLastInputBits = bits;
        jwplcTimingInputInitialized = true;
        return;
    }

    if (bits == jwplcTimingLastInputBits)
    {
        return;
    }

    jwplcTimingLastInputBits = bits;
    jwplcTimingInputChangeUs = micros();
    jwplcTimingPendingInputToOutputUpdate = true;
    jwplcTimingPendingInputToRemoteQ = true;
    ++jwplcTimingInputChanges;
}

static void jwplcTimingOnOutputUpdate()
{
    if (!jwplcTimingPendingInputToOutputUpdate)
    {
        return;
    }

    jwplcTimingRecord(
        jwplcTimingInputToOutputUpdate,
        micros() - jwplcTimingInputChangeUs);
    jwplcTimingPendingInputToOutputUpdate = false;
}

static void jwplcTimingObserveRemoteOutputs(uint8_t bits)
{
    if (!jwplcTimingRemoteQInitialized)
    {
        jwplcTimingLastRemoteQBits = bits;
        jwplcTimingRemoteQInitialized = true;
        return;
    }

    if (bits == jwplcTimingLastRemoteQBits)
    {
        return;
    }

    const uint32_t nowUs = micros();
    jwplcTimingLastRemoteQBits = bits;
    jwplcTimingRemoteQChangeUs = nowUs;
    jwplcTimingPendingRemoteQToFc15 = true;
    ++jwplcTimingRemoteQChanges;

    if (jwplcTimingPendingInputToRemoteQ)
    {
        jwplcTimingRecord(jwplcTimingInputToRemoteQ, nowUs - jwplcTimingInputChangeUs);
        jwplcTimingPendingInputToRemoteQ = false;
    }
}

static void jwplcTimingOnFc15Accepted()
{
    const uint32_t nowUs = micros();
    if (jwplcTimingLastFc15StartUs != 0)
    {
        jwplcTimingRecord(jwplcTimingFc15Cycle, nowUs - jwplcTimingLastFc15StartUs);
    }
    jwplcTimingLastFc15StartUs = nowUs;
    jwplcTimingFc15StartUs = nowUs;

    if (jwplcTimingPendingRemoteQToFc15)
    {
        jwplcTimingRecord(jwplcTimingRemoteQToFc15, nowUs - jwplcTimingRemoteQChangeUs);
        jwplcTimingPendingRemoteQToFc15 = false;
    }
}

static void jwplcTimingOnFc15Done(bool success)
{
    if (jwplcTimingFc15StartUs != 0)
    {
        jwplcTimingRecord(jwplcTimingFc15Rtt, micros() - jwplcTimingFc15StartUs);
        jwplcTimingFc15StartUs = 0;
    }

    if (success) ++jwplcTimingFc15Ok;
    else ++jwplcTimingFc15Fail;
}

static void jwplcTimingOnFc02Accepted()
{
    const uint32_t nowUs = micros();
    if (jwplcTimingLastFc02StartUs != 0)
    {
        jwplcTimingRecord(jwplcTimingFc02PollPeriod, nowUs - jwplcTimingLastFc02StartUs);
    }
    jwplcTimingLastFc02StartUs = nowUs;
    jwplcTimingFc02StartUs = nowUs;
}

static void jwplcTimingOnFc02Done(bool success)
{
    if (jwplcTimingFc02StartUs != 0)
    {
        jwplcTimingRecord(jwplcTimingFc02Rtt, micros() - jwplcTimingFc02StartUs);
        jwplcTimingFc02StartUs = 0;
    }

    if (success) ++jwplcTimingFc02Ok;
    else ++jwplcTimingFc02Fail;
}

static void jwplcTimingMaybePrint()
{
    const uint32_t nowMs = millis();
    if ((uint32_t)(nowMs - jwplcTimingLastPrintMs) < 2000U)
    {
        return;
    }
    jwplcTimingLastPrintMs = nowMs;

    Serial.printf(
        "[RTU-TIMING] scan_us=%lu/%lu/%lu(n=%lu) service_gap_us=%lu/%lu/%lu(n=%lu) fc02_poll_us=%lu/%lu/%lu(n=%lu)\r\n",
        (unsigned long)jwplcTimingScanPeriod.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingScanPeriod),
        (unsigned long)jwplcTimingScanPeriod.maxUs,
        (unsigned long)jwplcTimingScanPeriod.count,
        (unsigned long)jwplcTimingServiceGap.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingServiceGap),
        (unsigned long)jwplcTimingServiceGap.maxUs,
        (unsigned long)jwplcTimingServiceGap.count,
        (unsigned long)jwplcTimingFc02PollPeriod.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingFc02PollPeriod),
        (unsigned long)jwplcTimingFc02PollPeriod.maxUs,
        (unsigned long)jwplcTimingFc02PollPeriod.count);

    Serial.printf(
        "[RTU-TIMING] fc02_rtt_us=%lu/%lu/%lu in2out_us=%lu/%lu/%lu in2q_us=%lu/%lu/%lu q2fc15_us=%lu/%lu/%lu fc15_rtt_us=%lu/%lu/%lu fc15_cycle_us=%lu/%lu/%lu changes_in=%lu changes_q=%lu ok/fail_fc02=%lu/%lu ok/fail_fc15=%lu/%lu\r\n",
        (unsigned long)jwplcTimingFc02Rtt.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingFc02Rtt),
        (unsigned long)jwplcTimingFc02Rtt.maxUs,
        (unsigned long)jwplcTimingInputToOutputUpdate.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingInputToOutputUpdate),
        (unsigned long)jwplcTimingInputToOutputUpdate.maxUs,
        (unsigned long)jwplcTimingInputToRemoteQ.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingInputToRemoteQ),
        (unsigned long)jwplcTimingInputToRemoteQ.maxUs,
        (unsigned long)jwplcTimingRemoteQToFc15.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingRemoteQToFc15),
        (unsigned long)jwplcTimingRemoteQToFc15.maxUs,
        (unsigned long)jwplcTimingFc15Rtt.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingFc15Rtt),
        (unsigned long)jwplcTimingFc15Rtt.maxUs,
        (unsigned long)jwplcTimingFc15Cycle.lastUs,
        (unsigned long)jwplcTimingAverage(jwplcTimingFc15Cycle),
        (unsigned long)jwplcTimingFc15Cycle.maxUs,
        (unsigned long)jwplcTimingInputChanges,
        (unsigned long)jwplcTimingRemoteQChanges,
        (unsigned long)jwplcTimingFc02Ok,
        (unsigned long)jwplcTimingFc02Fail,
        (unsigned long)jwplcTimingFc15Ok,
        (unsigned long)jwplcTimingFc15Fail);
}
#else
static inline void jwplcTimingInit() {}
static inline void jwplcTimingOnScanStart() {}
static inline void jwplcTimingOnService() {}
static inline void jwplcTimingObserveRemoteInputs(uint8_t) {}
static inline void jwplcTimingOnOutputUpdate() {}
static inline void jwplcTimingObserveRemoteOutputs(uint8_t) {}
static inline void jwplcTimingOnFc15Accepted() {}
static inline void jwplcTimingOnFc15Done(bool) {}
static inline void jwplcTimingOnFc02Accepted() {}
static inline void jwplcTimingOnFc02Done(bool) {}
static inline void jwplcTimingMaybePrint() {}
#endif
'@
    $hal = Replace-ExactOnce $hal $stateAnchor $timingBlock 'estado RTU remoto'

    $hal = Replace-ExactOnce $hal '    JWPLC_ModbusRTU.task();' @'
    JWPLC_ModbusRTU.task();
    jwplcTimingOnService();
'@ 'service gap'

    $writeAcceptedOld = @'
        {
            jwplcRemotePhase = JWPLC_REMOTE_WRITE_WAIT;
        }
'@
    $writeAcceptedNew = @'
        {
            jwplcTimingOnFc15Accepted();
            jwplcRemotePhase = JWPLC_REMOTE_WRITE_WAIT;
        }
'@
    # Este bloque aparece dos veces (write/read). Se reemplaza de forma contextual.
    $writeContextOld = @'
                &jwplcRemoteOutputBits,
                JWPLC_MODBUS_TIMEOUT_MS))
        {
            jwplcRemotePhase = JWPLC_REMOTE_WRITE_WAIT;
        }
'@
    $writeContextNew = @'
                &jwplcRemoteOutputBits,
                JWPLC_MODBUS_TIMEOUT_MS))
        {
            jwplcTimingOnFc15Accepted();
            jwplcRemotePhase = JWPLC_REMOTE_WRITE_WAIT;
        }
'@
    $hal = Replace-ExactOnce $hal $writeContextOld $writeContextNew 'FC15 accepted'

    $writeWaitOld = @'
    case JWPLC_REMOTE_WRITE_WAIT:
        if (JWPLC_ModbusRTU.masterDone())
        {
            JWPLC_ModbusRTU.clearMasterResult();
            jwplcRemotePhase = JWPLC_REMOTE_READ_START;
        }
        break;
'@
    $writeWaitNew = @'
    case JWPLC_REMOTE_WRITE_WAIT:
        if (JWPLC_ModbusRTU.masterDone())
        {
            const bool jwplcFc15Succeeded = JWPLC_ModbusRTU.masterSucceeded();
            jwplcTimingOnFc15Done(jwplcFc15Succeeded);
            JWPLC_ModbusRTU.clearMasterResult();
            jwplcRemotePhase = JWPLC_REMOTE_READ_START;
        }
        break;
'@
    $hal = Replace-ExactOnce $hal $writeWaitOld $writeWaitNew 'FC15 done'

    $readContextOld = @'
                &jwplcRemoteInputBits,
                JWPLC_MODBUS_TIMEOUT_MS))
        {
            jwplcRemotePhase = JWPLC_REMOTE_READ_WAIT;
        }
'@
    $readContextNew = @'
                &jwplcRemoteInputBits,
                JWPLC_MODBUS_TIMEOUT_MS))
        {
            jwplcTimingOnFc02Accepted();
            jwplcRemotePhase = JWPLC_REMOTE_READ_WAIT;
        }
'@
    $hal = Replace-ExactOnce $hal $readContextOld $readContextNew 'FC02 accepted'

    $readWaitOld = @'
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
'@
    $readWaitNew = @'
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
'@
    $hal = Replace-ExactOnce $hal $readWaitOld $readWaitNew 'FC02 done/apply'

    $hal = Replace-ExactOnce $hal @'
void hardwareInit()
{
'@ @'
void hardwareInit()
{
    jwplcTimingInit();
'@ 'hardwareInit timing init'

    $hal = Replace-ExactOnce $hal @'
void updateInputBuffers()
{
'@ @'
void updateInputBuffers()
{
    jwplcTimingOnScanStart();
'@ 'scan start'

    $hal = Replace-ExactOnce $hal @'
void updateOutputBuffers()
{
'@ @'
void updateOutputBuffers()
{
    jwplcTimingOnOutputUpdate();
    if (jwplcRemoteEnabled)
    {
        jwplcTimingObserveRemoteOutputs(jwplcPackRemoteOutputs());
    }
'@ 'output observation'

    $outputTailOld = @'
    jwplcServiceRemoteRtu();
}
'@
    $outputTailNew = @'
    jwplcServiceRemoteRtu();
    jwplcTimingMaybePrint();
}
'@
    # Hay dos tails iguales. Seleccionamos explicitamente el que esta dentro de updateOutputBuffers.
    $outputFunctionIndex = $hal.IndexOf('void updateOutputBuffers()', [System.StringComparison]::Ordinal)
    if ($outputFunctionIndex -lt 0) { throw 'No se encontro updateOutputBuffers para agregar print.' }
    $tailIndex = $hal.IndexOf($outputTailOld, $outputFunctionIndex, [System.StringComparison]::Ordinal)
    if ($tailIndex -lt 0) { throw 'No se encontro tail de updateOutputBuffers.' }
    $hal = $hal.Substring(0, $tailIndex) + $outputTailNew + $hal.Substring($tailIndex + $outputTailOld.Length)

    [System.IO.File]::WriteAllText($halPath, $hal, $utf8NoBom)

    $manifestText = [System.IO.File]::ReadAllText($manifestPath).Replace("`r`n", "`n")
    $versionPattern = '"version"\s*:\s*"2\.1\.0-alpha\.16"'
    $matches = [regex]::Matches($manifestText, $versionPattern)
    if ($matches.Count -ne 1) {
        throw "Se esperaba una sola version 2.1.0-alpha.16 en manifest; encontradas: $($matches.Count)"
    }
    $manifestText = [regex]::Replace(
        $manifestText,
        $versionPattern,
        '"version": "2.1.0-alpha.17"',
        1)
    [System.IO.File]::WriteAllText($manifestPath, $manifestText, $utf8NoBom)

    Write-Host "`n=== DIFF CHECK ===" -ForegroundColor Cyan
    git diff --check -- $halPath $manifestPath
    if ($LASTEXITCODE -ne 0) { throw 'DIFF_CHECK=FAIL' }

    Write-Host "`n=== DIFF STAT ===" -ForegroundColor Cyan
    git diff --stat -- $halPath $manifestPath

    Write-Host "`n=== POLICY CHECK ===" -ForegroundColor Cyan
    Write-Host 'RTU_TIMING_INSTRUMENTATION=APPLIED' -ForegroundColor Green
    Write-Host 'VPP_VERSION=2.1.0-alpha.17' -ForegroundColor Green
    Write-Host 'RTU_BEHAVIOR_CHANGED=NO' -ForegroundColor Green
    Write-Host 'MODBUS_BAUD_CHANGED=NO' -ForegroundColor Green
    Write-Host 'MODBUS_TIMEOUT_CHANGED=NO' -ForegroundColor Green
    Write-Host 'MODBUS_FRAME_GAP_CHANGED=NO' -ForegroundColor Green
    Write-Host 'SERIAL0_DIAGNOSTICS=115200' -ForegroundColor Yellow
    Write-Host 'LOCAL_MODBUS_RTU_DURING_TIMING_CAPTURE=MUST_BE_OFF' -ForegroundColor Yellow
    Write-Host 'SIGNATURE=STALE_REQUIRES_REBUILD' -ForegroundColor Yellow
    Write-Host 'NEXT=BUILD_SIGN_INSTALL_ALPHA17' -ForegroundColor Cyan
}
finally {
    Pop-Location
}
