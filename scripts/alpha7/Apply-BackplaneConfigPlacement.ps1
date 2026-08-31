param(
    [string]$OpenPLCRepo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"

function Normalize-Lf([string]$Text) {
    return $Text.Replace("`r`n", "`n").Replace("`r", "`n")
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

$relPath = "src/frontend/components/_features/[workspace]/editor/device/configuration/vendor-screen/layouts/module-slots-layout.tsx"
$path = Join-Path $OpenPLCRepo $relPath
if (-not (Test-Path -LiteralPath $path)) {
    throw "No existe archivo esperado: $path"
}

$text = Normalize-Lf ([System.IO.File]::ReadAllText($path))

$placementMarker = "Alpha7 UX: module configuration belongs directly under the module picker."
if ($text.Contains($placementMarker)) {
    Write-Host "BACKPLANE_CONFIG_PLACEMENT=ALREADY_APPLIED" -ForegroundColor Yellow
    exit 0
}

$clusterStartMarker = "                  {/* Defensive hint: manifest declared a configScreen path"
$clusterEndMarker = "                </div>`n              ) : ("
$insertAnchor = "                  })()}`n`n                  {selectedModule && ("

$clusterStart = $text.IndexOf($clusterStartMarker, [System.StringComparison]::Ordinal)
if ($clusterStart -lt 0) {
    throw "No se encontro inicio del bloque Configuration/defensive hint."
}

$clusterEnd = $text.IndexOf($clusterEndMarker, $clusterStart, [System.StringComparison]::Ordinal)
if ($clusterEnd -lt 0) {
    throw "No se encontro fin del bloque Configuration."
}

$cluster = $text.Substring($clusterStart, $clusterEnd - $clusterStart)
$withoutCluster = $text.Remove($clusterStart, $clusterEnd - $clusterStart)

$anchorIndex = $withoutCluster.IndexOf($insertAnchor, [System.StringComparison]::Ordinal)
if ($anchorIndex -lt 0) {
    throw "No se encontro ancla posterior al selector Module."
}

$replacement = @"
                  })()}

                  {/* $placementMarker */}
$cluster                  {selectedModule && (
"@
$replacement = Normalize-Lf $replacement

$next = $withoutCluster.Replace($insertAnchor, $replacement)

$configPos = $next.IndexOf("Configuration", [System.StringComparison]::Ordinal)
$ioPos = $next.IndexOf("I/O Mapping", [System.StringComparison]::Ordinal)
$selectedDescriptionPos = $next.IndexOf("                  {selectedModule && (", [System.StringComparison]::Ordinal)

if ($configPos -lt 0 -or $ioPos -lt 0 -or $selectedDescriptionPos -lt 0) {
    throw "Validacion interna: no se encontraron los bloques esperados tras mover Configuration."
}
if ($configPos -gt $selectedDescriptionPos) {
    throw "Validacion interna: Configuration no quedo antes de la descripcion/specs."
}
if ($configPos -gt $ioPos) {
    throw "Validacion interna: Configuration no quedo antes de I/O Mapping."
}

Write-Utf8NoBom $path ($next.TrimEnd() + "`n")

& git -C $OpenPLCRepo diff --check -- $relPath
if ($LASTEXITCODE -ne 0) {
    throw "git diff --check fallo para $relPath"
}

Write-Host "`n=== DIFF STAT ===" -ForegroundColor Cyan
& git -C $OpenPLCRepo diff --stat -- $relPath

Write-Host "`n=== ORDER CHECK ===" -ForegroundColor Cyan
Write-Host "MODULE_CONFIGURATION_POSITION=UNDER_MODULE"
Write-Host "MODULE_CONFIGURATION_BEFORE_DESCRIPTION=YES"
Write-Host "MODULE_CONFIGURATION_BEFORE_IO_MAPPING=YES"
Write-Host "PERSISTENCE_CHANGED=NO"
Write-Host "CODEGEN_CHANGED=NO"
Write-Host "BACKPLANE_CONFIG_PLACEMENT=PASS" -ForegroundColor Green
Write-Host "NEXT=TYPECHECK_AND_UI_RELOAD" -ForegroundColor Yellow
