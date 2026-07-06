import { useEffect, useState } from 'react'

// True quando il viewport è da telefono. Reattivo a rotazioni/resize.
// 880px = stessa soglia del CSS (sidebar → tab bar).
export function useIsMobile(bp = 880) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(`(max-width:${bp}px)`).matches)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${bp}px)`)
    const h = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', h)
    setMobile(mq.matches)
    return () => mq.removeEventListener('change', h)
  }, [bp])
  return mobile
}
