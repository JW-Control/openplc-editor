import { Node } from '@xyflow/react'
import { ComponentPropsWithRef, forwardRef, useEffect, useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

import { PLCVariable } from '../../../../../../middleware/shared/ports'
import {
  getScopeCompletions,
  newVariableTypeForExpected,
  type ScopeCompletion,
  scopeCompletionToVariable,
} from '../../../../../services/graphical-scope'
import { useOpenPLCStore } from '../../../../../store'
import { cn } from '../../../../../utils/cn'
import { getLiteralType, isLegalIdentifier } from '../../../../../utils/keywords'
import { validateVariableType } from '../../../../../utils/PLC/validate-variable-type'
import { toast } from '../../../../_features/[app]/toast/use-toast'
import { useBoundPou } from '../../../../_features/[workspace]/editor/graphical/active-context'
import { findFunctionBlockVariables, findStructureVariables, PouVariable } from '../../../../../utils/pou-helpers'
import { AutocompleteVariableItem, GraphicalEditorAutocomplete } from '../../autocomplete'
import { getLadderPouVariablesRungNodeAndEdges } from '../utils'
import { BasicNodeData, BlockNodeData, BlockVariant, LadderBlockConnectedVariables, VariableNode } from '../utils/types'

type VariablesBlockAutoCompleteProps = ComponentPropsWithRef<'div'> & {
  block: unknown
  blockType?: 'variable' | 'coil' | 'contact' | 'block' | 'other'
  isOpen?: boolean
  setIsOpen?: (isOpen: boolean) => void
  keyPressed?: string
  valueToSearch: string
  keepOpenForElementId?: string
  keepOpenForSelector?: string
  onBeforeSubmit?: (variableName: string) => void
  onDrillDown?: (instanceName: string) => void
}

/**
 * The IEC type a box accepts, used to filter LSP completions and to type a
 * newly-created variable. Contacts/coils are BOOL; a variable node on a
 * block pin inherits the pin's type (which may be a generic like ANY_NUM).
 * Everything else is unconstrained.
 */
const expectedTypeForBlock = (
  block: unknown,
  blockType: VariablesBlockAutoCompleteProps['blockType'],
): string | undefined => {
  switch (blockType) {
    case 'contact':
    case 'coil':
      return 'BOOL'
    case 'variable':
      return (block as VariableNode).data.block.variableType.type.value
    default:
      return undefined
  }
}

const VariablesBlockAutoComplete = forwardRef<HTMLDivElement, VariablesBlockAutoCompleteProps>(
  (
    {
      block,
      blockType = 'other',
      isOpen,
      setIsOpen,
      keyPressed,
      valueToSearch,
      keepOpenForElementId,
      keepOpenForSelector,
      onBeforeSubmit,
      onDrillDown,
    }: VariablesBlockAutoCompleteProps,
    ref,
  ) => {
    const pouName = useBoundPou()
    const {
      project: {
        data: { pous, dataTypes, configurations },
      },
      libraries,
      projectActions: { createVariable },
      ladderFlows,
      ladderFlowActions: { updateNode },
    } = useOpenPLCStore()

    const expectedType = expectedTypeForBlock(block, blockType)

    // LSP-backed candidates (variables + instance/struct members in scope),
    // filtered by the box's expected type. The block-name box has no
    // variable autocomplete.
    const [candidates, setCandidates] = useState<ScopeCompletion[]>([])
    useEffect(() => {
      if (blockType === 'block') {
        setCandidates([])
        return
      }
      let cancelled = false
      void getScopeCompletions(pouName, valueToSearch, expectedType).then((items) => {
        if (!cancelled) setCandidates(items)
      })
      return () => {
        cancelled = true
      }
    }, [pouName, valueToSearch, expectedType, blockType, pous])

    const allVariables = useMemo<PLCVariable[]>(() => {
      const pouVars = pous.find((pou) => pou.name === pouName)?.interface?.variables ?? []
      const globalVars = configurations?.resource?.globalVariables ?? []
      return [...pouVars, ...globalVars]
    }, [pous, pouName, configurations])

    const getCompatibleMembers = (varType: string | undefined): PouVariable[] => {
      if (!varType) return []
      const fbVars = findFunctionBlockVariables(varType, pous, libraries?.system ?? [])
      const members = fbVars ?? findStructureVariables(varType, dataTypes ?? []) ?? []
      if (!expectedType) return members
      return members.filter((m) => {
        const memberType = m.type?.value
        return memberType ? validateVariableType(memberType, expectedType).isValid : false
      })
    }

    const autocompleteItems = useMemo<AutocompleteVariableItem[]>(() => {
      if (blockType === 'block') return []

      // If valueToSearch contains a dot '.', we are completing members of an instance/struct
      if (valueToSearch.includes('.')) {
        const dotIndex = valueToSearch.lastIndexOf('.')
        const prefix = valueToSearch.slice(0, dotIndex).trim()
        const memberSearch = valueToSearch.slice(dotIndex + 1).trim().toLowerCase()

        const instanceVar = allVariables.find((v) => v.name.toLowerCase() === prefix.toLowerCase())
        let localMembers: AutocompleteVariableItem[] = []
        if (instanceVar) {
          const compMembers = getCompatibleMembers(instanceVar.type?.value)
          localMembers = compMembers
            .filter((m) => m.name.toLowerCase().includes(memberSearch))
            .map((m) => ({
              id: `${instanceVar.name}.${m.name}`,
              name: `${instanceVar.name}.${m.name}`,
              type: m.type?.value,
              isInstance: false,
            }))
        }

        // Merge with LSP candidates for the dotted expression
        const byName = new Map<string, AutocompleteVariableItem>()
        for (const item of localMembers) {
          byName.set(item.name.toLowerCase(), item)
        }
        for (const c of candidates) {
          const key = c.insertText.toLowerCase()
          if (!byName.has(key)) {
            byName.set(key, {
              id: c.insertText,
              name: c.insertText,
              type: c.type,
              isInstance: false,
            })
          }
        }
        return [...byName.values()]
      }

      // valueToSearch does NOT contain a dot:
      // Show direct variables matching expectedType, a separator '------', and FB instances below.
      const needle = valueToSearch.trim().toLowerCase()

      const directVars: AutocompleteVariableItem[] = allVariables
        .filter((v) => v.name.toLowerCase().includes(needle))
        .filter((v) => {
          if (!expectedType) return true
          const vt = v.type?.value
          if (!vt) return false
          return validateVariableType(vt, expectedType).isValid
        })
        .map((v) => ({
          id: v.name,
          name: v.name,
          type: v.type?.value,
          isInstance: false,
        }))

      // Instances (variables that have compatible members)
      const instanceVars: AutocompleteVariableItem[] = allVariables
        .filter((v) => v.name.toLowerCase().includes(needle))
        .filter((v) => {
          const members = getCompatibleMembers(v.type?.value)
          return members.length > 0
        })
        .map((v) => ({
          id: v.name,
          name: v.name,
          type: v.type?.value,
          isInstance: true,
        }))

      // Merge direct vars with LSP candidates (non-dotted)
      const directMap = new Map<string, AutocompleteVariableItem>()
      for (const dv of directVars) {
        directMap.set(dv.name.toLowerCase(), dv)
      }
      for (const c of candidates) {
        if (!c.insertText.includes('.')) {
          const key = c.insertText.toLowerCase()
          if (!directMap.has(key)) {
            directMap.set(key, {
              id: c.insertText,
              name: c.insertText,
              type: c.type,
              isInstance: false,
            })
          }
        }
      }

      const result: AutocompleteVariableItem[] = [...directMap.values()]

      if (instanceVars.length > 0) {
        if (result.length > 0) {
          result.push({
            id: '__separator__',
            name: '------',
            isSeparator: true,
          })
        }
        result.push(...instanceVars)
      }

      return result
    }, [blockType, valueToSearch, allVariables, pous, libraries, dataTypes, expectedType, candidates])

    const submitVariableToBlock = (variable: PLCVariable) => {
      const { rung, node: variableNode } = getLadderPouVariablesRungNodeAndEdges(pouName, pous, ladderFlows, {
        nodeId: (block as Node<BasicNodeData>).id,
      })
      if (!rung || !variableNode) return

      updateNode({
        editorName: pouName,
        rungId: rung.id,
        nodeId: variableNode.id,
        node: {
          ...variableNode,
          data: {
            ...variableNode.data,
            variable: variable,
          },
        },
      })

      // Check if the variable is connected to a block
      if ((variableNode as VariableNode).data.block === undefined) return

      // Get the block that is connected to the variable
      const relatedBlock = rung.nodes.find((node) => node.id === (variableNode as VariableNode).data.block.id)
      if (!relatedBlock) return

      const existingConnected = Array.isArray((relatedBlock.data as BlockNodeData<BlockVariant>).connectedVariables)
        ? (relatedBlock.data as BlockNodeData<BlockVariant>).connectedVariables
        : []
      const connectedVariables: LadderBlockConnectedVariables = [
        ...existingConnected.filter(
          (v) =>
            v.type !== variableNode.data.variant || v.handleId !== (variableNode as VariableNode).data.block.handleId,
        ),
        {
          handleId: (variableNode as VariableNode).data.block.handleId,
          handleTableId: (relatedBlock.data as BlockNodeData<BlockVariant>).variant.variables.find(
            (v) => v.name === (variableNode as VariableNode).data.block.handleId,
          )?.id,
          type: (variableNode as VariableNode).data.variant,
          variable: variable,
        },
      ]

      // Update the block to include the variable
      updateNode({
        editorName: pouName,
        rungId: rung.id,
        nodeId: relatedBlock.id,
        node: {
          ...relatedBlock,
          data: {
            ...relatedBlock.data,
            connectedVariables: connectedVariables,
          },
        },
      })
    }

    const submitAddVariable = ({ variableName }: { variableName: string }) => {
      if (!variableName.trim()) {
        // For variable nodes on block handles, clearing the name resets the variable
        // so that a branch (contacts/coils) can be placed on the handle instead.
        if (blockType === 'variable') {
          const { rung, node: variableNode } = getLadderPouVariablesRungNodeAndEdges(pouName, pous, ladderFlows, {
            nodeId: (block as Node<BasicNodeData>).id,
          })
          if (rung && variableNode) {
            updateNode({
              editorName: pouName,
              rungId: rung.id,
              nodeId: variableNode.id,
              node: {
                ...variableNode,
                data: {
                  ...variableNode.data,
                  variable: { id: '', name: '' },
                },
              },
            })
          }
          return
        }

        toast({
          title: 'Invalid variable name',
          description: 'Variable name cannot be empty',
          variant: 'fail',
        })
        return
      }

      const { rung, node } = getLadderPouVariablesRungNodeAndEdges(pouName, pous, ladderFlows, {
        nodeId: (block as Node<BasicNodeData>).id,
      })
      if (!rung || !node) return

      // If the entry can't be a new variable NAME — a member/array reference
      // (`some_struct.field`, `arr[3]`), a typed literal (`T#500ms`), a reserved
      // word, etc. — don't try to create a variable. Bind it to the node
      // verbatim as a constant/reference; strucpp validates the expression. New
      // local-variable creation is only for plain, legal identifiers.
      if (!isLegalIdentifier(variableName)[0]) {
        updateNode({
          editorName: pouName,
          rungId: rung.id,
          nodeId: node.id,
          node: { ...node, data: { ...node.data, variable: { name: variableName } } },
        })
        return
      }

      const variableType = newVariableTypeForExpected(expectedType)

      const res = createVariable({
        data: {
          id: uuidv4(),
          name: variableName,
          type: {
            definition: variableType.definition,
            value: variableType.value,
          },
          class: 'local',
          location: '',
          documentation: '',
          debug: false,
        },
        scope: 'local',
        associatedPou: pouName,
      })
      if (!res.ok) {
        toast({
          title: res.title ?? 'Error',
          description: res.message ?? 'Failed to create variable',
          variant: 'fail',
        })
        return
      }

      const variable = res.data as PLCVariable | undefined

      updateNode({
        editorName: pouName,
        rungId: rung.id,
        nodeId: node.id,
        node: {
          ...node,
          data: {
            ...node.data,
            variable: variable ?? { id: '', name: '' },
          },
        },
      })
    }

    const submit = ({ variable }: { variable: { id: string; name: string } }) => {
      if (variable.id === 'add') {
        // A literal value (e.g. 2.0, TRUE, 'hello') binds directly to the
        // block rather than creating a variable.
        if (getLiteralType(valueToSearch)) {
          submitVariableToBlock({ name: valueToSearch } as PLCVariable)
          return
        }
        submitAddVariable({ variableName: valueToSearch })
        return
      }

      // Check if it matches an autocomplete item
      const item = autocompleteItems.find((c) => c.name.toLowerCase() === variable.name.toLowerCase())
      if (item && !item.isSeparator && !item.isInstance) {
        submitVariableToBlock(
          scopeCompletionToVariable({
            label: item.name,
            insertText: item.name,
            type: item.type,
          }),
        )
        return
      }

      const candidate = candidates.find((c) => c.insertText.toLowerCase() === variable.name.toLowerCase())
      if (candidate) {
        submitVariableToBlock(scopeCompletionToVariable(candidate))
        return
      }

      submitVariableToBlock({ name: variable.name } as PLCVariable)
    }

    return (
      <GraphicalEditorAutocomplete
        ref={ref}
        className={cn('h-[200px] w-[200px] overflow-auto', isOpen ? 'block' : 'hidden')}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        keyPressed={keyPressed}
        searchValue={valueToSearch}
        variables={autocompleteItems}
        onSelectInstance={(instanceName) => {
          onDrillDown?.(instanceName)
        }}
        submit={submit}
        keepOpenForElementId={keepOpenForElementId}
        keepOpenForSelector={keepOpenForSelector}
        onBeforeSubmit={({ variable }) => onBeforeSubmit?.(variable.name)}
      />
    )
  },
)

export { VariablesBlockAutoComplete }
