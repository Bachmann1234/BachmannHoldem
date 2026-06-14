/**
 * The small set of line/solid UI glyphs the M4.5 navigation shell needs (ticket 0046) — recreated as
 * TSX from the design bundle's `components.jsx` `Icon` set. These are UI affordance glyphs (not
 * illustration): the tab-bar icons (play / learn / drills), the path medallion marks (check / lock),
 * the forward chevron, and the back arrow used by the lesson player's app bar.
 *
 * Each is a tiny pure SVG that inherits `currentColor`, so the primer CSS colours them via the parent
 * (e.g. `.tab.active` → accent). Extra SVG props (a `style`/`className`/size override) pass through.
 */

import type { SVGProps } from 'react'

/** A solid play triangle — the Play tab. */
export function PlayIcon(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  )
}

/** A mortarboard — the Learn tab. */
export function LearnIcon(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinejoin="round"
      strokeLinecap="round"
      {...props}
    >
      <path d="M3 6.5L12 4l9 2.5L12 9 3 6.5z" />
      <path d="M7 9v5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V9" />
    </svg>
  )
}

/** A target — the Drills tab (locked in M4.5). */
export function DrillsIcon(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      {...props}
    >
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.4" />
      <circle cx="12" cy="12" r="0.4" fill="currentColor" />
    </svg>
  )
}

/** A back arrow — the lesson app bar's back affordance. */
export function BackIcon(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

/** A forward chevron — the start/resume tags and the Resume CTA. */
export function ChevIcon(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

/** A check mark — a completed path node's medallion. */
export function CheckIcon(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 12l5 5L20 6" />
    </svg>
  )
}

/** A padlock — a locked path node's medallion. */
export function LockIcon(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
