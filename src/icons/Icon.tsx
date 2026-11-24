import { createElement, type SVGProps } from 'react'
import type { IconNode } from './icons'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  node: IconNode
  size?: number
}

/** Renders a lucide icon node as inline SVG with presentation attributes, so it survives SVG export. */
export function Icon({ node, size = 18, stroke = 'currentColor', strokeWidth = 2, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {node.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  )
}
