param(
    [string]$OpenPLCRepo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"

function Normalize-Lf([string]$Text) {
    return $Text.Replace("`r`n", "`n").Replace("`r", "`n")
}

function Replace-Once([string]$Text, [string]$Old, [string]$New, [string]$Label) {
    $oldN = Normalize-Lf $Old
    $newN = Normalize-Lf $New
    $count = ([regex]::Matches($Text, [regex]::Escape($oldN))).Count
    if ($count -ne 1) {
        throw "No se encontro un ancla unica para $Label. Coincidencias: $count"
    }
    return $Text.Replace($oldN, $newN)
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Text, $utf8NoBom)
}

$OpenPLCRepo = (Resolve-Path $OpenPLCRepo).Path
$expectedBranch = "develop/alpha7-openplc-remote-io-rtu"
$branch = (& git -C $OpenPLCRepo branch --show-current).Trim()
if ($branch -ne $expectedBranch) {
    throw "Branch OpenPLC inesperado. Esperado: $expectedBranch ; actual: $branch"
}

$portRel = "src/middleware/shared/ports/compiler-platform-port.ts"
$pipelineRel = "src/backend/shared/compile/pipeline.ts"
$adapterRel = "src/backend/editor/compiler/editor-compiler-platform-port.ts"
$compilerRel = "src/backend/editor/compiler/compiler-module.ts"

$portPath = Join-Path $OpenPLCRepo $portRel
$pipelinePath = Join-Path $OpenPLCRepo $pipelineRel
$adapterPath = Join-Path $OpenPLCRepo $adapterRel
$compilerPath = Join-Path $OpenPLCRepo $compilerRel

foreach ($path in @($portPath, $pipelinePath, $adapterPath, $compilerPath)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "No existe archivo esperado: $path"
    }
}

$marker = "Alpha7 VPP library scope: VPP targets use manifest libraries only."
$compilerText = Normalize-Lf ([System.IO.File]::ReadAllText($compilerPath))
if ($compilerText.Contains($marker)) {
    Write-Host "VPP_SCOPED_ARDUINO_LIBRARIES=ALREADY_APPLIED" -ForegroundColor Yellow
    exit 0
}

# 1) Port contract: add an explicit compatibility switch. Default semantics are
# preserved by the editor handler when the field is omitted.
$portText = Normalize-Lf ([System.IO.File]::ReadAllText($portPath))
$portOld = @'
  extraLibraries?: string[]
}
'@
$portNew = @'
  extraLibraries?: string[]
  /**
   * Keep the editor's historical GLOBAL_LIBRARIES compatibility set.
   * VPP targets set this to false because their manifest already owns the
   * per-board dependency contract. Static/built-in boards leave it enabled.
   */
  includeLegacyGlobalLibraries?: boolean
}
'@
$portText = Replace-Once $portText $portOld $portNew "InstallArduinoLibArgs compatibility switch"

# 2) Shared pipeline: VPP is already resolved on BoardHalsBuildEntry. This is
# the narrowest reliable discriminator and does not special-case JWPLC names.
$pipelineText = Normalize-Lf ([System.IO.File]::ReadAllText($pipelinePath))
$pipelineOld = @'
  const libInstall = await port.installArduinoLib(
    { libId: '', extraLibraries: boardEntry.extra_libraries ?? [] },
    makePlatformLog(emit, 'lib-install'),
  )
'@
$pipelineNew = @'
  const libInstall = await port.installArduinoLib(
    {
      libId: '',
      extraLibraries: boardEntry.extra_libraries ?? [],
      // Alpha7: VPP manifests are the dependency source of truth. Do not make
      // a JWPLC/Opta/etc. VPP pay the one-time install cost for unrelated
      // legacy boards (P1AM, Portenta, CONTROLLINO, STM32, ...).
      includeLegacyGlobalLibraries: !Boolean(boardEntry.vpp),
    },
    makePlatformLog(emit, 'lib-install'),
  )
'@
$pipelineText = Replace-Once $pipelineText $pipelineOld $pipelineNew "pipeline VPP library scope"

# 3) Editor adapter: thread the policy bit into the legacy handler.
$adapterText = Normalize-Lf ([System.IO.File]::ReadAllText($adapterPath))
$adapterOld = @'
        await handlers.handleLibraryInstallation(args.extraLibraries ?? [], (chunk, level) => {
          const message = typeof chunk === 'string' ? chunk : chunk.toString()
          log(message, level ?? 'info')
        })
'@
$adapterNew = @'
        await handlers.handleLibraryInstallation(
          args.extraLibraries ?? [],
          (chunk, level) => {
            const message = typeof chunk === 'string' ? chunk : chunk.toString()
            log(message, level ?? 'info')
          },
          args.includeLegacyGlobalLibraries ?? true,
        )
'@
$adapterText = Replace-Once $adapterText $adapterOld $adapterNew "adapter library policy passthrough"

# 4) Compiler handler: retain legacy globals by default for all pre-existing
# callers, but allow the VPP pipeline to opt out explicitly.
$compilerOld = @'
  async handleLibraryInstallation(extraLibraries: string[], handleOutputData: HandleOutputDataCallback) {
    const requiredLibraries = Array.from(new Set([...CompilerModule.GLOBAL_LIBRARIES, ...extraLibraries]))

    if (extraLibraries.length > 0) {
      handleOutputData(`Per-board libraries: ${extraLibraries.join(', ')}`, 'info')
    }
'@
$compilerNew = @'
  async handleLibraryInstallation(
    extraLibraries: string[],
    handleOutputData: HandleOutputDataCallback,
    includeLegacyGlobalLibraries = true,
  ) {
    // Alpha7 VPP library scope: VPP targets use manifest libraries only.
    // Static/built-in boards keep the historical compatibility list so this
    // change cannot regress their first-build provisioning behavior.
    const legacyLibraries = includeLegacyGlobalLibraries ? CompilerModule.GLOBAL_LIBRARIES : []
    const requiredLibraries = Array.from(new Set([...legacyLibraries, ...extraLibraries]))

    if (!includeLegacyGlobalLibraries) {
      handleOutputData(
        'VPP library scope: skipping unrelated legacy global Arduino libraries; using manifest dependencies only.',
        'info',
      )
    }

    if (extraLibraries.length > 0) {
      handleOutputData(`Per-board libraries: ${extraLibraries.join(', ')}`, 'info')
    }
'@
$compilerText = Replace-Once $compilerText $compilerOld $compilerNew "compiler library scope handler"

Write-Utf8NoBom $portPath ($portText.TrimEnd() + "`n")
Write-Utf8NoBom $pipelinePath ($pipelineText.TrimEnd() + "`n")
Write-Utf8NoBom $adapterPath ($adapterText.TrimEnd() + "`n")
Write-Utf8NoBom $compilerPath ($compilerText.TrimEnd() + "`n")

Write-Host "`n=== DIFF CHECK ===" -ForegroundColor Cyan
& git -C $OpenPLCRepo diff --check -- $portRel $pipelineRel $adapterRel $compilerRel
if ($LASTEXITCODE -ne 0) {
    throw "git diff --check fallo para el scope de librerias VPP"
}

Write-Host "`n=== DIFF STAT ===" -ForegroundColor Cyan
& git -C $OpenPLCRepo diff --stat -- $portRel $pipelineRel $adapterRel $compilerRel

Write-Host "`n=== POLICY CHECK ===" -ForegroundColor Cyan
$compilerFinal = Normalize-Lf ([System.IO.File]::ReadAllText($compilerPath))
$pipelineFinal = Normalize-Lf ([System.IO.File]::ReadAllText($pipelinePath))
$portFinal = Normalize-Lf ([System.IO.File]::ReadAllText($portPath))
$adapterFinal = Normalize-Lf ([System.IO.File]::ReadAllText($adapterPath))

if (-not $compilerFinal.Contains($marker)) { throw "Falta marker de scope VPP en compiler-module.ts" }
if (-not $pipelineFinal.Contains("includeLegacyGlobalLibraries: !Boolean(boardEntry.vpp)")) { throw "Pipeline no discrimina VPP" }
if (-not $portFinal.Contains("includeLegacyGlobalLibraries?: boolean")) { throw "Port contract no expone policy" }
if (-not $adapterFinal.Contains("args.includeLegacyGlobalLibraries ?? true")) { throw "Adapter no propaga policy" }

Write-Host "VPP_MANIFEST_LIBRARIES_ONLY=YES"
Write-Host "VPP_LEGACY_GLOBAL_LIBRARIES=SKIPPED"
Write-Host "STATIC_BOARD_LEGACY_BEHAVIOR=PRESERVED"
Write-Host "JWPLC_AUTOLOAD_CHANGED=NO"
Write-Host "VPP_SCOPED_ARDUINO_LIBRARIES=APPLIED" -ForegroundColor Green
Write-Host "NEXT=TYPESCRIPT_AND_FIRST_BUILD_LOG" -ForegroundColor Yellow
