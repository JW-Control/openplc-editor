param(
    [string]$OpenPLCRepo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,

    [Parameter(Mandatory = $true)]
    [string]$PlatformRepo
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Normalize-Lf([string]$Text) {
    return $Text.Replace("`r`n", "`n").Replace("`r", "`n")
}

function Replace-ExactOnce {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$Old,
        [Parameter(Mandatory = $true)][string]$New,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $oldNormalized = Normalize-Lf $Old
    $newNormalized = Normalize-Lf $New
    $first = $Text.IndexOf($oldNormalized, [System.StringComparison]::Ordinal)
    if ($first -lt 0) {
        throw "No se encontro anchor requerido: $Label"
    }

    $second = $Text.IndexOf(
        $oldNormalized,
        $first + $oldNormalized.Length,
        [System.StringComparison]::Ordinal)
    if ($second -ge 0) {
        throw "Anchor no unico; se cancela: $Label"
    }

    return $Text.Substring(0, $first) +
        $newNormalized +
        $Text.Substring($first + $oldNormalized.Length)
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Text, $utf8NoBom)
}

$openplc = (Resolve-Path $OpenPLCRepo).Path
$platform = (Resolve-Path $PlatformRepo).Path

$expectedOpenPLCBranch = 'develop/alpha7-openplc-remote-io-rtu'
$expectedPlatformBranch = 'v2.1.0-alpha.7/feature/openplc-backplane-validation'

$headerRel = 'resources/sources/arduino/openplc.h'
$baremetalRel = 'resources/sources/Baremetal/Baremetal.ino'
$halRel = 'openplc-editor-installers/v4.2.7/vpp/hal/jwplcbasic.cpp'
$manifestRel = 'openplc-editor-installers/v4.2.7/vpp/manifest.json'

$headerPath = Join-Path $openplc $headerRel
$baremetalPath = Join-Path $openplc $baremetalRel
$halPath = Join-Path $platform $halRel
$manifestPath = Join-Path $platform $manifestRel

foreach ($path in @($headerPath, $baremetalPath, $halPath, $manifestPath)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "No existe archivo esperado: $path"
    }
}

$openplcBranch = (& git -C $openplc branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo leer la rama de openplc-editor.'
}
if ($openplcBranch -ne $expectedOpenPLCBranch) {
    throw "Rama OpenPLC inesperada '$openplcBranch'. Esperada '$expectedOpenPLCBranch'."
}

$platformBranch = (& git -C $platform branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo leer la rama de platform-jwplc.'
}
if ($platformBranch -ne $expectedPlatformBranch) {
    throw "Rama platform inesperada '$platformBranch'. Esperada '$expectedPlatformBranch'."
}

Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' ALPHA7.18 - COOPERATIVE BACKPLANE IDLE SERVICE' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host "OpenPLC : $openplc"
Write-Host "Platform: $platform"
Write-Host 'Scope   : cadence del servicio RTU; sin concurrencia'

$header = Normalize-Lf ([System.IO.File]::ReadAllText($headerPath))
$baremetal = Normalize-Lf ([System.IO.File]::ReadAllText($baremetalPath))
$hal = Normalize-Lf ([System.IO.File]::ReadAllText($halPath))
$manifestText = Normalize-Lf ([System.IO.File]::ReadAllText($manifestPath))
$manifest = $manifestText | ConvertFrom-Json
$currentVersion = [string]$manifest.package.version

$baremetalMarker = 'Alpha7.18 cooperative idle hardware service hook.'
$halMarker = 'Alpha7.18: atiende el Backplane durante el tiempo ocioso del scan.'
$headerApplied = $header.Contains('void hardwareService();')
$baremetalApplied = $baremetal.Contains($baremetalMarker)
$halApplied = $hal.Contains($halMarker)
$manifestApplied = $currentVersion -eq '2.1.0-alpha.18'

if ($headerApplied -and $baremetalApplied -and $halApplied -and $manifestApplied) {
    Write-Host 'ALPHA18_IDLE_SERVICE=ALREADY_APPLIED' -ForegroundColor Yellow
    exit 0
}

if ($headerApplied -or $baremetalApplied -or $halApplied -or $manifestApplied) {
    throw 'Estado Alpha18 parcial detectado; se cancela para evitar una segunda aplicacion incompleta.'
}

if ($currentVersion -ne '2.1.0-alpha.17') {
    throw "VPP inesperada '$currentVersion'. Se esperaba 2.1.0-alpha.17."
}

foreach ($anchor in @(
    'JWPLC_ALPHA7_RTU_TIMING_DIAGNOSTICS',
    'jwplcServiceRemoteRtu',
    'jwplcRemoteEnabled',
    'JWPLC_ModbusRTU.task()',
    'alpha17 diagnostics enabled')) {
    if (-not $hal.Contains($anchor)) {
        throw "HAL no coincide con Alpha17 instrumentada; falta anchor: $anchor"
    }
}

# 1) Contrato HAL compatible: todas las placas reciben un hook opcional.
$headerOld = @'
void hardwareInit();
void updateInputBuffers();
void updateOutputBuffers();
'@
$headerNew = @'
void hardwareInit();
// Optional nonblocking hook called only while the PLC scan is idle.
// Baremetal.ino supplies a weak no-op default for existing HALs.
void hardwareService();
void updateInputBuffers();
void updateOutputBuffers();
'@
$header = Replace-ExactOnce `
    -Text $header `
    -Old $headerOld `
    -New $headerNew `
    -Label 'hardwareService HAL contract'

# 2) Implementacion weak/no-op: conserva compatibilidad con todos los HAL.
$baremetalHookOld = @'
extern uint8_t pinMask_DOUT[];
extern uint8_t pinMask_AOUT[];

// ---------------------------------------------------------------------------
// Scan cycle delay setup
'@
$baremetalHookNew = @'
extern uint8_t pinMask_DOUT[];
extern uint8_t pinMask_AOUT[];

// Alpha7.18 cooperative idle hardware service hook.
// Existing HALs remain source-compatible through this weak no-op default.
// A HAL may override it with a short, nonblocking implementation.
void __attribute__((weak)) hardwareService()
{
}

// ---------------------------------------------------------------------------
// Scan cycle delay setup
'@
$baremetal = Replace-ExactOnce `
    -Text $baremetal `
    -Old $baremetalHookOld `
    -New $baremetalHookNew `
    -Label 'weak idle hardware hook'

# 3) El hook corre solo si el scan aun no esta vencido. No hay task paralela.
$loopOld = @'
    if ((micros() - last_run) >= scan_cycle)
    {
        scheduler();
        last_run += scan_cycle;
    }

    #ifdef MODBUS_ENABLED
'@
$loopNew = @'
    if ((micros() - last_run) >= scan_cycle)
    {
        scheduler();
        last_run += scan_cycle;
    }
    else
    {
        // Cooperatively service nonblocking HAL work only in PLC idle time.
        hardwareService();
    }

    #ifdef MODBUS_ENABLED
'@
$baremetal = Replace-ExactOnce `
    -Text $baremetal `
    -Old $loopOld `
    -New $loopNew `
    -Label 'idle branch in Baremetal loop'

# 4) Override JWPLC: maximo una atencion idle por milisegundo.
$hardwareInitOld = 'void hardwareInit()' + "`n" + '{'
$hardwareInitNew = @'
// Alpha7.18: atiende el Backplane durante el tiempo ocioso del scan.
// Es cooperativo, single-thread y no bloqueante. Los hooks existentes en
// updateInputBuffers/updateOutputBuffers se conservan como puntos de respaldo.
static constexpr uint32_t JWPLC_REMOTE_IDLE_SERVICE_PERIOD_US = 1000UL;

void hardwareService()
{
    if (!jwplcRemoteEnabled)
    {
        return;
    }

    static uint32_t lastIdleServiceUs = 0;
    const uint32_t nowUs = micros();
    if (lastIdleServiceUs != 0 &&
        (uint32_t)(nowUs - lastIdleServiceUs) < JWPLC_REMOTE_IDLE_SERVICE_PERIOD_US)
    {
        return;
    }

    lastIdleServiceUs = nowUs;
    jwplcServiceRemoteRtu();
}

void hardwareInit()
{
'@
$hal = Replace-ExactOnce `
    -Text $hal `
    -Old $hardwareInitOld `
    -New $hardwareInitNew `
    -Label 'JWPLC hardwareService override'

# 5) Mantener el probe y distinguir inequívocamente la captura Alpha18.
$hal = Replace-ExactOnce `
    -Text $hal `
    -Old '// Probe temporal Alpha7.17: solo mide. No cambia parametros RTU.' `
    -New '// Probe temporal Alpha7.18: mide la nueva cadencia. No cambia parametros RTU.' `
    -Label 'timing probe Alpha18 comment'

$hal = Replace-ExactOnce `
    -Text $hal `
    -Old '[RTU-TIMING] alpha17 diagnostics enabled; keep local Modbus RTU/Serial0 OFF' `
    -New '[RTU-TIMING] alpha18 idle-service diagnostics enabled; keep local Modbus RTU/Serial0 OFF' `
    -Label 'timing probe Alpha18 banner'

$versionPattern = '"version"\s*:\s*"2\.1\.0-alpha\.17"'
$versionRegex = New-Object System.Text.RegularExpressions.Regex -ArgumentList $versionPattern
$versionMatches = $versionRegex.Matches($manifestText)
if ($versionMatches.Count -ne 1) {
    throw "Se esperaba una sola version alpha.17 en manifest; encontradas: $($versionMatches.Count)"
}
$manifestText = $versionRegex.Replace(
    $manifestText,
    '"version": "2.1.0-alpha.18"'.Replace('\', ''),
    1)

Write-Utf8NoBom $headerPath ($header.TrimEnd() + "`n")
Write-Utf8NoBom $baremetalPath ($baremetal.TrimEnd() + "`n")
Write-Utf8NoBom $halPath ($hal.TrimEnd() + "`n")
Write-Utf8NoBom $manifestPath ($manifestText.TrimEnd() + "`n")

Write-Host "`n=== DIFF CHECK OPENPLC ===" -ForegroundColor Cyan
& git -C $openplc diff --check -- $headerRel $baremetalRel
if ($LASTEXITCODE -ne 0) {
    throw 'OPENPLC_DIFF_CHECK=FAIL'
}
Write-Host 'OPENPLC_DIFF_CHECK=PASS' -ForegroundColor Green

Write-Host "`n=== DIFF CHECK PLATFORM ===" -ForegroundColor Cyan
& git -C $platform diff --check -- $halRel $manifestRel
if ($LASTEXITCODE -ne 0) {
    throw 'PLATFORM_DIFF_CHECK=FAIL'
}
Write-Host 'PLATFORM_DIFF_CHECK=PASS' -ForegroundColor Green

Write-Host "`n=== DIFF STAT OPENPLC ===" -ForegroundColor Cyan
& git -C $openplc diff --stat -- $headerRel $baremetalRel

Write-Host "`n=== DIFF STAT PLATFORM ===" -ForegroundColor Cyan
& git -C $platform diff --stat -- $halRel $manifestRel

Write-Host "`n=== CONSTANTES RTU ===" -ForegroundColor Cyan
Select-String `
    -LiteralPath $halPath `
    -Pattern 'JWPLC_MODBUS_BAUD|JWPLC_MODBUS_TIMEOUT_MS|JWPLC_MODBUS_FRAME_GAP_MS|JWPLC_REMOTE_IDLE_SERVICE_PERIOD_US' |
    ForEach-Object { $_.Line.Trim() }

$headerFinal = Normalize-Lf ([System.IO.File]::ReadAllText($headerPath))
$baremetalFinal = Normalize-Lf ([System.IO.File]::ReadAllText($baremetalPath))
$halFinal = Normalize-Lf ([System.IO.File]::ReadAllText($halPath))
$manifestFinal = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

if (-not $headerFinal.Contains('void hardwareService();')) {
    throw 'Falta contrato hardwareService.'
}
if (-not $baremetalFinal.Contains($baremetalMarker)) {
    throw 'Falta implementacion weak del idle hook.'
}
if (-not $baremetalFinal.Contains('hardwareService();')) {
    throw 'El loop no llama hardwareService.'
}
if (-not $halFinal.Contains($halMarker)) {
    throw 'Falta override JWPLC del idle hook.'
}
if ([string]$manifestFinal.package.version -ne '2.1.0-alpha.18') {
    throw 'El manifest no quedo en 2.1.0-alpha.18.'
}

Write-Host "`n=== RESULTADO ===" -ForegroundColor Cyan
Write-Host 'ALPHA18_IDLE_SERVICE=APPLIED' -ForegroundColor Green
Write-Host 'VPP_VERSION=2.1.0-alpha.18' -ForegroundColor Green
Write-Host 'SERVICE_MODEL=COOPERATIVE_SINGLE_THREAD' -ForegroundColor Green
Write-Host 'SERVICE_ONLY_WHEN_SCAN_NOT_DUE=YES' -ForegroundColor Green
Write-Host 'IDLE_SERVICE_PERIOD_US=1000' -ForegroundColor Green
Write-Host 'EXISTING_SCAN_HOOKS=PRESERVED' -ForegroundColor Green
Write-Host 'FREERTOS_TASK_ADDED=NO' -ForegroundColor Green
Write-Host 'RTU_BAUD_TIMEOUT_FRAME_GAP_CHANGED=NO' -ForegroundColor Green
Write-Host 'LOCAL_MODBUS_RTU_FOR_CAPTURE=MUST_BE_OFF' -ForegroundColor Yellow
Write-Host 'EDITOR_RESTART_REQUIRED=YES' -ForegroundColor Yellow
Write-Host 'SIGNATURE=STALE_REQUIRES_REBUILD' -ForegroundColor Yellow
Write-Host 'NEXT=REVIEW_ALPHA18_DIFF' -ForegroundColor Cyan
