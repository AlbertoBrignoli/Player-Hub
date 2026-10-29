// Biglietto da visita dell'atleta: sullo sfondo l'anteprima di Player Hub, con foto, nome,
// squadra, la casella AUVI a cui mandare documenti e comunicazioni e il QR per scaricare l'app
// e unirsi al team. Lo stesso disegno si vede, si scarica (.png, o .vcf come contatto) e si condivide.
// Si può cambiare la foto e mettere come sfondo una propria immagine in trasparenza (resta sul dispositivo).
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { toast } from '../lib/toast'
import { useLang } from '../lib/i18n'
import { initials } from '../lib/format'
import Icon from './Icon'
import { Modal, Spinner, Empty } from './ui'
import { supabase } from '../lib/supabase'
import { useAthlete } from '../lib/athlete'
import { isImageFile } from '../lib/format'

export type CardData = { name: string; position?: string | null; team?: string | null; photo?: string | null; email: string }

const APP = 'https://playerhub.auviagency.com'
const safe = (s: string) => s.replace(/[^\w.-]+/g, '_')
const esc = (s: string) => s.replace(/([\\,;])/g, '\\$1')
const FONT = '-apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif'

function vcard(d: CardData, joinUrl: string) {
  const [first, ...rest] = d.name.split(' ')
  return [
    'BEGIN:VCARD', 'VERSION:3.0',
    `N:${esc(rest.join(' '))};${esc(first)};;;`,
    `FN:${esc(d.name)}`,
    d.team ? `ORG:${esc(d.team)}` : '',
    d.position ? `TITLE:${esc(d.position)}` : '',
    `EMAIL;TYPE=INTERNET,WORK:${d.email}`,
    `URL:${joinUrl}`,
    'NOTE:Documenti e comunicazioni: questa casella arriva all\'atleta e ad AUVI Agency. Player Hub: ' + joinUrl,
    'END:VCARD',
  ].filter(Boolean).join('\r\n')
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const loadImg = (src: string, cors = false) => new Promise<HTMLImageElement | null>(res => {
  const im = new Image(); if (cors) im.crossOrigin = 'anonymous'
  im.onload = () => res(im); im.onerror = () => res(null); im.src = src
  setTimeout(() => res(null), 5000)
})

type Labels = { team: string; send: string; join: string; joinSub: string; scan: string }
export type Look = { photo?: string | null; bg?: string | null; alpha: number }

// immagine che riempie il riquadro tagliando i bordi (come object-fit: cover)
function cover(g: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const k = Math.max(w / im.width, h / im.height)
  const sw = w / k, sh = h / k
  g.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h)
}

// 1200×630 (stesso formato dell'anteprima dell'app), disegnato a 2x per essere nitido
async function render(d: CardData, L: Labels, en: boolean, look: Look): Promise<Blob> {
  const W = 1200, H = 630, S = 2
  const c = document.createElement('canvas'); c.width = W * S; c.height = H * S
  const g = c.getContext('2d')!
  g.scale(S, S)
  const joinUrl = `${APP}/${en ? 'download' : 'scarica'}`
  const photoSrc = look.photo || d.photo
  const [bg, logo, photo, qr] = await Promise.all([
    loadImg(look.bg || (en ? '/og-player-hub-en.jpg' : '/og-player-hub.jpg')),
    loadImg('/brand/auvi-wordmark-white.svg'),
    photoSrc ? loadImg(photoSrc, !photoSrc.startsWith('data:')) : Promise.resolve(null),
    QRCode.toDataURL(joinUrl, { width: 600, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0A0A0A', light: '#FFFFFF' } }).then(u => loadImg(u)),
  ])
  g.fillStyle = '#0A0A0A'; g.fillRect(0, 0, W, H)
  if (bg && look.bg) { g.globalAlpha = look.alpha; cover(g, bg, 0, 0, W, H); g.globalAlpha = 1 }
  else if (bg) g.drawImage(bg, 0, 0, W, H)
  // velo scuro a sinistra: si legge il biglietto, a destra resta il telefono con l'app
  const grad = g.createLinearGradient(0, 0, 860, 0)
  if (look.bg) {   // con la foto scelta il velo è più leggero, perché la foto si veda
    grad.addColorStop(0, 'rgba(10,10,10,.82)'); grad.addColorStop(0.65, 'rgba(10,10,10,.55)'); grad.addColorStop(1, 'rgba(10,10,10,0)')
  } else {
    grad.addColorStop(0, 'rgba(10,10,10,1)'); grad.addColorStop(0.8, 'rgba(10,10,10,1)'); grad.addColorStop(0.9, 'rgba(10,10,10,.75)'); grad.addColorStop(1, 'rgba(10,10,10,0)')
  }
  g.fillStyle = grad; g.fillRect(0, 0, W, H)
  g.fillStyle = '#FFE600'; g.fillRect(0, 0, 8, H)

  const fit = (txt: string, weight: number, size: number, max: number) => {
    do { g.font = `${weight} ${size}px ${FONT}`; size -= 1 } while (g.measureText(txt).width > max && size > 14)
  }
  g.textBaseline = 'alphabetic'; g.textAlign = 'left'

  let lx = 64
  if (logo) {
    const lh = 24, lw = lh * (127.21 / 33.16)   // proporzioni del viewBox del logo
    g.drawImage(logo, 64, 51, lw, lh); lx = 64 + lw + 14
  } else { g.fillStyle = '#FFFFFF'; g.font = `900 22px ${FONT}`; g.fillText('AUVI', 64, 72); lx = 128 }
  g.fillStyle = 'rgba(255,255,255,.8)'; g.font = `800 15px ${FONT}`; g.fillText('PLAYER HUB', lx, 70)

  // foto e nome
  const px = 64, py = 104, ps = 124
  g.save(); g.beginPath(); g.arc(px + ps / 2, py + ps / 2, ps / 2, 0, Math.PI * 2); g.clip()
  if (photo) { g.fillStyle = '#fff'; g.fillRect(px, py, ps, ps); cover(g, photo, px, py, ps, ps) }
  else {
    g.fillStyle = '#FFE600'; g.fillRect(px, py, ps, ps)
    g.fillStyle = '#0A0A0A'; g.font = `900 46px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(initials(d.name), px + ps / 2, py + ps / 2 + 2)
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'
  }
  g.restore()
  g.strokeStyle = '#FFE600'; g.lineWidth = 3
  g.beginPath(); g.arc(px + ps / 2, py + ps / 2, ps / 2 + 2, 0, Math.PI * 2); g.stroke()

  const tx = 214, tw = 560
  g.fillStyle = '#FFE600'; g.font = `800 14px ${FONT}`; g.fillText(L.team.toUpperCase(), tx, 140)
  g.fillStyle = '#FFFFFF'; fit(d.name.toUpperCase(), 900, 46, tw); g.fillText(d.name.toUpperCase(), tx, 188)
  g.fillStyle = 'rgba(255,255,255,.72)'; fit([d.position, d.team].filter(Boolean).join(' · '), 500, 21, tw)
  g.fillText([d.position, d.team].filter(Boolean).join(' · '), tx, 220)

  // casella AUVI
  g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(64, 262, 700, 1)
  g.fillStyle = '#FFE600'; g.font = `800 14px ${FONT}`; g.fillText(L.send.toUpperCase(), 64, 302)
  g.fillStyle = '#FFFFFF'; fit(d.email, 800, 34, 700); g.fillText(d.email, 64, 344)

  // QR per scaricare l'app e unirsi al team
  const qx = 64, qy = 392, qs = 176
  g.fillStyle = '#FFFFFF'
  g.beginPath(); (g as any).roundRect ? (g as any).roundRect(qx, qy, qs, qs, 16) : g.rect(qx, qy, qs, qs); g.fill()
  if (qr) g.drawImage(qr, qx + 12, qy + 12, qs - 24, qs - 24)
  const jx = qx + qs + 28
  g.fillStyle = '#FFE600'; g.font = `800 14px ${FONT}`; g.fillText(L.join.toUpperCase(), jx, qy + 44)
  g.fillStyle = '#FFFFFF'; fit(L.joinSub, 800, 26, 520); g.fillText(L.joinSub, jx, qy + 82)
  g.fillStyle = 'rgba(255,255,255,.75)'; g.font = `600 19px ${FONT}`; g.fillText(joinUrl.replace('https://', ''), jx, qy + 118)
  g.fillStyle = 'rgba(255,255,255,.5)'; g.font = `500 15px ${FONT}`; g.fillText(L.scan, jx, qy + 150)

  return await new Promise(res => c.toBlob(b => res(b!), 'image/png'))
}

export default function AthleteCard({ d }: { d: CardData }) {
  const { t, lang } = useLang()
  const en = lang === 'en'
  const joinUrl = `${APP}/${en ? 'download' : 'scarica'}`
  const L: Labels = {
    team: t('Il team di'),
    send: t('Manda documenti e comunicazioni a'),
    join: t('Unisciti al team'),
    joinSub: t('Scarica Player Hub e collegati'),
    scan: t('Inquadra il QR con la fotocamera'),
  }
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [look, setLook] = useState<Look>({ alpha: 0.55 })
  const [editing, setEditing] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)
  const bgRef = useRef<HTMLInputElement>(null)

  // le immagini scelte si leggono in locale (lato lungo max 1600 px), non si caricano da nessuna parte
  const [library, setLibrary] = useState<'photo' | 'bg' | null>(null)
  async function pick(f: Blob | undefined, key: 'photo' | 'bg') {
    if (!f) return
    try {
      const bmp = await createImageBitmap(f)
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
      const src = c.toDataURL('image/jpeg', 0.88)
      setLook(l => ({ ...l, [key]: src }))
    } catch { toast(t('Immagine non disponibile'), 'err') }
  }

  useEffect(() => {
    let ok = true, u: string | null = null
    render(d, L, en, look).then(b => { if (!ok) return; u = URL.createObjectURL(b); setBlob(b); setUrl(u) })
      .catch(() => { if (ok) setUrl(null) })
    return () => { ok = false; if (u) URL.revokeObjectURL(u) }
  }, [d.name, d.email, d.photo, d.team, d.position, lang, look]) // eslint-disable-line react-hooks/exhaustive-deps

  const file = `${safe(d.name)}-player-hub`
  function savePng() { if (blob) download(blob, `${file}.png`); else toast(t('Immagine non disponibile'), 'err') }
  function saveVcf() { download(new Blob([vcard(d, joinUrl)], { type: 'text/vcard' }), `${safe(d.name)}.vcf`) }
  async function share() {
    const text = `${d.name}${d.team ? ' · ' + d.team : ''}\n${L.send}: ${d.email}\n${L.joinSub}: ${joinUrl}`
    try {
      if (blob) {
        const f = new File([blob], `${file}.png`, { type: 'image/png' })
        if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], text }); return }
      }
      if (navigator.share) { await navigator.share({ text }); return }
    } catch { return /* condivisione annullata */ }
    try { await navigator.clipboard.writeText(text); toast(t('Biglietto copiato')) } catch { /* no-op */ }
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ borderRadius: 18, overflow: 'hidden', background: '#0A0A0A', aspectRatio: '1200 / 630', position: 'relative' }}>
        {url
          ? <img src={url} alt={`${d.name} · Player Hub`} style={{ width: '100%', height: '100%', display: 'block' }} />
          : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.5)', fontSize: 13 }}>{t('Preparo il biglietto…')}</div>}
      </div>
      <div className="flex gap" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-sm btn-primary" onClick={share}><Icon name="send" size={13} /> {t('Condividi')}</button>
        <button className="btn btn-sm" onClick={savePng}><Icon name="image" size={13} /> {t('Scarica immagine')}</button>
        <button className="btn btn-sm" onClick={saveVcf}><Icon name="download" size={13} /> {t('Scarica contatto')}</button>
        <button className={`btn btn-sm ${editing ? 'btn-primary' : ''}`} onClick={() => setEditing(v => !v)}><Icon name="sliders" size={13} /> {t('Personalizza')}</button>
        <a className="btn btn-sm btn-ghost" href={`mailto:${d.email}`}><Icon name="mail" size={13} /> {d.email}</a>
      </div>
      {editing && (
        <div className="card" style={{ marginTop: 10, display: 'grid', gap: 12 }}>
          <div className="flex gap" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 13, width: 96 }}>{t('Foto')}</span>
            <button className="btn btn-sm btn-primary" onClick={() => setLibrary('photo')}><Icon name="image" size={13} /> {t('Da Player Hub')}</button>
            <button className="btn btn-sm" onClick={() => photoRef.current?.click()}><Icon name="camera" size={13} /> {t('Dal dispositivo')}</button>
            {look.photo && <button className="btn btn-sm btn-ghost" onClick={() => setLook(l => ({ ...l, photo: null }))}>{t('Usa la foto del profilo')}</button>}
          </div>
          <div className="flex gap" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 13, width: 96 }}>{t('Sfondo')}</span>
            <button className="btn btn-sm btn-primary" onClick={() => setLibrary('bg')}><Icon name="image" size={13} /> {t('Da Player Hub')}</button>
            <button className="btn btn-sm" onClick={() => bgRef.current?.click()}><Icon name="camera" size={13} /> {t('Dal dispositivo')}</button>
            {look.bg && <button className="btn btn-sm btn-ghost" onClick={() => setLook(l => ({ ...l, bg: null }))}>{t('Torna a Player Hub')}</button>}
          </div>
          {look.bg && (
            <label className="flex gap" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: 13, width: 96 }}>{t('Trasparenza')}</span>
              <input type="range" min={15} max={100} value={Math.round(look.alpha * 100)} style={{ flex: 1, minWidth: 160 }}
                onChange={e => setLook(l => ({ ...l, alpha: Number(e.target.value) / 100 }))} />
              <span className="faint" style={{ fontSize: 12, width: 38, textAlign: 'right' }}>{Math.round(look.alpha * 100)}%</span>
            </label>
          )}
          <div className="faint" style={{ fontSize: 11.5 }}>{t('Le foto scelte restano sul tuo dispositivo e servono solo a creare il biglietto.')}</div>
          <input ref={photoRef} type="file" accept="image/*" hidden onChange={e => { pick(e.target.files?.[0], 'photo'); e.target.value = '' }} />
          {library && <MediaPicker title={library === 'photo' ? t('Scegli la foto') : t('Scegli lo sfondo')}
            onClose={() => setLibrary(null)} onPick={b => { pick(b, library); setLibrary(null) }} />}
          <input ref={bgRef} type="file" accept="image/*" hidden onChange={e => { pick(e.target.files?.[0], 'bg'); e.target.value = '' }} />
        </div>
      )}
    </div>
  )
}

// Le foto dell'atleta già in Player Hub (Media), divise per cartella: si sceglie con un tocco.
type Med = { id: string; storage_path: string; file_name: string | null; folder: string | null; created_at: string }
function MediaPicker({ title, onClose, onPick }: { title: string; onClose: () => void; onPick: (b: Blob) => void }) {
  const { t } = useLang()
  const { athleteId } = useAthlete()
  const [rows, setRows] = useState<Med[] | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [folder, setFolder] = useState<string>('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!athleteId) { setRows([]); return }
    let ok = true
    ;(async () => {
      const { data } = await supabase.from('crm_media').select('id, storage_path, file_name, folder, created_at')
        .eq('player_id', athleteId).neq('status', 'scartata').order('created_at', { ascending: false }).limit(400)
      const list = ((data as Med[]) || []).filter(m => isImageFile(m.file_name || m.storage_path))
      if (!ok) return
      setRows(list)
      for (let i = 0; i < list.length; i += 60) {
        const { data: su } = await supabase.storage.from('crm-media').createSignedUrls(list.slice(i, i + 60).map(m => m.storage_path), 3600)
        if (!ok || !su) continue
        const next: Record<string, string> = {}
        su.forEach(d => { if (d.signedUrl && d.path) next[d.path] = d.signedUrl })
        setUrls(u => ({ ...u, ...next }))
      }
    })()
    return () => { ok = false }
  }, [athleteId])

  const folders = [...new Set((rows || []).map(m => m.folder || ''))]
  const shown = (rows || []).filter(m => !folder || (m.folder || '') === folder)

  async function choose(m: Med) {
    const u = urls[m.storage_path]; if (!u) return
    setBusy(m.id)
    try { onPick(await (await fetch(u)).blob()) }
    catch { toast(t('Immagine non disponibile'), 'err') }
    finally { setBusy(null) }
  }

  return (
    <Modal title={title} onClose={onClose} wide dismissable>
      {rows === null ? <Spinner /> : rows.length === 0
        ? <Empty icon={<Icon name="image" size={30} strokeWidth={1.4} />} title={t('Nessuna foto')} hint={t('Le foto caricate in Media compaiono qui.')} />
        : <div className="grid" style={{ gap: 12 }}>
            {folders.length > 1 && (
              <div className="pill-tabs wrap" style={{ alignSelf: 'start' }}>
                <button className={`pill-tab ${!folder ? 'active' : ''}`} onClick={() => setFolder('')}>{t('Tutte')}</button>
                {folders.map(f => <button key={f || '-'} className={`pill-tab ${folder === f && f ? 'active' : ''}`} onClick={() => setFolder(f)}>{f || t('Senza cartella')}</button>)}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, maxHeight: '60vh', overflowY: 'auto' }}>
              {shown.map(m => (
                <button key={m.id} onClick={() => choose(m)} disabled={!!busy}
                  style={{ aspectRatio: '1', padding: 0, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: 'var(--bg-2)', position: 'relative' }}>
                  {urls[m.storage_path] && <img src={urls[m.storage_path]} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                  {busy === m.id && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.4)' }}><Spinner /></span>}
                </button>
              ))}
            </div>
          </div>}
    </Modal>
  )
}
