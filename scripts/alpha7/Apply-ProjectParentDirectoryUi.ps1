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

$pickerRel = "src/backend/editor/utils/path-picker.ts"
$stepRel = "src/frontend/components/_features/[start]/new-project/steps/second-step.tsx"
$serviceRel = "src/backend/editor/services/project-service/index.ts"

$pickerPath = Join-Path $OpenPLCRepo $pickerRel
$stepPath = Join-Path $OpenPLCRepo $stepRel
$servicePath = Join-Path $OpenPLCRepo $serviceRel

foreach ($path in @($pickerPath, $stepPath, $servicePath)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "No existe archivo esperado: $path"
    }
}

$marker = "Alpha7 project-parent picker policy: selected directory may contain other projects."
$pickerText = Normalize-Lf ([System.IO.File]::ReadAllText($pickerPath))
if ($pickerText.Contains($marker)) {
    Write-Host "PROJECT_PARENT_DIRECTORY_UI=ALREADY_APPLIED" -ForegroundColor Yellow
    exit 0
}

$serviceText = Normalize-Lf ([System.IO.File]::ReadAllText($servicePath))
if (-not $serviceText.Contains("Alpha7 project-root policy: selected parent + project name, without duplicate nesting.")) {
    throw "Primero debe estar aplicado Apply-ProjectNamedFolder.ps1"
}

# 1) Native picker: choose a parent folder. It may already contain other
# projects; collision safety belongs to the final parent/projectName target.
$pickerImportOld = @'
import { isEmptyDir } from './is-empty-dir'

'@
$pickerText = Replace-Once $pickerText $pickerImportOld "" "remove legacy empty-dir import"

$pickerDialogOld = @'
  const { canceled, filePaths } = await dialog.showOpenDialog(serviceManager, {
    title: 'Choose an empty directory for new project',
    properties: ['openDirectory', 'createDirectory'],
  })
'@
$pickerDialogNew = @'
  // Alpha7 project-parent picker policy: selected directory may contain other projects.
  // ProjectService resolves the final root as parent/projectName and protects
  // that final target from non-empty collisions before writing any files.
  const { canceled, filePaths } = await dialog.showOpenDialog(serviceManager, {
    title: 'Choose a parent directory for new project',
    properties: ['openDirectory', 'createDirectory'],
  })
'@
$pickerText = Replace-Once $pickerText $pickerDialogOld $pickerDialogNew "parent directory dialog"

$pickerEmptyOld = @'
  if (!(await isEmptyDir(filePath))) {
    return {
      success: false,
      error: {
        title: 'Directory is not empty',
        description: 'The selected directory is not empty. Please choose an empty directory for a new project.',
      },
    }
  }

'@
$pickerText = Replace-Once $pickerText $pickerEmptyOld "" "remove parent empty-directory rejection"

# 2) Renderer wording must match the new parent-folder semantics.
$stepText = Normalize-Lf ([System.IO.File]::ReadAllText($stepPath))
$stepOld = "              Choose an empty directory for your project: *"
$stepNew = "              Choose a parent directory for your project: *"
$stepText = Replace-Once $stepText $stepOld $stepNew "new project parent folder label"

# 3) Preserve the safety that the old picker accidentally provided. The parent
# may be non-empty, but the resolved final project directory must be absent or
# empty. Never overwrite an existing project/folder with user content.
$serviceOld = @'
    const resolvedData = { ...data, path: projectPath }
    const projectDefaultDirectoriesResponse = createProjectDefaultStructure(projectPath, resolvedData)
'@
$serviceNew = @'
    // The selected parent may contain other projects. Protect only the final
    // parent/projectName target from accidental overwrite.
    try {
      const existingEntries = await promises.readdir(projectPath)
      if (existingEntries.length > 0) {
        return {
          success: false,
          error: {
            title: 'Project directory is not empty',
            description: `The project directory "${projectPath}" already exists and is not empty. Choose another project name or parent directory.`,
            error: null,
          },
        }
      }
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code !== 'ENOENT') {
        return {
          success: false,
          error: {
            title: 'Unable to inspect project directory',
            description: `Unable to verify the project directory "${projectPath}" before creation.`,
            error,
          },
        }
      }
    }

    const resolvedData = { ...data, path: projectPath }
    const projectDefaultDirectoriesResponse = createProjectDefaultStructure(projectPath, resolvedData)
'@
$serviceText = Replace-Once $serviceText $serviceOld $serviceNew "final project target collision guard"

Write-Utf8NoBom $pickerPath ($pickerText.TrimEnd() + "`n")
Write-Utf8NoBom $stepPath ($stepText.TrimEnd() + "`n")
Write-Utf8NoBom $servicePath ($serviceText.TrimEnd() + "`n")

Write-Host "`n=== DIFF CHECK ===" -ForegroundColor Cyan
& git -C $OpenPLCRepo diff --check -- $pickerRel $stepRel $serviceRel
if ($LASTEXITCODE -ne 0) {
    throw "git diff --check fallo para project parent directory UI"
}

Write-Host "`n=== DIFF STAT ===" -ForegroundColor Cyan
& git -C $OpenPLCRepo diff --stat -- $pickerRel $stepRel $serviceRel

Write-Host "`n=== POLICY CHECK ===" -ForegroundColor Cyan
$pickerFinal = Normalize-Lf ([System.IO.File]::ReadAllText($pickerPath))
$stepFinal = Normalize-Lf ([System.IO.File]::ReadAllText($stepPath))
$serviceFinal = Normalize-Lf ([System.IO.File]::ReadAllText($servicePath))

if (-not $pickerFinal.Contains($marker)) { throw "Falta marker de parent picker" }
if ($pickerFinal.Contains("isEmptyDir(filePath)")) { throw "El picker aun exige parent vacio" }
if (-not $stepFinal.Contains("Choose a parent directory for your project: *")) { throw "UI no refleja parent directory" }
if (-not $serviceFinal.Contains("const existingEntries = await promises.readdir(projectPath)")) { throw "Falta guard del target final" }
if (-not $serviceFinal.Contains("Project directory is not empty")) { throw "Falta error explicito de colision" }

Write-Host "PROJECT_PARENT_MAY_BE_NONEMPTY=YES"
Write-Host "FINAL_PROJECT_TARGET_COLLISION_GUARD=YES"
Write-Host "PROJECT_PARENT_DIRECTORY_UI=APPLIED" -ForegroundColor Green
Write-Host "NEXT=TYPESCRIPT_AND_UI_RETEST" -ForegroundColor Yellow
