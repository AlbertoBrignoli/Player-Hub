import React, { useEffect, useRef, useState } from 'react'

export interface LightboxItem {
  id: string
  url: string | null
  name?: string | null
}

// Galleria a tutto schermo: frecce/tastiera su desktop, swipe su telefono.
// `actions` permette di iniettare bottoni contestuali (es. Approva/Scarta).
export default function Lightbox({ items, index, onIndex, onClose, actions }: {
  items: LightboxItem[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  actions?: (item: LightboxItem) => React.ReactNode
}) {
  const item = items[index]
  const [dx, setDx] = useState(0)
  const touch = useRef<{ x: number; y: number } | null>(null)

  const prev = () => onIndex(index > 0 ? index - 1 : items.length - 1)
  const next = () => onIndex(index < items.length - 1 ? index + 1 : 0)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', h)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = '' }
  }, [index, items.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return null

  function onTouchStart(e: React.TouchEvent) {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!touch.current) return
    const ddx = e.touches[0].clientX - touch.current.x
    const ddy = e.touches[0].clientY - touch.current.y
    if (Math.abs(ddx) > Math.abs(ddy)) setDx(ddx)
  }
  function onTouchEnd() {
    if (Math.abs(dx) > 60) { dx > 0 ? prev() : next() }
    setDx(0); touch.current = null
  }

  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lightbox-top" onClick={e => e.stopPropagation()}>
        <span className="lightbox-count">{index + 1} / {items.length}</span>
        <span className="lightbox-name">{item.name}</span>
        <button className="lightbox-x" onClick={onClose}>×</button>
      </div>

      {items.length > 1 && <button className="lightbox-arrow lightbox-l" onClick={e => { e.stopPropagation(); prev() }}>‹</button>}
      <div className="lightbox-stage" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        {item.url
          ? <img src={item.url} alt={item.name || ''} onClick={e => e.stopPropagation()}
              style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? 'none' : 'transform .2s' }} />
          : <div className="lightbox-ph">Anteprima non disponibile</div>}
      </div>
      {items.length > 1 && <button className="lightbox-arrow lightbox-r" onClick={e => { e.stopPropagation(); next() }}>›</button>}

      {actions && (
        <div className="lightbox-actions" onClick={e => e.stopPropagation()}>
          {actions(item)}
        </div>
      )}
    </div>
  )
}
