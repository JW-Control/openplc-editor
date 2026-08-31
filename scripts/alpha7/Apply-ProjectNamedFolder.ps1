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

$relPath = "src/backend/editor/services/project-service/index.ts"
$path = Join-Path $OpenPLCRepo $relPath
if (-not (Test-Path -LiteralPath $path)) {
    throw "No existe archivo esperado: $path"
}

$text = Normalize-Lf ([System.IO.File]::ReadAllText($path))
$marker = "Alpha7 project-root policy: selected parent + project name, without duplicate nesting."
if ($text.Contains($marker)) {
    Write-Host "PROJECT_NAMED_FOLDER=ALREADY_APPLIED" -ForegroundColor Yellow
    exit 0
}

$importOld = "import { dirname, join, normalize } from 'path'"
$importNew = "import { basename, dirname, join, normalize } from 'path'"
$text = Replace-Once $text $importOld $importNew "path basename import"

$classOld = @'
class ProjectService {
  constructor(private serviceManager: InstanceType<typeof BrowserWindow>) {}
'@
$classNew = @'
/**
 * Resolve the root directory for a newly-created project.
 *
 * Alpha7 project-root policy: selected parent + project name, without duplicate nesting.
 * The create dialog historically supplied a directory and ProjectService wrote
 * project.json directly into it. For a selected parent `OpenPLC` and project
 * `CONTROL_BOMBAS`, creation now targets `OpenPLC/CONTROL_BOMBAS`.
 *
 * If the selected directory already has the project name, keep it unchanged so
 * `CONTROL_BOMBAS/CONTROL_BOMBAS` is never produced. The comparison is
 * case-insensitive because the primary desktop target is Windows.
 */
export function resolveNewProjectDirectory(selectedPath: string, projectName: string): string {
  const normalizedSelectedPath = normalize(selectedPath)
  const trimmedName = projectName.trim()

  if (!trimmedName) {
    throw new Error('Project name must not be empty')
  }
  if (trimmedName === '.' || trimmedName === '..' || trimmedName.includes('/') || trimmedName.includes('\\')) {
    throw new Error('Project name must be a single directory name')
  }

  const selectedDirectoryName = basename(normalizedSelectedPath)
  if (selectedDirectoryName.toLocaleLowerCase() === trimmedName.toLocaleLowerCase()) {
    return normalizedSelectedPath
  }
  return join(normalizedSelectedPath, trimmedName)
}

class ProjectService {
  constructor(private serviceManager: InstanceType<typeof BrowserWindow>) {}
'@
$text = Replace-Once $text $classOld $classNew "project root resolver"

$createOld = @'
  async createProject(data: CreateProjectFileProps): Promise<IProjectServiceResponse> {
    const projectDefaultDirectoriesResponse = createProjectDefaultStructure(data.path, data)
    if (!projectDefaultDirectoriesResponse.success || !projectDefaultDirectoriesResponse.data) {
      return {
        success: false,
        error: projectDefaultDirectoriesResponse.error,
      }
    }
    await this.updateProjectHistory(data.path)
    return {
      success: true,
      data: {
        meta: {
          path: data.path, // Use the directory path instead of projectPath
        },
        content: projectDefaultDirectoriesResponse.data.content,
      },
    }
  }
'@
$createNew = @'
  async createProject(data: CreateProjectFileProps): Promise<IProjectServiceResponse> {
    let projectPath: string
    try {
      projectPath = resolveNewProjectDirectory(data.path, data.name)
    } catch (error) {
      return {
        success: false,
        error: {
          title: 'Invalid project name',
          description: error instanceof Error ? error.message : 'Unable to resolve project directory.',
          error,
        },
      }
    }

    const resolvedData = { ...data, path: projectPath }
    const projectDefaultDirectoriesResponse = createProjectDefaultStructure(projectPath, resolvedData)
    if (!projectDefaultDirectoriesResponse.success || !projectDefaultDirectoriesResponse.data) {
      return {
        success: false,
        error: projectDefaultDirectoriesResponse.error,
      }
    }
    await this.updateProjectHistory(projectPath)
    return {
      success: true,
      data: {
        meta: {
          path: projectPath,
        },
        content: projectDefaultDirectoriesResponse.data.content,
      },
    }
  }
'@
$text = Replace-Once $text $createOld $createNew "createProject named directory"

Write-Utf8NoBom $path ($text.TrimEnd() + "`n")

& git -C $OpenPLCRepo diff --check -- $relPath
if ($LASTEXITCODE -ne 0) {
    throw "git diff --check fallo para $relPath"
}

Write-Host "`n=== DIFF STAT ===" -ForegroundColor Cyan
& git -C $OpenPLCRepo diff --stat -- $relPath

Write-Host "`n=== POLICY CHECK ===" -ForegroundColor Cyan
$final = Normalize-Lf ([System.IO.File]::ReadAllText($path))
if (-not $final.Contains($marker)) { throw "Falta marker de project-root policy" }
if (-not $final.Contains("projectPath = resolveNewProjectDirectory(data.path, data.name)")) { throw "createProject no usa resolver" }
if (-not $final.Contains("await this.updateProjectHistory(projectPath)")) { throw "History no usa projectPath final" }

Write-Host "SELECTED_PATH_IS_PARENT=SUPPORTED"
Write-Host "PROJECT_NAME_SUBDIRECTORY=YES"
Write-Host "DUPLICATE_NAME_NESTING=GUARDED"
Write-Host "PROJECT_HISTORY_USES_FINAL_ROOT=YES"
Write-Host "PROJECT_NAMED_FOLDER=APPLIED" -ForegroundColor Green
Write-Host "NEXT=TYPESCRIPT_AND_NEW_PROJECT_UI_TEST" -ForegroundColor Yellow
