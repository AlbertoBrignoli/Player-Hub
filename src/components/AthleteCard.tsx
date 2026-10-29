// Biglietto da visita dell'atleta: nome, ruolo, squadra e la casella AUVI a cui il team
// manda documenti e comunicazioni. Si scarica come contatto (.vcf, si apre in Contatti)
// o come immagine (.png), oppure si condivide: serve a far entrare altre persone.
import { toast } from '../lib/toast'
import { useLang } from '../lib/i18n'
import { initials } from '../lib/format'
import Icon from './Icon'

export type CardData = { name: string; position?: string | null; team?: string | null; photo?: string | null; email: string }

const safe = (s: string) => s.replace(/[^\w.-]+/g, '_')
const esc = (s: string) => s.replace(/([\\,;])/g, '\\$1')

function vcard(d: CardData) {
  const [first, ...rest] = d.name.split(' ')
  return [
    'BEGIN:VCARD', 'VERSION:3.0',
    `N:${esc(rest.join(' '))};${esc(first)};;;`,
    `FN:${esc(d.name)}`,
    d.team ? `ORG:${esc(d.team)}` : '',
    d.position ? `TITLE:${esc(d.position)}` : '',
    `EMAIL;TYPE=INTERNET,WORK:${d.email}`,
    'NOTE:Documenti e comunicazioni: questa casella arriva all\'atleta e ad AUVI Agency (Player Hub).',
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

// immagine 1200×700 disegnata su canvas (la foto si prova a caricare; se non si può, iniziali)
async function renderPng(d: CardData, kicker: string, sendLabel: string): Promise<Blob> {
  const W = 1200, H = 700
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#0A0A0A'; g.fillRect(0, 0, W, H)
  g.fillStyle = '#FFE600'; g.fillRect(0, 0, 14, H)
  const photo = d.photo ? await new Promise<HTMLImageElement | null>(res => {
    const im = new Image(); im.crossOrigin = 'anonymous'
    im.onload = () => res(im); im.onerror = () => res(null); im.src = d.photo!
    setTimeout(() => res(null), 4000)
  }) : null
  const px = 90, py = 110, ps = 190
  g.save(); g.beginPath(); g.arc(px + ps / 2, py + ps / 2, ps / 2, 0, Math.PI * 2); g.closePath(); g.clip()
  if (photo) { g.fillStyle = '#fff'; g.fillRect(px, py, ps, ps); g.drawImage(photo, px, py, ps, ps) }
  else {
    g.fillStyle = '#FFE600'; g.fillRect(px, py, ps, ps)
    g.fillStyle = '#0A0A0A'; g.font = '800 72px -apple-system, Helvetica, Arial, sans-serif'
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(initials(d.name), px + ps / 2, py + ps / 2 + 4)
  }
  g.restore()
  g.textAlign = 'left'; g.textBaseline = 'alphabetic'
  g.fillStyle = '#FFE600'; g.font = '800 26px -apple-system, Helvetica, Arial, sans-serif'
  g.fillText(kicker.toUpperCase(), 330, 150)
  const fit = (txt: string, weight: number, size: number, max: number) => {
    do { g.font = `${weight} ${size}px -apple-system, Helvetica, Arial, sans-serif`; size -= 2 } while (g.measureText(txt).width > max && size > 20)
  }
  g.fillStyle = '#FFFFFF'; fit(d.name, 900, 72, W - 330 - 90)
  g.fillText(d.name, 330, 235)
  g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '500 34px -apple-system, Helvetica, Arial, sans-serif'
  g.fillText([d.position, d.team].filter(Boolean).join(' · '), 330, 290)
  g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(90, 410, W - 180, 2)
  g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '700 26px -apple-system, Helvetica, Arial, sans-serif'
  g.fillText(sendLabel.toUpperCase(), 90, 480)
  g.fillStyle = '#FFFFFF'; fit(d.email, 800, 52, W - 180)
  g.fillText(d.email, 90, 550)
  g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '700 26px -apple-system, Helvetica, Arial, sans-serif'
  g.textAlign = 'right'; g.fillText('AUVI · PLAYER HUB', W - 90, 640)
  return await new Promise(res => c.toBlob(b => res(b!), 'image/png'))
}

export default function AthleteCard({ d }: { d: CardData }) {
  const { t } = useLang()
  const kicker = t('Biglietto da visita')
  const sendLabel = t('Manda documenti e comunicazioni a')

  async function saveVcf() {
    download(new Blob([vcard(d)], { type: 'text/vcard' }), `${safe(d.name)}.vcf`)
  }
  async function savePng() {
    try { download(await renderPng(d, kicker, sendLabel), `${safe(d.name)}-biglietto.png`) }
    catch { toast(t('Immagine non disponibile'), 'err') }
  }
  async function share() {
    const text = `${d.name}${d.team ? ' · ' + d.team : ''}\n${sendLabel}: ${d.email}`
    try {
      const file = new File([await renderPng(d, kicker, sendLabel)], `${safe(d.name)}-biglietto.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return }
      if (navigator.share) { await navigator.share({ text }); return }
    } catch { return /* condivisione annullata */ }
    try { await navigator.clipboard.writeText(text); toast(t('Biglietto copiato')) } catch { /* no-op */ }
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18, background: '#0A0A0A', color: '#fff', padding: '22px 22px 18px 26px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: 'var(--yellow, #FFE600)' }} />
        <div className="flex gap" style={{ alignItems: 'center', gap: 16 }}>
          {d.photo
            ? <img src={d.photo} alt="" style={{ width: 64, height: 64, borderRadius: 32, objectFit: 'cover', background: '#fff', flexShrink: 0 }} />
            : <span style={{ width: 64, height: 64, borderRadius: 32, background: 'var(--yellow, #FFE600)', color: '#0A0A0A', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 22, flexShrink: 0 }}>{initials(d.name)}</span>}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10.5, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800, color: 'var(--yellow, #FFE600)' }}>{kicker}</div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -.3, marginTop: 2 }}>{d.name}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)' }}>{[d.position, d.team].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,.12)', marginTop: 16, paddingTop: 14 }}>
          <div style={{ fontSize: 10.5, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 700, color: 'rgba(255,255,255,.6)' }}>{sendLabel}</div>
          <a href={`mailto:${d.email}`} style={{ display: 'block', fontSize: 18, fontWeight: 800, color: '#fff', textDecoration: 'none', wordBreak: 'break-all', marginTop: 2 }}>{d.email}</a>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 4 }}>{t("La casella AUVI dell'atleta: arriva a lui e ad AUVI, dentro l'app.")}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 10.5, letterSpacing: 1.4, fontWeight: 800, color: 'rgba(255,255,255,.45)', marginTop: 10 }}>AUVI · PLAYER HUB</div>
      </div>
      <div className="flex gap" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={saveVcf}><Icon name="download" size={13} /> {t('Scarica contatto')}</button>
        <button className="btn btn-sm" onClick={savePng}><Icon name="image" size={13} /> {t('Scarica immagine')}</button>
        <button className="btn btn-sm btn-primary" onClick={share}><Icon name="send" size={13} /> {t('Condividi')}</button>
      </div>
    </div>
  )
}
