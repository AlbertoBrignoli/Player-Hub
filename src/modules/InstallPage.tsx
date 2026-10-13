// Pagina pubblica d'invito: playerhub.auviagency.com/scarica (anche dal QR code).
// Riconosce il dispositivo e mostra i passi giusti per mettere Player Hub nella schermata Home.
import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { LangToggle, useLang } from '../lib/i18n'
import { QrCode, ShareInstall, InstallSteps, IG_CSS } from '../components/InstallGuide'
import { detectPlatform, isMobilePlatform } from '../lib/install'

export default function InstallPage() {
  const { t } = useLang()
  const [platform] = useState(() => detectPlatform())
  const mobile = isMobilePlatform(platform)
  const [showQr, setShowQr] = useState(!mobile)
  useEffect(() => { document.title = 'Player Hub · AUVI' }, [])

  return (
    <div className="ip">
      <style>{IG_CSS + IP_CSS}</style>
      <div className="ip-bg" />
      <header className="ip-top">
        <img src="/brand/auvi-wordmark-white.svg" alt="AUVI" height={22} />
        <span className="ip-brand">PLAYER HUB</span>
        <span style={{ flex: 1 }} />
        <LangToggle />
      </header>

      <main className="ip-main">
        <section className="ip-hero">
          <img className="ip-icon" src="/icons/icon-512.png?v=5" alt="" width={84} height={84} />
          <div className="ip-kicker">{t('L\'app del tuo team')}</div>
          <h1>{t('Player Hub sul tuo telefono')}</h1>
          <p>{t('Calendario, programma della settimana, report, piano alimentare e messaggi del tuo team: tutto in un tocco, con le notifiche quando serve.')}</p>
          <div className="ip-feats">
            <span><Icon name="calendar" size={14} /> {t('Calendario')}</span>
            <span><Icon name="bell" size={14} /> {t('Notifiche')}</span>
            <span><Icon name="file" size={14} /> {t('Report')}</span>
            <span><Icon name="message" size={14} /> {t('Chat')}</span>
          </div>
        </section>

        <section className="ip-card">
          <div className="ip-card-h">{platform === 'installed' ? t('Tutto pronto') : mobile ? t('Aggiungila alla Home in 3 tocchi') : t('Installala sul telefono')}</div>
          <InstallSteps />
          {platform === 'installed' && <a className="btn btn-primary ig-big" href="/">{t('Apri Player Hub')} →</a>}
        </section>

        <section className="ip-card ip-qr">
          {showQr ? (
            <>
              <QrCode size={mobile ? 180 : 220} />
              <div className="ip-qr-t">{mobile ? t('Fai inquadrare questo QR a un compagno o al tuo staff') : t('Inquadra con la fotocamera del telefono')}</div>
            </>
          ) : (
            <button className="btn btn-sm" onClick={() => setShowQr(true)}><Icon name="grid" size={13} /> {t('Mostra il QR per un altro telefono')}</button>
          )}
          <ShareInstall />
        </section>

        <a className="ip-open" href="/">{t('Hai già l\'accesso? Entra in Player Hub')} →</a>
      </main>
    </div>
  )
}

const IP_CSS = `
.ip { min-height: 100vh; min-height: 100dvh; background: #0A0A0A; color: #fff; position: relative; overflow-x: hidden; font-family: inherit; }
.ip-bg { position: fixed; inset: 0; background: radial-gradient(120% 70% at 80% 0%, rgba(255,236,0,.22), transparent 60%), url('/login/auvi-sport-atleta-poster.png') center top / cover no-repeat; opacity: .35; pointer-events: none; }
.ip-top { position: relative; display: flex; align-items: center; gap: 12px; padding: 18px 20px; }
.ip-brand { font-weight: 900; letter-spacing: 2px; font-size: 12px; }
.ip-main { position: relative; max-width: 520px; margin: 0 auto; padding: 8px 16px 40px; display: grid; gap: 16px; }
.ip-hero { text-align: center; display: grid; justify-items: center; gap: 10px; padding: 18px 4px 6px; }
.ip-icon { border-radius: 22px; box-shadow: 0 14px 40px rgba(255,236,0,.25); }
.ip-kicker { font-size: 11px; letter-spacing: 1.8px; text-transform: uppercase; font-weight: 800; color: #FFEC00; }
.ip-hero h1 { margin: 0; font-size: 34px; line-height: 1.05; font-weight: 900; letter-spacing: -.5px; text-transform: uppercase; }
.ip-hero p { margin: 0; font-size: 15px; line-height: 1.5; color: rgba(255,255,255,.78); max-width: 420px; }
.ip-feats { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 4px; }
.ip-feats span { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; padding: 6px 11px; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); }
.ip-card { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 20px; padding: 18px; display: grid; gap: 14px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.ip-card-h { font-size: 18px; font-weight: 900; }
.ip-card .btn { background: rgba(255,255,255,.1); color: #fff; border-color: rgba(255,255,255,.18); }
.ip-card .btn-primary { background: #FFEC00; color: #0A0A0A; border-color: #FFEC00; }
.ip-card .btn-ghost { background: transparent; }
.ip-qr { justify-items: center; text-align: center; }
.ip-qr-t { font-size: 13px; color: rgba(255,255,255,.75); }
.ip-open { text-align: center; color: rgba(255,255,255,.7); font-size: 13.5px; text-decoration: none; padding: 6px; }
.ip .lang-toggle { background: rgba(255,255,255,.1) !important; }
`
