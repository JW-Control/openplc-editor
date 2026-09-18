import * as PrimitiveDropdown from '@radix-ui/react-dropdown-menu'
import type { CellContext } from '@tanstack/react-table'
import _ from 'lodash'
import { memo, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { baseTypeEnum } from '../../../../middleware/shared/ports/plc-schemas'
import type { PLCVariable } from '../../../../middleware/shared/ports/types'
import { ArrowIcon } from '../../../assets/icons/interface/Arrow'
import { DebuggerIcon } from '../../../assets/icons/interface/Debugger'
import { useOpenPLCStore } from '../../../store'
import { TypeChangeValidationResult, validateTypeChange } from '../../../store/slices/project/validation/type-change'
import { cn } from '../../../utils/cn'
import { syncNodesWithVariables, syncNodesWithVariablesFBD } from '../../../utils/graphical/sync-nodes-with-variables'
import { hasStringName, safeUpper } from '../../../utils/safe-upper'
import { InputWithRef } from '../../_atoms/input'
import { TypeChangeModal } from '../type-change-modal'
import { ArrayModal } from './elements/array-modal'

type ISelectableCellProps = CellContext<PLCVariable, unknown> & { selected?: boolean }

/**
 * Cell renderers below mount a Radix Popover/DropdownMenu (or, for the
 * plain cells, still re-run their own effects) once PER ROW. TanStack
 * Table hands every cell a fresh `row`/`table` wrapper whenever ANY row's
 * data changes, so without this check editing one variable re-rendered
 * every other row's cell too — with enough rows, that re-render burst is
 * what tipped Radix's ref-tracking effects into React's nested-update
 * limit. Immer gives each row's own data object a stable reference when
 * that row wasn't the one touched, so comparing it (not just the cell's
 * own `getValue()`) is what actually scopes the re-render to the edited
 * row.
 */
const arePLCVariableCellPropsEqual = (prev: ISelectableCellProps, next: ISelectableCellProps): boolean =>
  prev.row.index === next.row.index &&
  prev.selected === next.selected &&
  prev.table.options.data[prev.row.index] === next.table.options.data[next.row.index]

const createVariableType = (
  definition: PLCVariable['type']['definition'],
  value: string,
): PLCVariable['type'] | null => {
  switch (definition) {
    case 'base-type':
      return {
        definition: 'base-type',
        value: value as Extract<PLCVariable['type'], { definition: 'base-type' }>['value'],
      }
    case 'user-data-type':
      return { definition: 'user-data-type', value }
    case 'derived':
      return { definition: 'derived', value }
    case 'array':
      return null
    default:
      return null
  }
}

const SelectableTypeCellImpl = ({
  getValue,
  row: { index },
  column: { id },
  table,
  selected = false,
}: ISelectableCellProps) => {
  const {
    editor,
    dataTypes,
    updateNodes,
    updateFBDNodes,
    libraries: sliceLibraries,
    isDebuggerVisible,
  } = useOpenPLCStore(
    useShallow((s) => ({
      editor: s.editor,
      dataTypes: s.project.data.dataTypes,
      updateNodes: s.ladderFlowActions.updateNodes,
      updateFBDNodes: s.fbdFlowActions.updateNodes,
      libraries: s.libraries,
      isDebuggerVisible: s.workspace.isDebuggerVisible,
    })),
  )

  const language = 'language' in editor.meta ? editor.meta.language : null

  const VariableTypes = [
    {
      definition: 'base-type',
      values: baseTypeEnum.options,
    },
    {
      definition: 'user-data-type',
      values: dataTypes.filter(hasStringName).map((dataType) => dataType.name),
    },
  ]

  const LibraryTypes = [
    {
      definition: 'system',
      values: sliceLibraries.system.flatMap((library) =>
        (library.pous ?? [])
          .filter((pou) => pou?.type === 'function-block')
          .filter(hasStringName)
          .map((pou) => pou.name.toUpperCase()),
      ),
    },
    {
      definition: 'user',
      values: sliceLibraries.user
        .filter(hasStringName)
        .filter((userLibrary) => userLibrary.name !== editor.meta.name)
        .flatMap((userLibrary) => {
          const pous = (userLibrary as { pous?: { type?: string; name?: string }[] }).pous
          if (Array.isArray(pous)) {
            return pous
              .filter((pou) => pou?.type === 'function-block')
              .filter(hasStringName)
              .map((pou) => pou.name.toUpperCase())
          }
          return userLibrary.type === 'function-block' ? [userLibrary.name.toUpperCase()] : []
        }),
    },
  ]

  // Filter available types based on language
  const getAvailableTypes = () => {
    if (language === 'python' || language === 'cpp') {
      // Native-language POUs (Python / C++) don't share strucpp's
      // chrono-backed handling for IEC time types yet, so hide them
      // from the type dropdown.
      const excludedTypes = ['TIME', 'DATE', 'TOD', 'DT']

      // Only show Base Type for Python/C++ and filter out specific types
      const availableTypes = VariableTypes.filter((type) => type.definition === 'base-type').map((type) => ({
        ...type,
        values: type.values.filter((value) => !excludedTypes.includes(safeUpper(value))),
      }))

      return availableTypes
    }
    return VariableTypes
  }

  const getAvailableLibraryTypes = () => {
    if (language === 'python' || language === 'cpp') {
      // No library types for Python/C++
      return []
    }
    return LibraryTypes
  }

  const availableVariableTypes = getAvailableTypes()
  const availableLibraryTypes = getAvailableLibraryTypes()

  const { value, definition } = getValue<PLCVariable['type']>()
  // We need to keep and update the state of the cell normally
  const [cellValue, setCellValue] = useState<PLCVariable['type']['value']>(value)
  const [arrayModalIsOpen, setArrayModalIsOpen] = useState(false)
  const [poppoverIsOpen, setPoppoverIsOpen] = useState(false)
  const [typeChangeModalOpen, setTypeChangeModalOpen] = useState(false)
  const [pendingTypeChange, setPendingTypeChange] = useState<{
    definition: PLCVariable['type']['definition']
    value: PLCVariable['type']['value']
  } | null>(null)
  const [validationResult, setValidationResult] = useState<TypeChangeValidationResult | null>(null)
  const variableName = table.options.data[index].name
  const currentVariable = table.options.data[index]

  const [variableFilters, setVariableFilters] = useState<Record<string, string>>({
    'base-type': '',
    'user-data-type': '',
  })
  const [libraryFilter, setLibraryFilter] = useState('')

  const filteredBaseTypes =
    availableVariableTypes
      .find((v) => v.definition === 'base-type')
      ?.values.filter((val) => safeUpper(val).includes(safeUpper(variableFilters['base-type']))) || []

  const filteredUserDataTypes =
    availableVariableTypes
      .find((v) => v.definition === 'user-data-type')
      ?.values.filter((val) => safeUpper(val).includes(safeUpper(variableFilters['user-data-type']))) || []

  const filteredSystemLibraries =
    availableLibraryTypes
      .find((l) => l.definition === 'system')
      ?.values.filter((val) => safeUpper(val).includes(safeUpper(libraryFilter))) || []

  const filteredUserLibraries =
    availableLibraryTypes
      .find((l) => l.definition === 'user')
      ?.values.filter((val) => safeUpper(val).includes(safeUpper(libraryFilter))) || []

  const applyTypeChange = (definition: PLCVariable['type']['definition'], value: PLCVariable['type']['value']) => {
    const language = 'language' in editor.meta ? editor.meta.language : undefined

    table.options.meta?.updateData(index, id, { definition, value })

    const {
      project: {
        data: { pous: freshPous },
      },
      ladderFlows: freshLadderFlows,
      fbdFlows: freshFBDFlows,
    } = useOpenPLCStore.getState()

    const pou = freshPous.find((p) => p.name === editor.meta.name)

    const newVars = pou?.interface?.variables ?? []

    if (language === 'fbd') {
      syncNodesWithVariablesFBD(newVars, freshFBDFlows, updateFBDNodes, editor.meta.name)
    }

    if (language === 'ld') {
      syncNodesWithVariables(newVars, freshLadderFlows, updateNodes, editor.meta.name)
    }

    setCellValue(value)
  }

  // When the input is blurred, we'll call our table meta's updateData function
  const onSelect = (definition: PLCVariable['type']['definition'], value: PLCVariable['type']['value']) => {
    const language = 'language' in editor.meta ? editor.meta.language : undefined

    const oldType = currentVariable.type

    if (oldType.value === value && oldType.definition === definition) {
      return
    }

    if (language === 'fbd' || language === 'ld') {
      const { ladderFlows: freshLadderFlows, fbdFlows: freshFBDFlows } = useOpenPLCStore.getState()

      const newType = createVariableType(definition, value)

      if (!newType) {
        applyTypeChange(definition, value)
        return
      }

      const validation = validateTypeChange(variableName, oldType, newType, freshLadderFlows, freshFBDFlows)

      if (validation.affectedNodes.length > 0 || validation.warnings.length > 0) {
        setPendingTypeChange({ definition, value })
        setValidationResult(validation)
        setTypeChangeModalOpen(true)
        setPoppoverIsOpen(false)
        return
      }
    }

    applyTypeChange(definition, value)
  }

  const handleTypeChangeConfirm = () => {
    if (pendingTypeChange) {
      applyTypeChange(pendingTypeChange.definition, pendingTypeChange.value)
    }
    setTypeChangeModalOpen(false)
    setPendingTypeChange(null)
    setValidationResult(null)
  }

  const handleTypeChangeCancel = () => {
    setTypeChangeModalOpen(false)
    setPendingTypeChange(null)
    setValidationResult(null)
  }

  // If the value is changed external, sync it up with our state
  useEffect(() => {
    setCellValue(value)
  }, [value])

  return (
    <>
      {validationResult &&
        pendingTypeChange &&
        (() => {
          const newType = createVariableType(pendingTypeChange.definition, pendingTypeChange.value)
          if (!newType) return null
          return (
            <TypeChangeModal
              open={typeChangeModalOpen}
              variableName={variableName}
              oldType={currentVariable.type}
              newType={newType}
              validation={validationResult}
              onConfirm={handleTypeChangeConfirm}
              onCancel={handleTypeChangeCancel}
            />
          )
        })()}
      {language !== 'python' && language !== 'cpp' && (
        <ArrayModal
          variableName={variableName}
          VariableRow={index}
          arrayModalIsOpen={arrayModalIsOpen}
          setArrayModalIsOpen={setArrayModalIsOpen}
          closeContainer={() => setPoppoverIsOpen(false)}
        />
      )}
      <PrimitiveDropdown.Root onOpenChange={setPoppoverIsOpen} open={poppoverIsOpen}>
        <PrimitiveDropdown.Trigger asChild disabled={isDebuggerVisible}>
          <div
            className={cn('flex h-full w-full cursor-pointer justify-center p-2 outline-none', {
              'pointer-events-none': !selected || isDebuggerVisible,
              'cursor-default': !selected || definition === 'derived',
              'cursor-not-allowed': isDebuggerVisible,
            })}
          >
            <span className='line-clamp-1 font-caption text-xs font-normal text-neutral-700 dark:text-neutral-500'>
              {cellValue === null
                ? ''
                : definition === 'array' || definition === 'derived'
                  ? cellValue
                  : _.upperCase(cellValue as unknown as string)}
            </span>
          </div>
        </PrimitiveDropdown.Trigger>
        <PrimitiveDropdown.Portal>
          <PrimitiveDropdown.Content
            side='bottom'
            sideOffset={-20}
            className='box h-fit w-[200px] overflow-hidden rounded-lg bg-white outline-none dark:bg-neutral-950'
          >
            {availableVariableTypes.map((scope) => {
              const filterText = variableFilters[scope.definition] || ''
              const filteredValues = scope.definition === 'base-type' ? filteredBaseTypes : filteredUserDataTypes
              return (
                <PrimitiveDropdown.Sub
                  key={scope.definition}
                  onOpenChange={() => setVariableFilters((prev) => ({ ...prev, [scope.definition]: '' }))}
                >
                  <PrimitiveDropdown.SubTrigger asChild>
                    <div className='relative flex h-8 w-full cursor-pointer items-center justify-center py-1 outline-none hover:bg-neutral-100 dark:hover:bg-neutral-900'>
                      <span className='font-caption text-xs font-normal text-neutral-700 dark:text-neutral-500'>
                        {_.startCase(scope.definition)}
                      </span>
                      <ArrowIcon size='md' direction='right' className='absolute right-1' />
                    </div>
                  </PrimitiveDropdown.SubTrigger>
                  <PrimitiveDropdown.Portal>
                    <PrimitiveDropdown.SubContent
                      sideOffset={5}
                      className='box h-fit max-h-[300px] w-[200px] overflow-y-auto rounded-lg bg-white outline-none dark:bg-neutral-950'
                    >
                      <div className='sticky top-0 z-10 bg-white p-2 dark:bg-neutral-950'>
                        <InputWithRef
                          type='text'
                          placeholder='Search...'
                          className='w-full rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-700 outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-500'
                          value={filterText}
                          onChange={(e) =>
                            setVariableFilters((prev) => ({
                              ...prev,
                              [scope.definition]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </div>
                      {filteredValues.length > 0 ? (
                        filteredValues.map((value) => (
                          <PrimitiveDropdown.Item
                            key={value}
                            onSelect={() => onSelect(scope.definition as PLCVariable['type']['definition'], value)}
                            className='flex h-8 w-full cursor-pointer items-center justify-center py-1 outline-none hover:bg-neutral-100 dark:hover:bg-neutral-900'
                          >
                            <span className='text-center font-caption text-xs font-normal text-neutral-700 dark:text-neutral-500'>
                              {_.upperCase(value)}
                            </span>
                          </PrimitiveDropdown.Item>
                        ))
                      ) : (
                        <div className='flex h-8 w-full items-center justify-center py-1'>
                          <span className='font-caption text-xs font-normal text-neutral-700 dark:text-neutral-500'>
                            No {_.startCase(scope.definition)} found
                          </span>
                        </div>
                      )}
                    </PrimitiveDropdown.SubContent>
                  </PrimitiveDropdown.Portal>
                </PrimitiveDropdown.Sub>
              )
            })}

            {language !== 'python' && language !== 'cpp' && (
              <PrimitiveDropdown.Item
                onSelect={() => {
                  setArrayModalIsOpen(true)
                  setPoppoverIsOpen(false)
                }}
                className='flex h-8 w-full cursor-pointer items-center justify-center py-1 outline-none hover:bg-neutral-100 data-[state=open]:bg-neutral-100 dark:hover:bg-neutral-900 data-[state=open]:dark:bg-neutral-900'
              >
                <span className='font-caption text-xs font-normal text-neutral-700 dark:text-neutral-500'>Array</span>
              </PrimitiveDropdown.Item>
            )}

            {availableLibraryTypes.map((scope) => {
              const filteredValues = scope.definition === 'system' ? filteredSystemLibraries : filteredUserLibraries
              return (
                <PrimitiveDropdown.Sub key={scope.definition} onOpenChange={() => setLibraryFilter('')}>
                  <PrimitiveDropdown.SubTrigger asChild>
                    <div className='relative flex h-8 w-full cursor-pointer items-center justify-center py-1 outline-none hover:bg-neutral-100 dark:hover:bg-neutral-900'>
                      <span className='font-caption text-xs font-normal text-neutral-700 dark:text-neutral-500'>
                        {_.startCase(scope.definition)}
                      </span>
                      <ArrowIcon size='md' direction='right' className='absolute right-1' />
                    </div>
                  </PrimitiveDropdown.SubTrigger>
                  <PrimitiveDropdown.Portal>
                    <PrimitiveDropdown.SubContent
                      sideOffset={5}
                      className='box h-fit max-h-[300px] w-[200px] overflow-y-auto rounded-lg bg-white outline-none dark:bg-neutral-950'
                    >
                      <div className='sticky top-0 z-10 bg-white p-2 dark:bg-neutral-950'>
                        <InputWithRef
                          type='text'
                          placeholder='Search...'
                          className='w-full rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-700 outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-500'
                          value={libraryFilter}
                          onChange={(e) => setLibraryFilter(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </div>
                      {filteredValues.length > 0 ? (
                        filteredValues.map((value) => (
                          <PrimitiveDropdown.Item
                            key={value}
                            onSelect={() => onSelect('derived', value)}
                            className='flex h-8 w-full cursor-pointer items-center justify-center py-1 outline-none hover:bg-neutral-100 dark:hover:bg-neutral-900'
                          >
                            <span className='text-center font-caption text-xs font-normal text-neutral-700 dark:text-neutral-500'>
                              {_.upperCase(value)}
                            </span>
                          </PrimitiveDropdown.Item>
                        ))
                      ) : (
                        <div className='flex h-8 w-full items-center justify-center py-1'>
                          <span className='font-caption text-xs font-normal text-neutral-700 dark:text-neutral-500'>
                            No {_.startCase(scope.definition)} found
                          </span>
                        </div>
                      )}
                    </PrimitiveDropdown.SubContent>
                  </PrimitiveDropdown.Portal>
                </PrimitiveDropdown.Sub>
              )
            })}
          </PrimitiveDropdown.Content>
        </PrimitiveDropdown.Portal>
      </PrimitiveDropdown.Root>
    </>
  )
}

const SelectableClassCellImpl = ({
  getValue,
  row: { index },
  column: { id },
  table,
  selected = true,
}: ISelectableCellProps) => {
  const { editor, isDebuggerVisible } = useOpenPLCStore(
    useShallow((s) => ({
      editor: s.editor,
      isDebuggerVisible: s.workspace.isDebuggerVisible,
    })),
  )

  const language = 'language' in editor.meta ? editor.meta.language : null
  const getVariableClasses = () => {
    if (language === 'python' || language === 'cpp') {
      return ['input', 'output']
    }
    return ['input', 'output', 'inOut', 'external', 'local', 'temp']
  }

  const variableClasses = getVariableClasses()

  // Get the current value from the table
  const currentValue = getValue()

  // We need to keep and update the state of the cell normally
  const [cellValue, setCellValue] = useState(currentValue)

  // When the input is blurred, we'll call our table meta's updateData function
  const onValueChange = (value: string) => {
    // Todo: Must update the data in the store
    setCellValue(value)
    table.options.meta?.updateData(index, id, value)

    if (value === 'external') {
      table.options.meta?.updateData(index, 'initialValue', undefined)
    }

    if (value !== 'local') {
      table.options.meta?.updateData(index, 'location', '')
    }
  }

  useEffect(() => {
    setCellValue(currentValue)
  }, [currentValue])

  return (
    <select
      value={cellValue as string}
      onChange={(e) => onValueChange(e.target.value)}
      disabled={isDebuggerVisible}
      className={cn(
        'h-full w-full cursor-pointer justify-center bg-transparent p-2 text-center font-caption text-cp-sm font-medium text-neutral-850 outline-none dark:text-neutral-300',
        {
          'pointer-events-none': !selected || isDebuggerVisible,
          'cursor-not-allowed': isDebuggerVisible,
        },
      )}
    >
      {variableClasses.map((type) => (
        <option key={type} value={type}>
          {_.startCase(type)}
        </option>
      ))}
    </select>
  )
}

const SelectableDebugCellImpl = ({ getValue, row: { index }, column: { id }, table }: ISelectableCellProps) => {
  const initialValue = getValue<boolean | undefined>() ?? false
  // We need to keep and update the state of the cell normally
  const [cellValue, setCellValue] = useState(initialValue)

  // When the input is blurred, we'll call our table meta's updateData function
  const onClick = () => {
    // Todo: Must update the data in the store
    setCellValue(!cellValue)
    table.options.meta?.updateData(index, id, !cellValue)
  }

  // If the initialValue is changed external, sync it up with our state
  useEffect(() => {
    setCellValue(initialValue)
  }, [initialValue])

  return (
    <button className='flex h-full w-full cursor-pointer items-center justify-center' onClick={onClick}>
      <DebuggerIcon variant={cellValue ? 'default' : 'muted'} />
    </button>
  )
}

const SelectableTypeCell = memo(SelectableTypeCellImpl, arePLCVariableCellPropsEqual)
const SelectableClassCell = memo(SelectableClassCellImpl, arePLCVariableCellPropsEqual)
const SelectableDebugCell = memo(SelectableDebugCellImpl, arePLCVariableCellPropsEqual)

export { SelectableClassCell, SelectableDebugCell, SelectableTypeCell }
