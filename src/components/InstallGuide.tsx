// Guida all'installazione di Player Hub sul telefono + QR code da inquadrare o stampare.
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import Icon from './Icon'
import { useLang } from '../lib/i18n'
import { toast } from '../lib/toast'
import { INSTALL_URL, INSTALL_URL_EN, canPromptInstall, detectPlatform, onInstallChange, promptInstall, type Platform } from '../lib/install'

// QR del link di installazione: SVG nitido a ogni misura; "Scarica" lo salva in PNG per stamparlo.
export function QrCode({ url = INSTALL_URL, size = 200, download = false }: { url?: string; size?: number; download?: boolean }) {
  const { t } = useLang()
  const [svg, setSvg] = useState('')
  useEffect(() => {
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0A0A0A', light: '#FFFFFF' } })
      .then(setSvg).catch(() => setSvg(''))
  }, [url])
  async function save() {
    const png = await QRCode.toDataURL(url, { width: 1200, margin: 2, errorCorrectionLevel: 'M' })
    const a = document.createElement('a')
    a.href = png; a.download = 'player-hub-qr.png'; a.click()
  }
  return (
    <div className="ig-qr-wrap">
      <div className="ig-qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} aria-label={t('QR code per installare Player Hub')} role="img" />
      {download && <button className="btn btn-sm" onClick={save}><Icon name="download" size={13} /> {t('Scarica il QR')}</button>}
    </div>
  )
}

// Condividi il link (WhatsApp, Messaggi, Mail… dal menu del telefono) o copialo
export function ShareInstall({ compact = false, url = INSTALL_URL, en = false }: { compact?: boolean; url?: string; en?: boolean }) {
  const { t } = useLang()
  // il messaggio segue la lingua del link (es. versione inglese per un atleta straniero)
  const text = en ? 'Get Player Hub on your phone: your AUVI space always at hand.' : t('Scarica Player Hub sul telefono: il tuo spazio AUVI sempre a portata di mano.')
  async function share() {
    if ((navigator as any).share) {
      try { await (navigator as any).share({ title: 'Player Hub', text, url }); return } catch { /* annullato */ }
    }
    copy()
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); toast(t('Link copiato')) } catch { toast(url) }
  }
  return (
    <div className="flex gap" style={{ gap: 8, flexWrap: 'wrap', justifyContent: compact ? 'flex-start' : 'center' }}>
      <a className="btn btn-sm" href={`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`} target="_blank" rel="noreferrer">
        <Icon name="message" size={13} /> WhatsApp
      </a>
      <button className="btn btn-sm" onClick={share}><Icon name="send" size={13} /> {t('Condividi')}</button>
      <button className="btn btn-sm btn-ghost" onClick={copy}><Icon name="copy" size={13} /> {t('Copia link')}</button>
    </div>
  )
}

// Icona "Condividi" di Safari, per riconoscerla al volo
const ShareGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: '-3px' }}>
    <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
  </svg>
)
const PlusGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ verticalAlign: '-3px' }}>
    <rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" />
  </svg>
)

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return <div className="ig-step"><span className="ig-n">{n}</span><div>{children}</div></div>
}

// I passi giusti per il dispositivo che si sta usando
// forced: mostra i passi di un dispositivo preciso (es. da computer, per spiegare iPhone o Android)
export function InstallSteps({ onInstalled, forced }: { onInstalled?: () => void; forced?: Platform }) {
  const { t } = useLang()
  const [detected, setPlatform] = useState<Platform>(() => detectPlatform())
  const platform = forced || detected
  const [canPrompt, setCanPrompt] = useState(canPromptInstall())
  useEffect(() => onInstallChange(() => { setCanPrompt(canPromptInstall()); setPlatform(detectPlatform()) }), [])

  async function install() {
    const ok = await promptInstall()
    if (ok) { toast(t('Player Hub è sulla tua schermata Home')); onInstalled?.() }
  }

  if (platform === 'installed') return (
    <div className="ig-done"><Icon name="check" size={18} /> {t('Player Hub è già installata su questo telefono.')}</div>
  )
  if (platform === 'in-app') return (
    <div className="ig-steps">
      <div className="ig-lead">{t('Sei dentro un\'altra app (Instagram, WhatsApp…): da qui non si può installare.')}</div>
      <Step n={1}>{t('Tocca i tre puntini ⋯ in alto a destra')}</Step>
      <Step n={2}>{t('Scegli "Apri nel browser" (Safari su iPhone, Chrome su Android)')}</Step>
      <Step n={3}>{t('Si riapre questa pagina: segui i passi per aggiungerla alla Home')}</Step>
    </div>
  )
  if (platform === 'ios-other') return (
    <div className="ig-steps">
      <div className="ig-lead">{t('Su iPhone l\'installazione si fa da Safari.')}</div>
      <Step n={1}>{t('Copia il link qui sotto e aprilo in Safari')}</Step>
      <Step n={2}>{t('Poi tocca')} <b><ShareGlyph /> {t('Condividi')}</b> {t('e "Aggiungi alla schermata Home"')}</Step>
    </div>
  )
  if (platform === 'ios-safari') return (
    <div className="ig-steps">
      <Step n={1}>{t('Tocca')} <b><ShareGlyph /> {t('Condividi')}</b> {t('nella barra di Safari (in basso, o in alto su iPad)')}</Step>
      <Step n={2}>{t('Scorri e scegli')} <b><PlusGlyph /> {t('Aggiungi alla schermata Home')}</b></Step>
      <Step n={3}>{t('Tocca')} <b>{t('Aggiungi')}</b>: {t('l\'icona AUVI compare tra le tue app')}</Step>
      <div className="ig-hint">{t('Aprila sempre dall\'icona: è a schermo intero e ricevi le notifiche.')}</div>
      {!forced && <div className="ig-arrow" aria-hidden="true">↓</div>}
    </div>
  )
  if (platform === 'android') return (
    <div className="ig-steps">
      {canPrompt ? (
        <button className="btn btn-primary ig-big" onClick={install}><Icon name="download" size={16} /> {t('Installa Player Hub')}</button>
      ) : (
        <>
          <Step n={1}>{t('Tocca i tre puntini ⋮ in alto a destra di Chrome')}</Step>
          <Step n={2}>{t('Scegli "Installa app" o "Aggiungi a schermata Home"')}</Step>
          <Step n={3}>{t('Conferma: l\'icona AUVI compare tra le tue app')}</Step>
        </>
      )}
      <div className="ig-hint">{t('Aprila sempre dall\'icona: è a schermo intero e ricevi le notifiche.')}</div>
    </div>
  )
  // computer: si installa dal telefono inquadrando il QR
  return (
    <div className="ig-steps">
      <div className="ig-lead">{t('Inquadra il QR con la fotocamera del telefono: si apre la pagina con i passi per il tuo dispositivo.')}</div>
      {canPrompt && <button className="btn ig-big" onClick={install}><Icon name="download" size={16} /> {t('Installa anche su questo computer')}</button>}
    </div>
  )
}

export const IG_CSS = `
.ig-qr-wrap { display: grid; justify-items: center; gap: 10px; }
.ig-qr { background: #fff; border-radius: 18px; padding: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.18); }
.ig-qr svg { width: 100%; height: 100%; display: block; }
.ig-steps { display: grid; gap: 12px; text-align: left; }
.ig-lead { font-size: 14px; line-height: 1.45; }
.ig-step { display: flex; gap: 12px; align-items: flex-start; font-size: 15px; line-height: 1.45; }
.ig-step b { white-space: nowrap; }
.ig-n { flex-shrink: 0; width: 28px; height: 28px; border-radius: 999px; background: var(--yellow, #FFEC00); color: #0A0A0A; display: grid; place-items: center; font-weight: 900; font-size: 14px; }
.ig-hint { font-size: 12.5px; opacity: .75; line-height: 1.4; }
.ig-done { display: flex; align-items: center; gap: 8px; font-weight: 700; }
.ig-big { width: 100%; justify-content: center; height: 50px; font-size: 16px; display: inline-flex; align-items: center; gap: 8px; }
.ig-arrow { text-align: center; font-size: 28px; animation: ig-bob 1.4s ease-in-out infinite; }
@keyframes ig-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(8px) } }
`

// Promemoria in Home per chi usa Player Hub dal browser del telefono: apre la guida.
// Si chiude e ricompare dopo 7 giorni; sparisce quando l'app è installata.
const NUDGE_KEY = 'install-nudge-dismissed'
export function InstallNudge() {
  const { t } = useLang()
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform())
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(() => {
    try { return Date.now() - Number(localStorage.getItem(NUDGE_KEY) || 0) < 7 * 24 * 3600 * 1000 } catch { return false }
  })
  useEffect(() => onInstallChange(() => setPlatform(detectPlatform())), [])
  if (hidden || !['ios-safari', 'ios-other', 'android', 'in-app'].includes(platform)) return null
  const dismiss = () => { try { localStorage.setItem(NUDGE_KEY, String(Date.now())) } catch { /* modalità privata */ } setHidden(true) }
  return (
    <>
      <style>{IG_CSS}</style>
      <div className="nudge" role="region" aria-label={t('Installa Player Hub')} style={{ marginBottom: 16 }}>
        <img src="/icons/icon-192.png?v=5" alt="" width={40} height={40} style={{ borderRadius: 10, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div className="nudge-t">{t('Metti Player Hub nella schermata Home')}</div>
          <div className="nudge-s">{t('Si apre come un\'app, a schermo intero, e ti arrivano le notifiche del tuo team.')}</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={async () => {
          if (platform === 'android' && canPromptInstall()) { if (await promptInstall()) setHidden(true) } else setOpen(true)
        }}>{t('Come si fa')}</button>
        <button className="btn btn-ghost btn-sm" onClick={dismiss} aria-label={t('Non ora')} style={{ color: 'rgba(255,255,255,.7)' }}>
          <Icon name="x" size={16} />
        </button>
      </div>
      {open && (
        <div className="ig-sheet" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="ig-sheet-in" onClick={e => e.stopPropagation()}>
            <div className="flex between" style={{ alignItems: 'center' }}>
              <b style={{ fontSize: 17 }}>{t('Aggiungila alla Home in 3 tocchi')}</b>
              <button className="ev-ic" onClick={() => setOpen(false)} aria-label={t('Chiudi')}><Icon name="x" size={18} /></button>
            </div>
            <InstallSteps onInstalled={() => { setOpen(false); setHidden(true) }} />
          </div>
        </div>
      )}
    </>
  )
}

// Scheda in Impostazioni: QR e link per invitare atleti e staff a installare l'app
export function InstallInviteCard() {
  const { t } = useLang()
  const [en, setEn] = useState(false)
  const url = en ? INSTALL_URL_EN : INSTALL_URL
  return (
    <div className="card">
      <style>{IG_CSS}</style>
      <div className="card-head"><div className="card-title">{t('Player Hub sul telefono')}</div></div>
      <div className="flex gap" style={{ gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <QrCode size={150} download url={url} />
        <div style={{ flex: 1, minWidth: 220, display: 'grid', gap: 10 }}>
          <div className="faint" style={{ fontSize: 13, lineHeight: 1.5 }}>
            {t('Fai inquadrare il QR o manda il link: la pagina riconosce il telefono e spiega come aggiungere Player Hub alla schermata Home. Scarica il QR per stamparlo o metterlo in una presentazione.')}
          </div>
          <code style={{ fontSize: 12.5, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-2)', overflowWrap: 'anywhere' }}>{url.replace('https://', '')}</code>
          <div className="flex" style={{ gap: 6 }}>
            <button className={'btn btn-sm' + (!en ? ' btn-primary' : '')} onClick={() => setEn(false)}>Italiano</button>
            <button className={'btn btn-sm' + (en ? ' btn-primary' : '')} onClick={() => setEn(true)}>English</button>
          </div>
          <ShareInstall compact url={url} en={en} />
          <a className="btn btn-sm btn-ghost" href={en ? '/download' : '/scarica'} target="_blank" rel="noreferrer" style={{ justifySelf: 'start' }}>{t('Apri la pagina d\'invito')} ↗</a>
        </div>
      </div>
    </div>
  )
}
