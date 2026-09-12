import * as Popover from '@radix-ui/react-popover'
import { ComponentPropsWithRef, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

import type { PLCVariable } from '../../../../../middleware/shared/ports/types'
import { PlusIcon } from '../../../../assets/icons/interface/Plus'
import { cn } from '../../../../utils/cn'

export type AutocompleteVariableItem = {
  id?: string
  name: string
  isSeparator?: boolean
  isInstance?: boolean
  type?: string
}

export type GraphicalEditorAutocompleteProps = ComponentPropsWithRef<'div'> & {
  isOpen?: boolean
  setIsOpen?: (isOpen: boolean) => void
  keyPressed?: string
  searchValue: string
  submit: ({ variable }: { variable: { id: string; name: string } }) => void
  onSelectInstance?: (instanceName: string) => void
  variables: AutocompleteVariableItem[] | PLCVariable[] | { id: string; name: string }[] | undefined
  canCreateNewVariable?: boolean
  newBlock?: {
    canCreate: boolean
    options?: {
      label: string
      block: {
        name: string
      }
    }
  }
  keepOpenForElementId?: string
  keepOpenForSelector?: string
  onBeforeSubmit?: ({ variable }: { variable: { id: string; name: string } }) => void
}

export const GraphicalEditorAutocomplete = forwardRef<HTMLDivElement, GraphicalEditorAutocompleteProps>(
  (
    {
      onFocus: focusEvent,
      isOpen,
      setIsOpen,
      keyPressed,
      searchValue,
      submit,
      onSelectInstance,
      variables,
      canCreateNewVariable = true,
      newBlock = { canCreate: false },
      keepOpenForElementId,
      keepOpenForSelector,
      onBeforeSubmit,
    }: GraphicalEditorAutocompleteProps,
    ref,
  ) => {
    const popoverRef = useRef<HTMLDivElement>(null)
    const variablesDivRef = useRef<HTMLDivElement>(null)

    const [autocompleteFocus, setAutocompleteFocus] = useState<boolean>(false)
    const [keyDown, setKeyDown] = useState<string>('')
    const [selectedVariable, setSelectedVariable] = useState<{
      positionInArray: number
      variable: { id: string; name: string }
    }>({
      positionInArray: -1,
      variable: {
        id: '',
        name: '',
      },
    })

    const selectableValues = useMemo(() => {
      const items = (variables || []).map((v) => {
        const item = v as AutocompleteVariableItem
        return {
          type: item.isSeparator ? 'separator' : item.isInstance ? 'instance' : 'variable',
          isSeparator: !!item.isSeparator,
          isInstance: !!item.isInstance,
          variable: {
            id: item.id ?? '',
            name: item.name,
          },
        }
      })

      if (canCreateNewVariable) {
        items.push({
          type: 'add',
          isSeparator: false,
          isInstance: false,
          variable: {
            id: 'add',
            name: searchValue,
          },
        })
      }

      if (newBlock.canCreate) {
        items.push({
          type: 'newBlock',
          isSeparator: false,
          isInstance: false,
          variable: {
            id: 'newBlock',
            name: newBlock.options?.block.name ?? 'generic',
          },
        })
      }

      return items
    }, [variables, searchValue, canCreateNewVariable, newBlock])

    useEffect(() => {
      setSelectedVariable({ positionInArray: -1, variable: { id: '', name: '' } })
    }, [searchValue, variables])

    const closeModal = () => {
      setAutocompleteFocus(false)
      setSelectedVariable({ positionInArray: -1, variable: { id: '', name: '' } })
      if (setIsOpen) setIsOpen(false)
    }

    const handleSelectInstance = (instanceName: string) => {
      setSelectedVariable({ positionInArray: -1, variable: { id: '', name: '' } })
      onSelectInstance?.(instanceName)
    }

    const shouldKeepOpenForOutsideTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      if (keepOpenForElementId && target.id === keepOpenForElementId) return true
      if (keepOpenForSelector && target.closest(keepOpenForSelector)) return true
      return false
    }

    const handleOutsideInteraction = (event: { target: EventTarget | null; preventDefault: () => void }) => {
      if (shouldKeepOpenForOutsideTarget(event.target)) {
        if (setIsOpen) setIsOpen(true)
        return
      }

      closeModal()
    }

    const submitAutocompletion = ({ variable }: { variable: { id: string; name: string } }) => {
      onBeforeSubmit?.({ variable })
      submit({ variable })
      closeModal()
    }

    /**
     * Resolve what to submit when the user presses Enter/Tab without
     * arrowing down to a row.
     */
    const resolveImplicitSubmitOption = () => {
      const trimmed = searchValue.trim().toLowerCase()
      if (trimmed) {
        const exactMatch = selectableValues.find(
          (item) => item.type !== 'separator' && item.variable.name.toLowerCase() === trimmed,
        )
        if (exactMatch) {
          return exactMatch
        }
      }
      const addVariableOption = selectableValues.find((item) => item.type === 'add')
      return addVariableOption ?? null
    }

    const getNextSelectableIndex = (current: number, direction: 1 | -1): number => {
      let next = current + direction
      while (next >= 0 && next < selectableValues.length) {
        if (selectableValues[next].type !== 'separator') {
          return next
        }
        next += direction
      }
      return current
    }

    // @ts-expect-error - not all properties are used
    useImperativeHandle(ref, () => {
      return {
        focus: () => {
          popoverRef.current?.focus()
        },
        isFocused: autocompleteFocus,
        selectedVariable: selectedVariable,
        /**
         * Synchronously triggers the submit action.
         * Returns false if an instance was drilled down instead of submitting a variable.
         */
        triggerSubmit: (): boolean => {
          if (selectedVariable.positionInArray === -1) {
            const implicit = resolveImplicitSubmitOption()
            if (implicit) {
              if (implicit.type === 'instance') {
                handleSelectInstance(implicit.variable.name)
                return false
              }
              submitAutocompletion({ variable: implicit.variable })
              return true
            } else {
              closeModal()
              return true
            }
          } else {
            const chosen = selectableValues[selectedVariable.positionInArray]
            if (chosen) {
              if (chosen.type === 'instance') {
                handleSelectInstance(chosen.variable.name)
                return false
              }
              if (chosen.type === 'separator') {
                return false
              }
              submitAutocompletion({ variable: chosen.variable })
              return true
            }
            closeModal()
            return true
          }
        },
      }
    }, [
      selectedVariable,
      selectableValues,
      variables,
      searchValue,
      popoverRef,
      autocompleteFocus,
      submitAutocompletion,
      closeModal,
    ])

    useEffect(() => {
      switch (keyDown) {
        case 'ArrowDown':
          setSelectedVariable((prev) => {
            const newPosition = getNextSelectableIndex(prev.positionInArray, 1)
            if (newPosition === prev.positionInArray && prev.positionInArray !== -1) {
              return prev
            }
            if (newPosition < 0 || newPosition >= selectableValues.length) {
              return prev
            }
            return {
              positionInArray: newPosition,
              variable: selectableValues[newPosition].variable,
            }
          })
          break
        case 'ArrowUp':
          setSelectedVariable((prev) => {
            const newPosition = getNextSelectableIndex(prev.positionInArray, -1)
            if (newPosition < 0 || (newPosition === prev.positionInArray && prev.positionInArray !== -1)) {
              return prev
            }
            return {
              positionInArray: newPosition,
              variable: selectableValues[newPosition].variable,
            }
          })
          break
        case 'Tab':
        case 'Enter':
          if (selectedVariable.positionInArray === -1) {
            const implicit = resolveImplicitSubmitOption()
            if (implicit) {
              if (implicit.type === 'instance') {
                handleSelectInstance(implicit.variable.name)
                break
              }
              submitAutocompletion({ variable: implicit.variable })
            } else {
              // Nothing matched and no 'add' option available; close
              // the autocomplete to give the user clear feedback.
              closeModal()
            }
          } else {
            const chosen = selectableValues[selectedVariable.positionInArray]
            if (chosen?.type === 'instance') {
              handleSelectInstance(chosen.variable.name)
              break
            }
            if (chosen && chosen.type !== 'separator') {
              submitAutocompletion({
                variable: chosen.variable,
              })
            }
          }
          break
        default:
          break
      }
      setKeyDown('')
    }, [keyDown, selectableValues])

    useEffect(() => {
      setKeyDown((prev) => keyPressed || prev)
    }, [keyPressed])

    useEffect(() => {
      scrollWhenSelectedIsChanged()
    }, [selectedVariable])

    const scrollWhenSelectedIsChanged = () => {
      if (variablesDivRef.current) {
        const selectedElement = variablesDivRef.current.children[selectedVariable.positionInArray]
        selectedElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }

    return (
      <Popover.Root open={isOpen ? isOpen : false}>
        <Popover.Trigger asChild>
          <span className='inline-block h-0 w-0' />
        </Popover.Trigger>
        <Popover.Portal>
          {selectableValues.length > 0 && (
            <Popover.Content
              align='center'
              side='bottom'
              sideOffset={5}
              className='box flex min-w-36 max-w-56 w-fit flex-col items-center rounded-lg bg-white text-xs text-neutral-950 outline-none dark:bg-neutral-950 dark:text-white'
              ref={popoverRef}
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={closeModal}
              onEscapeKeyDown={closeModal}
              onPointerDownOutside={handleOutsideInteraction}
              onFocusOutside={handleOutsideInteraction}
              onInteractOutside={handleOutsideInteraction}
              onFocus={(e) => {
                if (focusEvent) focusEvent(e)
                setAutocompleteFocus(true)
              }}
              onBlur={() => setAutocompleteFocus(false)}
              onKeyDown={(e) => setKeyDown(e.key)}
            >
              {variables && variables.length > 0 && (
                <>
                  <div className='h-fit w-full p-1'>
                    <div className='flex max-h-32 w-full flex-col overflow-y-auto' ref={variablesDivRef}>
                      {(variables as AutocompleteVariableItem[]).map((variable, index) => {
                        if (variable.isSeparator) {
                          return (
                            <div
                              key={`separator-${index}`}
                              className='my-2 h-[2px] w-full shrink-0 rounded-sm bg-neutral-400 dark:bg-neutral-500'
                            />
                          )
                        }

                        if (variable.isInstance) {
                          return (
                            <div
                              key={variable.name}
                              className={cn(
                                'relative flex h-fit w-full cursor-pointer select-none items-center justify-center p-1 text-xs hover:bg-neutral-600 dark:hover:bg-neutral-900',
                                {
                                  'bg-neutral-400 dark:bg-neutral-800':
                                    selectedVariable.variable.name === variable.name,
                                },
                              )}
                              onMouseDown={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleSelectInstance(variable.name)
                              }}
                            >
                              <span className='font-medium'>{variable.name}</span>
                              <span className='absolute right-2 text-[10px] text-neutral-400 dark:text-neutral-500'>›</span>
                            </div>
                          )
                        }

                        return (
                          <div
                            key={variable.name}
                            className={cn(
                              'flex h-fit w-full cursor-pointer select-none items-center justify-center p-1 hover:bg-neutral-600 dark:hover:bg-neutral-900',
                              {
                                'bg-neutral-400 dark:bg-neutral-800':
                                  selectedVariable.variable.name === variable.name,
                              },
                            )}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              submitAutocompletion({
                                variable: {
                                  id: variable.id ?? '',
                                  name: variable.name,
                                },
                              })
                            }}
                          >
                            {variable.name}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  {(canCreateNewVariable || newBlock.canCreate) && (
                    <div className='h-px w-full bg-neutral-300 dark:bg-neutral-700' />
                  )}
                </>
              )}
              {canCreateNewVariable && (
                <>
                  <div
                    className={cn(
                      'flex h-fit w-full cursor-pointer flex-row items-center justify-center border-0 p-1 hover:bg-neutral-600 dark:hover:bg-neutral-900',
                      {
                        'bg-neutral-400 dark:bg-neutral-800': newBlock.canCreate
                          ? selectedVariable.positionInArray === selectableValues.length - 2
                          : selectedVariable.positionInArray === selectableValues.length - 1,
                        'rounded-b-lg': !newBlock.canCreate && variables && variables.length > 0,
                        'rounded-lg': !variables || variables.length === 0,
                      },
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      submitAutocompletion({
                        variable: newBlock.canCreate
                          ? selectableValues[selectableValues.length - 2].variable
                          : selectableValues[selectableValues.length - 1].variable,
                      })
                    }}
                  >
                    <PlusIcon className='h-3 w-3 stroke-brand' />
                    <div className='ml-2'>Add variable</div>
                  </div>
                  {newBlock.canCreate && <div className='h-px w-full bg-neutral-300 dark:bg-neutral-700' />}
                </>
              )}
              {newBlock.canCreate && (
                <div
                  className={cn(
                    'flex h-fit w-full cursor-pointer flex-row items-center justify-center  border-0 p-1 hover:bg-neutral-600 dark:hover:bg-neutral-900',
                    {
                      'bg-neutral-400 dark:bg-neutral-800':
                        selectedVariable.positionInArray === selectableValues.length - 1,
                      'rounded-b-lg': variables && variables.length > 0,
                      'rounded-lg': !variables || variables.length === 0,
                    },
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (newBlock.options) {
                      submitAutocompletion({ variable: selectableValues[selectableValues.length - 1].variable })
                    }
                  }}
                >
                  <PlusIcon className='h-3 w-3 stroke-brand' />
                  <div className='ml-2'>{newBlock.options?.label}</div>
                </div>
              )}
            </Popover.Content>
          )}
        </Popover.Portal>
      </Popover.Root>
    )
  },
)
