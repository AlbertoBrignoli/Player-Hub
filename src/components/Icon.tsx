import React from 'react'

// Set di icone a tratto (stile SF Symbols / Feather): niente emoji,
// colore ereditato da currentColor, peso coerente ovunque.
const P: Record<string, React.ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
  home: <><path d="M3 9.5 12 3l9 6.5" /><path d="M5 8.5V21h14V8.5" /><path d="M9 21v-7h6v7" /></>,
  activity: <path d="M22 12h-4l-3 8L9 4l-3 8H2" />,
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2.5" /><path d="M16 2v4M8 2v4M3 9.5h18" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="8.7" cy="8.7" r="1.6" /><path d="M21 15.5 15.5 10 5 20.5" /></>,
  message: <path d="M21 14.5a2 2 0 0 1-2 2H7.5L3 20.5V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  folder: <path d="M22 18.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2.2 2.8H20a2 2 0 0 1 2 2z" />,
  'folder-plus': <><path d="M22 18.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2.2 2.8H20a2 2 0 0 1 2 2z" /><path d="M12 10.5v6M9 13.5h6" /></>,
  file: <><path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" /><path d="M14 2.5V8h5.5" /></>,
  briefcase: <><rect x="2.5" y="7" width="19" height="13.5" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></>,
  archive: <><path d="M21 8.5V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20V8.5" /><rect x="1.5" y="3" width="21" height="5.5" rx="1" /><path d="M10 13h4" /></>,
  award: <><circle cx="12" cy="8.5" r="5.5" /><path d="M8.6 13 7 22l5-3 5 3-1.6-9" /></>,
  'check-square': <><path d="M9 11.5l2.5 2.5L21 4.5" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  sliders: <><path d="M4 21v-6M4 9V3M12 21v-9M12 6V3M20 21v-4M20 11V3" /><path d="M1.5 15h5M9.5 12h5M17.5 17h5" /></>,
  bell: <><path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5" /><path d="M13.7 20.5a2 2 0 0 1-3.4 0" /></>,
  key: <path d="M21 2.5 19 4.5m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8Zm0 0L15.5 8m0 0 3 3 3.5-3.5-3-3L15.5 8Z" />,
  logout: <><path d="M9 21H5.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2H9" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  lock: <><rect x="4.5" y="11" width="15" height="10" rx="2" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" /></>,
  upload: <><path d="M21 15.5v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" /><path d="M17 8.5 12 3.5l-5 5M12 3.5v12" /></>,
  download: <><path d="M21 15.5v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" /><path d="M7 10.5l5 5 5-5M12 15.5v-12" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="M20 6.5 9 17.5l-5-5" />,
  star: <path d="m12 2.8 2.9 5.9 6.5 1-4.7 4.5 1.1 6.4L12 17.6l-5.8 3-1.1-6.4L.4 9.7l6.5-1z" />,
  trash: <><path d="M3 6.5h18" /><path d="M8 6.5v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6.5" /><path d="M10 11v6M14 11v6" /></>,
  menu: <path d="M4 6.5h16M4 12h16M4 17.5h16" />,
  ball: <><circle cx="12" cy="12" r="9" /><path d="m12 7.2 4.6 3.3-1.8 5.4H9.2l-1.8-5.4z" /><path d="M12 3v4.2M19.5 8l-2.9 2.5M17 19.3l-2.2-3.4M7 19.3l2.2-3.4M4.5 8l2.9 2.5" /></>,
  camera: <><path d="M23 18.5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h3.5l2-3h7l2 3H21a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>,
  edit: <path d="M17 3.5a2.8 2.8 0 1 1 4 4L7.5 21 2 22.5 3.5 17z" />,
  smartphone: <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M12 18h.01" /></>,
  layers: <><path d="m12 2.5 10 5.5-10 5.5L2 8z" /><path d="m2 13.5 10 5.5 10-5.5" /></>,
  pin: <><path d="M20 10.5c0 6-8 11-8 11s-8-5-8-11a8 8 0 1 1 16 0" /><circle cx="12" cy="10.5" r="2.8" /></>,
  inbox: <><path d="M22 12.5h-6l-2 3h-4l-2-3H2" /><path d="M5 4.5h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2" /></>,
  send: <path d="M22 2.5 11 13.5M22 2.5l-7 19-4-8-8.5-4z" />,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7.5" r="3.5" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M15.5 4.1a3.5 3.5 0 0 1 0 6.8" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  instagram: <><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" /><circle cx="12" cy="12" r="4.1" /><circle cx="17.4" cy="6.6" r="1.15" fill="currentColor" stroke="none" /></>,
  mail: <><rect x="2.5" y="4.5" width="19" height="15" rx="2.5" /><path d="m3.5 6.5 8.5 6 8.5-6" /></>,
  cake: <><path d="M4 21h16M5 21v-8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8" /><path d="M4 15c1.5 1.5 2.5 1.5 4 0s2.5-1.5 4 0 2.5 1.5 4 0 2.5-1.5 4 0" /><path d="M12 7V4M8.5 7V5M15.5 7V5" /></>,
}

export default function Icon({ name, size = 18, strokeWidth = 1.8, className, style }: {
  name: string; size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true">
      {P[name] || null}
    </svg>
  )
}
