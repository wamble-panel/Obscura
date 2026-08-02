import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Base({ size = 18, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const Icons = {
  gauge: (p: IconProps) => (
    <Base {...p}>
      <path d="M3 12h4l2.5 7 5-16L17 12h4" />
    </Base>
  ),
  calendar: (p: IconProps) => (
    <Base {...p}>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </Base>
  ),
  receipt: (p: IconProps) => (
    <Base {...p}>
      <path d="M5 3.5h14v17l-2.5-1.6-2.4 1.6-2.1-1.6L9.5 20.5 7 18.9 5 20.5z" />
      <path d="M9 8h6M9 12h6" />
    </Base>
  ),
  truck: (p: IconProps) => (
    <Base {...p}>
      <path d="M2.5 6.5h10v9h-10z" />
      <path d="M12.5 9.5H17l3.5 3.2v2.8h-8z" />
      <circle cx="6.5" cy="17.5" r="2" />
      <circle cx="16.5" cy="17.5" r="2" />
    </Base>
  ),
  camera: (p: IconProps) => (
    <Base {...p}>
      <path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h2l1.4-2h6.2l1.4 2h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="12.5" r="3.3" />
    </Base>
  ),
  folder: (p: IconProps) => (
    <Base {...p}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h4l2 2.5h5A2.5 2.5 0 0 1 20 9v8.5A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5z" />
    </Base>
  ),
  users: (p: IconProps) => (
    <Base {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.1 2.5-5.2 5.5-5.2s5.5 2.1 5.5 5.2M16.8 11.4a3.2 3.2 0 0 0 0-6.4M19 20c0-2.5-1.4-4.4-3.5-5" />
    </Base>
  ),
  team: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="7.5" r="3.4" />
      <path d="M5 20c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2" />
    </Base>
  ),
  wallet: (p: IconProps) => (
    <Base {...p}>
      <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2z" />
      <path d="M16 11.5h4v3.5h-4a1.75 1.75 0 0 1 0-3.5z" />
    </Base>
  ),
  shield: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 3l7 2.8v5.4c0 4.3-2.9 8.1-7 9.3-4.1-1.2-7-5-7-9.3V5.8z" />
      <path d="M9.2 12.2l2 2 3.6-3.8" />
    </Base>
  ),
  activity: (p: IconProps) => (
    <Base {...p}>
      <path d="M3 12h3.5l2-5.5 3.5 11 2.5-7 1.6 1.5H21" />
    </Base>
  ),
  settings: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </Base>
  ),
  plus: (p: IconProps) => (
    <Base strokeWidth={2.3} {...p}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  ),
  close: (p: IconProps) => (
    <Base strokeWidth={2.2} {...p}>
      <path d="M18 6L6 18M6 6l12 12" />
    </Base>
  ),
  chevronLeft: (p: IconProps) => (
    <Base strokeWidth={2.2} {...p}>
      <path d="M15 18l-6-6 6-6" />
    </Base>
  ),
  chevronRight: (p: IconProps) => (
    <Base strokeWidth={2.2} {...p}>
      <path d="M9 18l6-6-6-6" />
    </Base>
  ),
  chevronDown: (p: IconProps) => (
    <Base strokeWidth={2.2} {...p}>
      <path d="M6 9l6 6 6-6" />
    </Base>
  ),
  check: (p: IconProps) => (
    <Base strokeWidth={2.4} {...p}>
      <path d="M4.5 12.5l5 5 10-11" />
    </Base>
  ),
  search: (p: IconProps) => (
    <Base {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </Base>
  ),
  globe: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M2.8 12h18.4M12 2.8c2.9 3.1 2.9 15.3 0 18.4M12 2.8c-2.9 3.1-2.9 15.3 0 18.4" />
    </Base>
  ),
  logout: (p: IconProps) => (
    <Base {...p}>
      <path d="M15 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3" />
      <path d="M10 16l-4-4 4-4M6 12h10" />
    </Base>
  ),
  trash: (p: IconProps) => (
    <Base {...p}>
      <path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 12.5A1.5 1.5 0 0 0 8.8 21h6.4a1.5 1.5 0 0 0 1.5-1.5L17.5 7" />
    </Base>
  ),
  edit: (p: IconProps) => (
    <Base {...p}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" />
    </Base>
  ),
  clock: (p: IconProps) => (
    <Base {...p}>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 7v5.3l3.4 2" />
    </Base>
  ),
  phone: (p: IconProps) => (
    <Base {...p}>
      <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" />
    </Base>
  ),
  download: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 3.5v11M7.5 10.5l4.5 4.5 4.5-4.5M4.5 19.5h15" />
    </Base>
  ),
  alert: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 3.5l9 16H3z" />
      <path d="M12 9.5v4.2M12 17h.01" />
    </Base>
  ),
  refresh: (p: IconProps) => (
    <Base {...p}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5" />
    </Base>
  ),
  arrowUp: (p: IconProps) => (
    <Base strokeWidth={2.1} {...p}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Base>
  ),
  arrowDown: (p: IconProps) => (
    <Base strokeWidth={2.1} {...p}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Base>
  ),
  dots: (p: IconProps) => (
    <Base {...p}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" />
    </Base>
  ),
  menu: (p: IconProps) => (
    <Base strokeWidth={2} {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  ),
  /* House-rule pictograms — each is the whole badge: ring, slash and symbol. */
  noSmoking: (p: IconProps) => (
    <Base strokeWidth={1.6} {...p}>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M5.5 18.5L18.5 5.5" />
      <path d="M6.2 13.4h7.6v2.4H6.2z" />
      <path d="M16.1 13.4h1.7v2.4h-1.7" />
      <path d="M15.4 6.3c1.1.7 1.4 1.9.8 2.9M17.6 7.6c.9.6 1.2 1.6.7 2.5" />
    </Base>
  ),
  noPets: (p: IconProps) => (
    <Base strokeWidth={1.6} {...p}>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M5.5 18.5L18.5 5.5" />
      <ellipse cx="9.2" cy="11.4" rx="1.15" ry="1.5" />
      <ellipse cx="12.4" cy="10.4" rx="1.15" ry="1.5" />
      <ellipse cx="15.3" cy="11.9" rx="1.1" ry="1.4" />
      <path d="M9.6 15.9c0-1.5 1.2-2.5 2.6-2.5s2.6 1 2.6 2.5c0 1.1-1.1 1.6-2.6 1.6s-2.6-.5-2.6-1.6z" />
    </Base>
  ),
  noAlcohol: (p: IconProps) => (
    <Base strokeWidth={1.6} {...p}>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M5.5 18.5L18.5 5.5" />
      <path d="M10.7 5.6h2.6v2.6l1.7 2.6v6.4a1.1 1.1 0 0 1-1.1 1.1h-3.8a1.1 1.1 0 0 1-1.1-1.1v-6.4l1.7-2.6z" />
      <path d="M9 13.1h6" />
    </Base>
  ),
  share: (p: IconProps) => (
    <Base {...p}>
      <path d="M12 3.5v11M8.5 7l3.5-3.5L15.5 7" />
      <path d="M5.5 12v7a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-7" />
    </Base>
  ),
} as const

export type IconName = keyof typeof Icons

export function Icon({ name, ...props }: { name: IconName } & IconProps) {
  const Cmp = Icons[name] ?? Icons.dots
  return <Cmp {...props} />
}
