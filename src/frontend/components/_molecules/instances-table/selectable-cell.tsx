import { CellContext } from '@tanstack/react-table'
import { useEffect, useState } from 'react'

import type { PLCInstance } from '../../../../middleware/shared/ports/types'
import { useOpenPLCStore } from '../../../store'
import { cn } from '../../../utils/cn'

type ISelectableCellProps = CellContext<PLCInstance, unknown> & { editable?: boolean }
const SelectableTaskCell = ({
  getValue,
  row: { index },
  column: { id },
  table,
  editable = true,
}: ISelectableCellProps) => {
  const {
    project: {
      data: {
        configurations: {
          resource: { tasks },
        },
      },
    },
  } = useOpenPLCStore()
  const initialValue = getValue()

  const [cellValue, setCellValue] = useState(initialValue)

  const onValueChange = (value: string) => {
    setCellValue(value)
    table.options.meta?.updateData(index, id, value)
  }

  useEffect(() => {
    setCellValue(initialValue)
  }, [initialValue])

  return (
    <select
      value={cellValue as string}
      onChange={(e) => onValueChange(e.target.value)}
      className={cn(
        'h-full w-full cursor-pointer justify-center bg-transparent p-2 text-center font-caption text-cp-sm font-medium text-neutral-850 outline-none dark:text-neutral-300',
        { 'pointer-events-none': !editable },
      )}
    >
      {tasks?.map(
        (option) =>
          option.name !== 'undefined' &&
          option.name !== '' && (
            <option key={option.name} value={option.name}>
              {option.name}
            </option>
          ),
      )}
    </select>
  )
}
const SelectableProgramCell = ({
  getValue,
  row: { index },
  column: { id },
  table,
  editable = true,
}: ISelectableCellProps) => {
  const {
    project: {
      data: { pous },
    },
  } = useOpenPLCStore()
  const initialValue = getValue<string>()

  const [cellValue, setCellValue] = useState<string>(initialValue)

  const onValueChange = (value: string) => {
    setCellValue(value)
    table.options.meta?.updateData(index, id, value)
  }

  useEffect(() => {
    setCellValue(initialValue)
  }, [initialValue])

  return (
    <select
      value={cellValue}
      onChange={(e) => onValueChange(e.target.value)}
      className={cn(
        'h-full w-full cursor-pointer justify-center bg-transparent p-2 text-center font-caption text-cp-sm font-medium text-neutral-850 outline-none dark:text-neutral-300',
        { 'pointer-events-none': !editable },
      )}
    >
      {pous
        .filter((option) => option.pouType === 'program')
        .map((option) => (
          <option key={option.name} value={option.name}>
            {option.name}
          </option>
        ))}
    </select>
  )
}

export { SelectableProgramCell, SelectableTaskCell }
