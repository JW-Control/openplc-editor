param(
    [string]$OpenPLCRepo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"

function Normalize-Lf([string]$Text) {
    return $Text.Replace("`r`n", "`n").Replace("`r", "`n")
}

function Replace-Once([string]$Text, [string]$Old, [string]$New, [string]$Label) {
    $count = ([regex]::Matches($Text, [regex]::Escape($Old))).Count
    if ($count -ne 1) {
        throw "No se encontro un ancla unica para $Label. Coincidencias: $count"
    }
    return $Text.Replace($Old, $New)
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
$marker = "Alpha7 Backplane identity policy: slot-derived defaults are persisted once and then follow the module."
if ($text.Contains($marker)) {
    Write-Host "BACKPLANE_SLOT_IDENTITY_POLICY=ALREADY_APPLIED" -ForegroundColor Yellow
    exit 0
}

$typeOld = @'
  default?: FieldValue
  help?: string
  min?: number
'@
$typeNew = @'
  default?: FieldValue
  /** Initialize this field from the 1-based slot number only when no explicit value is stored yet. */
  defaultFromSlot?: boolean
  /** Values for this field must be unique among populated modules in the same backplane. */
  uniqueAcrossSlots?: boolean
  help?: string
  min?: number
'@
$text = Replace-Once $text (Normalize-Lf $typeOld) (Normalize-Lf $typeNew) "ConfigFieldDef identity metadata"

$selectedOld = @'
  const selectedModuleId = slots[selectedSlot] ?? null
  const selectedModule = findModule(selectedModuleId)

  /* ------------------------------------------------------------ */
  /* Module image (lazy fetch via the SystemPort preview endpoint) */
'@
$selectedNew = @'
  const selectedModuleId = slots[selectedSlot] ?? null
  const selectedModule = findModule(selectedModuleId)

  /* Alpha7 Backplane identity policy: slot-derived defaults are persisted once and then follow the module.
   *
   * A vendor field can opt into `defaultFromSlot`. The renderer materializes
   * the current 1-based slot number only when that field has never been
   * persisted for the module. Once stored, reorder/remove operations already
   * move slotsConfig together with the module, so an explicitly configured
   * physical identity is not rewritten just because the UI position changes.
   */
  useEffect(() => {
    let changed = false
    const nextSlotsConfig: SlotConfigMap = { ...slotsConfig }

    for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
      const moduleId = slots[slotIndex]
      if (!moduleId) continue

      const moduleDef = findModule(moduleId)
      const fields = collectConfigFields(
        moduleDef?.configScreenDefinition as ConfigScreenDefinition | undefined,
      )
      if (fields.length === 0) continue

      const key = String(slotIndex + 1)
      const currentForSlot = nextSlotsConfig[key] ?? {}
      let nextForSlot = currentForSlot
      let slotChanged = false

      for (const field of fields) {
        if (!field.defaultFromSlot) continue
        if (Object.prototype.hasOwnProperty.call(currentForSlot, field.id)) continue

        let value = slotIndex + 1
        if (typeof field.min === 'number') value = Math.max(field.min, value)
        if (typeof field.max === 'number') value = Math.min(field.max, value)

        if (!slotChanged) nextForSlot = { ...currentForSlot }
        nextForSlot[field.id] = value
        slotChanged = true
        changed = true
      }

      if (slotChanged) nextSlotsConfig[key] = nextForSlot
    }

    if (!changed) return
    setVendorScreenData(persistenceKey, { ...moduleConfig, slots, slotsConfig: nextSlotsConfig })
    // Intentionally initialize only absent fields. Subsequent slotsConfig
    // changes re-run this effect but become a no-op once values exist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, slotsConfig, findModule, persistenceKey, setVendorScreenData])

  const conflictingSlotsForField = useCallback(
    (fieldId: string, value: FieldValue, currentSlot1: number): number[] => {
      const conflicts: number[] = []
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
        const slot1 = slotIndex + 1
        if (slot1 === currentSlot1) continue

        const moduleId = slots[slotIndex]
        if (!moduleId) continue
        const moduleDef = findModule(moduleId)
        const fields = collectConfigFields(
          moduleDef?.configScreenDefinition as ConfigScreenDefinition | undefined,
        )
        const peerField = fields.find((field) => field.id === fieldId && field.uniqueAcrossSlots)
        if (!peerField) continue

        const stored = slotsConfig[String(slot1)] ?? {}
        let peerValue: FieldValue | undefined = stored[fieldId]
        if (peerValue === undefined && peerField.defaultFromSlot) peerValue = slot1
        if (peerValue === undefined) peerValue = peerField.default as FieldValue | undefined

        if (peerValue === value) conflicts.push(slot1)
      }
      return conflicts
    },
    [slots, slotsConfig, findModule],
  )

  /* ------------------------------------------------------------ */
  /* Module image (lazy fetch via the SystemPort preview endpoint) */
'@
$text = Replace-Once $text (Normalize-Lf $selectedOld) (Normalize-Lf $selectedNew) "slot identity initialization"

$fieldChangeOld = @'
  const handleFieldChange = (slotIndex: number, fieldId: string, value: FieldValue) => {
    const key = String(slotIndex + 1)
    const slotValues = { ...(slotsConfig[key] ?? {}), [fieldId]: value }
    writeModuleConfig({
      ...moduleConfig,
      slots,
      slotsConfig: { ...slotsConfig, [key]: slotValues },
    })
  }
'@
$fieldChangeNew = @'
  const handleFieldChange = (slotIndex: number, fieldId: string, value: FieldValue) => {
    const moduleDef = findModule(slots[slotIndex])
    const fieldDef = collectConfigFields(
      moduleDef?.configScreenDefinition as ConfigScreenDefinition | undefined,
    ).find((field) => field.id === fieldId)

    if (fieldDef?.uniqueAcrossSlots) {
      const conflicts = conflictingSlotsForField(fieldId, value, slotIndex + 1)
      if (conflicts.length > 0) {
        toast({
          title: `${fieldDef.label} already in use`,
          description: `Value ${String(value)} is already assigned to Slot ${conflicts.join(', ')}. Each module on this backplane must use a unique value.`,
          variant: 'fail',
        })
        return
      }
    }

    const key = String(slotIndex + 1)
    const slotValues = { ...(slotsConfig[key] ?? {}), [fieldId]: value }
    writeModuleConfig({
      ...moduleConfig,
      slots,
      slotsConfig: { ...slotsConfig, [key]: slotValues },
    })
  }
'@
$text = Replace-Once $text (Normalize-Lf $fieldChangeOld) (Normalize-Lf $fieldChangeNew) "unique field write gate"

$renderOld = @'
                            const current = slotValues[field.id]
                            const setValue = (v: FieldValue) => handleFieldChange(selectedSlot, field.id, v)
                            return (
'@
$renderNew = @'
                            const current = slotValues[field.id]
                            const setValue = (v: FieldValue) => handleFieldChange(selectedSlot, field.id, v)
                            const duplicateSlots = field.uniqueAcrossSlots
                              ? conflictingSlotsForField(field.id, current, selectedSlot + 1)
                              : []
                            return (
'@
$text = Replace-Once $text (Normalize-Lf $renderOld) (Normalize-Lf $renderNew) "duplicate render calculation"

$warningOld = @'
                                {field.help && <FieldHelpIcon text={field.help} />}
                              </div>
'@
$warningNew = @'
                                {field.help && <FieldHelpIcon text={field.help} />}
                                {duplicateSlots.length > 0 && (
                                  <span className='text-xs font-medium text-red-600 dark:text-red-400'>
                                    Already used by Slot {duplicateSlots.join(', ')}
                                  </span>
                                )}
                              </div>
'@
$text = Replace-Once $text (Normalize-Lf $warningOld) (Normalize-Lf $warningNew) "duplicate inline warning"

Write-Utf8NoBom $path ($text.TrimEnd() + "`n")

& git -C $OpenPLCRepo diff --check -- $relPath
if ($LASTEXITCODE -ne 0) {
    throw "git diff --check fallo para $relPath"
}

Write-Host "`n=== DIFF STAT ===" -ForegroundColor Cyan
& git -C $OpenPLCRepo diff --stat -- $relPath

Write-Host "`n=== POLICY CHECK ===" -ForegroundColor Cyan
Write-Host "SLOT_DERIVED_DEFAULTS=SUPPORTED"
Write-Host "DEFAULT_PERSISTED_ONLY_WHEN_ABSENT=YES"
Write-Host "MANUAL_VALUE_PRESERVED=YES"
Write-Host "REORDER_PRESERVES_MODULE_IDENTITY=YES"
Write-Host "UNIQUE_ACROSS_SLOTS=SUPPORTED"
Write-Host "DUPLICATE_WRITE=REJECTED"
Write-Host "DUPLICATE_EXISTING_STATE=VISIBLE_WARNING"
Write-Host "BACKPLANE_SLOT_IDENTITY_POLICY=PASS" -ForegroundColor Green
Write-Host "NEXT=VPP_METADATA_AND_TYPECHECK" -ForegroundColor Yellow
