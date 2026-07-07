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
import { getLiteralType } from '../../../../../utils/keywords'
import { validateVariableType } from '../../../../../utils/PLC/validate-variable-type'
import { toast } from '../../../../_features/[app]/toast/use-toast'
import { useBoundPou } from '../../../../_features/[workspace]/editor/graphical/active-context'
import { GraphicalEditorAutocomplete } from '../../autocomplete'
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
    }: VariablesBlockAutoCompleteProps,
    ref,
  ) => {
    const pouName = useBoundPou()
    const {
      project: {
        data: { pous },
      },
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

    const localVariableCandidates = useMemo<ScopeCompletion[]>(() => {
      if (blockType === 'block') return []

      const needle = valueToSearch.toLowerCase()
      const variables = pous.find((pou) => pou.name === pouName)?.interface?.variables ?? []

      return variables
        .filter((variable) => variable.name.toLowerCase().includes(needle))
        .filter((variable) => {
          if (!expectedType) return true
          const variableType = variable.type?.value
          if (!variableType) return false
          return validateVariableType(variableType, expectedType).isValid
        })
        .map((variable) => ({
          label: variable.name,
          insertText: variable.name,
          type: variable.type?.value,
        }))
    }, [blockType, expectedType, pous, pouName, valueToSearch])

    const mergedCandidates = useMemo<ScopeCompletion[]>(() => {
      const byInsertText = new Map<string, ScopeCompletion>()

      for (const candidate of candidates) {
        byInsertText.set(candidate.insertText.toLowerCase(), candidate)
      }

      for (const candidate of localVariableCandidates) {
        const key = candidate.insertText.toLowerCase()
        if (!byInsertText.has(key)) byInsertText.set(key, candidate)
      }

      return [...byInsertText.values()]
    }, [candidates, localVariableCandidates])

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

      // The dropdown items are LSP candidates keyed by their full insert text
      // (e.g. `TON0.Q`); bind the node to the chosen one, carrying its type.
      const candidate = mergedCandidates.find((c) => c.insertText.toLowerCase() === variable.name.toLowerCase())
      if (!candidate) return

      submitVariableToBlock(scopeCompletionToVariable(candidate))
    }

    return (
      <GraphicalEditorAutocomplete
        ref={ref}
        className={cn('h-[200px] w-[200px] overflow-auto', isOpen ? 'block' : 'hidden')}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        keyPressed={keyPressed}
        searchValue={valueToSearch}
        variables={mergedCandidates.map((c) => ({ id: c.insertText, name: c.insertText }))}
        submit={submit}
        keepOpenForElementId={keepOpenForElementId}
        keepOpenForSelector={keepOpenForSelector}
      />
    )
  },
)

export { VariablesBlockAutoComplete }
