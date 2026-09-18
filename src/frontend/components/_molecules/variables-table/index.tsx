import { ColumnFiltersState, createColumnHelper, OnChangeFn } from '@tanstack/react-table'
import { memo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { PLCVariable } from '../../../../middleware/shared/ports/types'
import { usePouSnapshot } from '../../../hooks/use-pou-snapshot'
import { useOpenPLCStore } from '../../../store'
import { GenericTable } from '../../_atoms/generic-table'
import {
  EditableDocumentationCell,
  EditableInitialValueCell,
  EditableLocationCell,
  EditableNameCell,
} from './editable-cell'
import { SelectableClassCell, SelectableDebugCell, SelectableTypeCell } from './selectable-cell'

const columnHelper = createColumnHelper<PLCVariable>()

const columnsPrograms = [
  columnHelper.display({
    id: 'rowNumber',
    header: '#',
    size: 64,
    minSize: 32,
    maxSize: 64,
    enableResizing: true,
    cell: (props) => props.row.index,
  }),
  columnHelper.accessor('name', {
    header: 'Name',
    enableResizing: true,
    size: 300,
    minSize: 150,
    maxSize: 300,
    cell: EditableNameCell,
  }),
  columnHelper.accessor('class', {
    header: 'Class',
    enableResizing: true,
    cell: SelectableClassCell,
  }),
  columnHelper.accessor('type', {
    header: 'Type',
    enableResizing: true,
    size: 300,
    minSize: 80,
    maxSize: 300,
    cell: SelectableTypeCell,
  }),
  columnHelper.accessor('location', {
    header: 'Location',
    enableResizing: true,
    cell: EditableLocationCell,
  }),
  columnHelper.accessor('initialValue', {
    header: 'Initial Value',
    enableResizing: true,
    cell: EditableInitialValueCell,
  }),
  columnHelper.accessor('documentation', {
    header: 'Documentation',
    enableResizing: true,
    size: 468,
    minSize: 198,
    maxSize: 468,
    cell: EditableDocumentationCell,
  }),
  columnHelper.accessor('debug', { header: 'Debug', size: 64, minSize: 64, maxSize: 64, cell: SelectableDebugCell }),
]

const columns = [
  columnHelper.display({
    id: 'rowNumber',
    header: '#',
    size: 64,
    minSize: 32,
    maxSize: 64,
    enableResizing: true,
    cell: (props) => props.row.index,
  }),
  columnHelper.accessor('name', {
    header: 'Name',
    enableResizing: true,
    size: 300,
    minSize: 150,
    maxSize: 300,
    cell: EditableNameCell,
  }),
  columnHelper.accessor('class', {
    header: 'Class',
    enableResizing: true,
    cell: SelectableClassCell,
  }),
  columnHelper.accessor('type', {
    header: 'Type',
    enableResizing: true,
    size: 300,
    minSize: 80,
    maxSize: 300,
    cell: SelectableTypeCell,
  }),
  columnHelper.accessor('initialValue', {
    header: 'Initial Value',
    enableResizing: true,
    cell: EditableInitialValueCell,
  }),
  columnHelper.accessor('documentation', {
    header: 'Documentation',
    enableResizing: true,
    size: 568,
    minSize: 198,
    maxSize: 568,
    cell: EditableDocumentationCell,
  }),
  columnHelper.accessor('debug', { header: 'Debug', size: 64, minSize: 64, maxSize: 64, cell: SelectableDebugCell }),
]

type PLCVariablesTableProps = {
  tableData: PLCVariable[]
  filterValue?: string
  columnFilters?: ColumnFiltersState
  setColumnFilters?: OnChangeFn<ColumnFiltersState> | undefined
  selectedRow: number
  handleRowClick: (row: HTMLTableRowElement) => void
}

// Memoized: this component (and every per-row Radix Select/Popover/
// DropdownMenu cell beneath it) would otherwise re-render whenever its
// parent `VariablesEditor` re-renders for ANY reason — including other
// POUs' edits, since the multi-mount architecture keeps every open
// POU's VariablesEditor mounted. `React.memo` skips that re-render
// whenever this table's own props haven't actually changed.
const VariablesTable = memo(function VariablesTable({
  tableData,
  filterValue,
  columnFilters,
  setColumnFilters,
  selectedRow,
  handleRowClick,
}: PLCVariablesTableProps) {
  const { name, pouType, updateVariable, handleFileAndWorkspaceSavedState } = useOpenPLCStore(
    useShallow((s) => ({
      name: s.editor.meta.name,
      pouType: s.project.data.pous.find((p) => p.name === s.editor.meta.name)?.pouType,
      updateVariable: s.projectActions.updateVariable,
      handleFileAndWorkspaceSavedState: s.sharedWorkspaceActions.handleFileAndWorkspaceSavedState,
    })),
  )
  const { captureAndPush } = usePouSnapshot()

  return (
    <GenericTable<PLCVariable>
      columns={pouType !== 'program' ? columns : columnsPrograms}
      tableData={tableData}
      selectedRow={selectedRow}
      handleRowClick={handleRowClick}
      updateData={(rowIndex, columnId, value) => {
        captureAndPush(name)

        if (columnId === 'class' && filterValue !== undefined && filterValue !== 'all' && filterValue !== value) {
          return {
            ok: false,
            message: '',
          }
        }

        const result = updateVariable({
          scope: 'local',
          associatedPou: name,
          rowId: rowIndex,
          data: {
            [columnId]: value,
          },
        })
        if (result.ok) {
          handleFileAndWorkspaceSavedState(name)
        }
        return result
      }}
      tableContext='Variables'
      columnFilters={columnFilters}
      setColumnFilters={setColumnFilters}
      filterValue={filterValue}
    />
  )
})

export { VariablesTable }
