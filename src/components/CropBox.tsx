// Ritaglio foto: trascini per centrare (dito o mouse), ingrandisci con lo slider o la rotella.
// Esporta esattamente il riquadro visibile (es. 4:5 per i momenti, 1:1 per la foto profilo).
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

export type CropHandle = { toBlob: () => Promise<Blob | null> }

export const CropBox = forwardRef<CropHandle, { file: File; aspect: number; outW: number; round?: boolean; maxW?: number }>(
  function CropBox({ file, aspect, outW, round, maxW = 340 }, ref) {
    const box = useRef<HTMLDivElement>(null)
    const [img, setImg] = useState<HTMLImageElement | null>(null)
    const [url, setUrl] = useState('')
    const [W, setW] = useState(0)
    const [zoom, setZoom] = useState(1)
    const [off, setOff] = useState({ x: 0, y: 0 })
    const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
    const H = W / aspect

    useEffect(() => {
      const u = URL.createObjectURL(file); setUrl(u)
      const im = new Image(); im.onload = () => { setImg(im); setZoom(1) }; im.src = u
      return () => URL.revokeObjectURL(u)
    }, [file])
    useEffect(() => {
      const el = box.current; if (!el) return
      const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth)
      return () => ro.disconnect()
    }, [])

    const base = img && W ? Math.max(W / img.naturalWidth, H / img.naturalHeight) : 1
    const dw = img ? img.naturalWidth * base * zoom : 0
    const dh = img ? img.naturalHeight * base * zoom : 0
    const clamp = (x: number, y: number) => ({ x: Math.min(0, Math.max(W - dw, x)), y: Math.min(0, Math.max(H - dh, y)) })
    // centra solo alla prima apertura della foto; se poi cambia la larghezza (rotazione, barra di
    // scorrimento) tiene la posizione scelta, solo riportata dentro al riquadro
    const centered = useRef<HTMLImageElement | null>(null)
    useEffect(() => {
      if (!img || !W) return
      if (centered.current !== img) { centered.current = img; setOff({ x: (W - dw) / 2, y: (H - dh) / 2 }) }
      else setOff(o => clamp(o.x, o.y))
    }, [img, W]) // eslint-disable-line react-hooks/exhaustive-deps
    function setZoomCentered(z: number) {
      const cx = W / 2 - off.x, cy = H / 2 - off.y, k = z / zoom
      const nw = (img?.naturalWidth || 0) * base * z, nh = (img?.naturalHeight || 0) * base * z
      setZoom(z)
      setOff({ x: Math.min(0, Math.max(W - nw, W / 2 - cx * k)), y: Math.min(0, Math.max(H - nh, H / 2 - cy * k)) })
    }

    useImperativeHandle(ref, () => ({
      toBlob: async () => {
        if (!img || !W) return null
        const outH = Math.round(outW / aspect)
        const c = document.createElement('canvas'); c.width = outW; c.height = outH
        const s = base * zoom
        c.getContext('2d')!.drawImage(img, -off.x / s, -off.y / s, W / s, H / s, 0, 0, outW, outH)
        return await new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.88))
      },
    }), [img, W, H, off, zoom, base, outW, aspect])

    return (
      <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
        <div ref={box}
          style={{ width: '100%', maxWidth: maxW, height: H || undefined, aspectRatio: String(aspect), position: 'relative', overflow: 'hidden',
            borderRadius: round ? '50%' : 18, background: 'var(--bg-2)', touchAction: 'none', cursor: drag.current ? 'grabbing' : 'grab', userSelect: 'none' }}
          onPointerDown={e => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y } }}
          onPointerMove={e => { const d = drag.current; if (d) setOff(clamp(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y)) }}
          onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
          onWheel={e => setZoomCentered(Math.min(4, Math.max(1, zoom - e.deltaY * 0.0015)))}>
          {url && img && <img src={url} alt="" draggable={false}
            style={{ position: 'absolute', left: off.x, top: off.y, width: dw, height: dh, maxWidth: 'none', pointerEvents: 'none' }} />}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 'inherit', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.35)',
            backgroundImage: 'linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px)',
            backgroundSize: `${W / 3}px ${H / 3}px`, backgroundPosition: '-1px -1px' }} />
        </div>
        <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={e => setZoomCentered(Number(e.target.value))}
          style={{ width: '100%', maxWidth: maxW, accentColor: '#0A0A0A' }} aria-label="zoom" />
      </div>
    )
  })
