import { createElement, Fragment, type ReactNode } from 'react'

import { lookup } from './tr'

/**
 * Like tr(), for a sentence with markup inside: each `{{name}}` becomes the given node.
 * Example: 'Sign in to {{device}}.' with { device: a strong element holding the name }.
 */
export function trRich(text: string, nodes: Readonly<Record<string, ReactNode>>): ReactNode[] {
  return lookup(text)
    .split(/(\{\{\s*\w+\s*\}\})/)
    .map((part, index) => {
      const key = /^\{\{\s*(\w+)\s*\}\}$/.exec(part)?.[1]
      const node = key !== undefined && Object.prototype.hasOwnProperty.call(nodes, key) ? nodes[key] : part
      return createElement(Fragment, { key: index }, node)
    })
}
