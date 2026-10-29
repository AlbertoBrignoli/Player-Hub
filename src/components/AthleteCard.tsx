// Biglietto da visita dell'atleta: sullo sfondo l'anteprima di Player Hub, con foto, nome,
// squadra, la casella AUVI a cui mandare documenti e comunicazioni e il QR per scaricare l'app
// e unirsi al team. Lo stesso disegno si vede, si scarica (.png, o .vcf come contatto) e si condivide.
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { toast } from '../lib/toast'
import { useLang } from '../lib/i18n'
import { initials } from '../lib/format'
import Icon from './Icon'

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

// 1200×630 (stesso formato dell'anteprima dell'app), disegnato a 2x per essere nitido
async function render(d: CardData, L: Labels, en: boolean): Promise<Blob> {
  const W = 1200, H = 630, S = 2
  const c = document.createElement('canvas'); c.width = W * S; c.height = H * S
  const g = c.getContext('2d')!
  g.scale(S, S)
  const joinUrl = `${APP}/${en ? 'download' : 'scarica'}`
  const [bg, logo, photo, qr] = await Promise.all([
    loadImg(en ? '/og-player-hub-en.jpg' : '/og-player-hub.jpg'),
    loadImg('/brand/auvi-wordmark-white.svg'),
    d.photo ? loadImg(d.photo, true) : Promise.resolve(null),
    QRCode.toDataURL(joinUrl, { width: 600, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0A0A0A', light: '#FFFFFF' } }).then(u => loadImg(u)),
  ])
  g.fillStyle = '#0A0A0A'; g.fillRect(0, 0, W, H)
  if (bg) g.drawImage(bg, 0, 0, W, H)
  // velo scuro a sinistra: si legge il biglietto, a destra resta il telefono con l'app
  const grad = g.createLinearGradient(0, 0, 860, 0)
  grad.addColorStop(0, 'rgba(10,10,10,1)'); grad.addColorStop(0.8, 'rgba(10,10,10,1)'); grad.addColorStop(0.9, 'rgba(10,10,10,.75)'); grad.addColorStop(1, 'rgba(10,10,10,0)')
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
  if (photo) { g.fillStyle = '#fff'; g.fillRect(px, py, ps, ps); g.drawImage(photo, px, py, ps, ps) }
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

  useEffect(() => {
    let ok = true, u: string | null = null
    render(d, L, en).then(b => { if (!ok) return; u = URL.createObjectURL(b); setBlob(b); setUrl(u) })
      .catch(() => { if (ok) setUrl(null) })
    return () => { ok = false; if (u) URL.revokeObjectURL(u) }
  }, [d.name, d.email, d.photo, d.team, d.position, lang]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <a className="btn btn-sm btn-ghost" href={`mailto:${d.email}`}><Icon name="mail" size={13} /> {d.email}</a>
      </div>
    </div>
  )
}
