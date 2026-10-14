// Pagina pubblica d'invito: playerhub.auviagency.com/scarica (italiano) · /download (inglese).
// È la pagina che l'atleta apre dal link o dal QR: mini guida in 3 fasi per il SUO telefono —
// 1 registrati (codice invito + link via email + password), 2 mettila nella schermata Home,
// 3 aprila dall'icona, accedi e attiva le notifiche.
import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { LangToggle, useLang } from '../lib/i18n'
import { QrCode, ShareInstall, InstallSteps, IG_CSS } from '../components/InstallGuide'
import { detectPlatform, isMobilePlatform } from '../lib/install'

function Phase({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className={'ip-card ip-phase' + (done ? ' done' : '')}>
      <div className="ip-ph-h">
        <span className="ip-ph-n">{done ? <Icon name="check" size={16} /> : n}</span>
        <div className="ip-card-h">{title}</div>
      </div>
      {children}
    </section>
  )
}

export default function InstallPage() {
  const { t, lang, setLang } = useLang()
  const [platform] = useState(() => detectPlatform())
  const mobile = isMobilePlatform(platform)
  const installed = platform === 'installed'
  const ios = platform === 'ios-safari' || platform === 'ios-other' || (installed && /iphone|ipad|ipod/i.test(navigator.userAgent))
  const [showQr, setShowQr] = useState(!mobile && !installed)

  // /download (e /install) in inglese, /scarica in italiano; poi si cambia col selettore
  useEffect(() => {
    setLang(/^\/(download|install)\/?$/.test(window.location.pathname) ? 'en' : 'it')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { document.documentElement.lang = lang; document.title = 'Player Hub · AUVI' }, [lang])

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
          {!installed && <div className="ip-time"><Icon name="clock" size={13} /> {t('3 passaggi · circa 2 minuti')}</div>}
        </section>

        {/* 1 · registrazione */}
        <Phase n={1} title={t('Registrati')} done={installed}>
          {installed ? (
            <div className="ip-p">{t('Sei già dentro l\'app: passa al punto 3.')}</div>
          ) : (
            <>
              <div className="ig-step"><span className="ig-n">a</span><div>{t('Tocca')} <b>{t('Registrati con il codice invito')}</b> {t('qui sotto')}</div></div>
              <div className="ig-step"><span className="ig-n">b</span><div>{t('Inserisci la tua email e il codice che ti ha mandato AUVI (es. ELI-4F2A91)')}</div></div>
              <div className="ig-step"><span className="ig-n">c</span><div>{t('Apri la mail di Player Hub e tocca il link (guarda anche nello spam)')}</div></div>
              <div className="ig-step"><span className="ig-n">d</span><div>{t('Scegli la tua password: ti servirà per entrare dall\'icona')}</div></div>
              <a className="btn btn-primary ig-big" href="/?invito=1">{t('Registrati con il codice invito')} →</a>
              <a className="ip-link" href="/?accedi=1">{t('Hai già un account? Accedi')} →</a>
            </>
          )}
        </Phase>

        {/* 2 · schermata Home */}
        <Phase n={2} title={mobile ? t('Mettila nella schermata Home') : t('Installala sul telefono')} done={installed}>
          {installed ? <div className="ip-p">{t('Fatto: la stai già usando dall\'icona.')}</div> : <InstallSteps />}
        </Phase>

        {/* 3 · accesso dall'icona + notifiche */}
        <Phase n={3} title={t('Aprila dall\'icona e attiva le notifiche')}>
          <div className="ig-step"><span className="ig-n">a</span><div>{t('Apri Player Hub toccando l\'icona AUVI nella schermata Home')}</div></div>
          {ios && (
            <div className="ig-step"><span className="ig-n">b</span><div>{t('Accedi con email e password: su iPhone l\'app nella Home è separata da Safari, quindi si entra una volta sola anche lì')}</div></div>
          )}
          <div className="ig-step"><span className="ig-n">{ios ? 'c' : 'b'}</span><div>{t('Nella Home dell\'app tocca')} <b><Icon name="bell" size={14} /> {t('Attiva le notifiche')}</b> {t('(o la campanella in alto)')}</div></div>
          <div className="ig-step"><span className="ig-n">{ios ? 'd' : 'c'}</span><div>{t('Quando il telefono lo chiede, tocca')} <b>{t('Consenti')}</b></div></div>
          <div className="ig-hint">{ios
            ? t('Su iPhone le notifiche funzionano solo dall\'app aperta dall\'icona (serve iOS 16.4 o successivo).')
            : t('Ti avvisiamo per partite, programma, report, proposte del tuo team e messaggi.')}</div>
          {installed && <a className="btn btn-primary ig-big" href="/">{t('Apri Player Hub')} →</a>}
        </Phase>

        <section className="ip-card ip-qr">
          {showQr ? (
            <>
              <QrCode size={mobile ? 180 : 220} url={window.location.origin + window.location.pathname} />
              <div className="ip-qr-t">{mobile ? t('Fai inquadrare questo QR a un compagno o al tuo staff') : t('Inquadra con la fotocamera del telefono')}</div>
            </>
          ) : (
            <button className="btn btn-sm" onClick={() => setShowQr(true)}><Icon name="grid" size={13} /> {t('Mostra il QR per un altro telefono')}</button>
          )}
          <ShareInstall />
        </section>

        <div className="ip-help">{t('Problemi? Scrivi al tuo referente AUVI: ti aiutiamo noi.')}</div>
      </main>
    </div>
  )
}

const IP_CSS = `
.ip { min-height: 100vh; min-height: 100dvh; background: #0A0A0A; color: #fff; position: relative; overflow-x: hidden; font-family: inherit; }
.ip-bg { position: fixed; inset: 0; background: radial-gradient(120% 70% at 80% 0%, rgba(255,236,0,.22), transparent 60%), url('/login/auvi-sport-atleta-poster.png') center top / cover no-repeat; opacity: .35; pointer-events: none; }
.ip-top { position: relative; display: flex; align-items: center; gap: 12px; padding: 18px 20px; }
.ip-brand { font-weight: 900; letter-spacing: 2px; font-size: 12px; }
.ip-main { position: relative; max-width: 520px; margin: 0 auto; padding: 8px 16px 40px; display: grid; gap: 14px; }
.ip-hero { text-align: center; display: grid; justify-items: center; gap: 10px; padding: 18px 4px 6px; }
.ip-icon { border-radius: 22px; box-shadow: 0 14px 40px rgba(255,236,0,.25); }
.ip-kicker { font-size: 11px; letter-spacing: 1.8px; text-transform: uppercase; font-weight: 800; color: #FFEC00; }
.ip-hero h1 { margin: 0; font-size: 34px; line-height: 1.05; font-weight: 900; letter-spacing: -.5px; text-transform: uppercase; }
.ip-hero p { margin: 0; font-size: 15px; line-height: 1.5; color: rgba(255,255,255,.78); max-width: 420px; }
.ip-feats { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 4px; }
.ip-feats span { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; padding: 6px 11px; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); }
.ip-time { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: #FFEC00; font-weight: 700; }
.ip-card { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 20px; padding: 18px; display: grid; gap: 13px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.ip-card-h { font-size: 18px; font-weight: 900; }
.ip-ph-h { display: flex; align-items: center; gap: 12px; }
.ip-ph-n { flex-shrink: 0; width: 34px; height: 34px; border-radius: 12px; background: #FFEC00; color: #0A0A0A; display: grid; place-items: center; font-weight: 900; font-size: 17px; }
.ip-phase.done { opacity: .7; }
.ip-phase.done .ip-ph-n { background: #12A150; color: #fff; }
.ip-phase .ig-n { background: rgba(255,236,0,.16); color: #FFEC00; border: 1px solid rgba(255,236,0,.45); font-size: 13px; }
.ip-p { font-size: 14px; color: rgba(255,255,255,.8); }
.ip-card .btn { background: rgba(255,255,255,.1); color: #fff; border-color: rgba(255,255,255,.18); }
.ip-card .btn-primary { background: #FFEC00; color: #0A0A0A; border-color: #FFEC00; text-decoration: none; }
.ip-card .btn-ghost { background: transparent; }
.ip-link { text-align: center; color: rgba(255,255,255,.8); font-size: 13.5px; text-decoration: none; }
.ip-qr { justify-items: center; text-align: center; }
.ip-qr-t { font-size: 13px; color: rgba(255,255,255,.75); }
.ip-help { text-align: center; color: rgba(255,255,255,.6); font-size: 12.5px; padding: 4px; }
.ip .lang-toggle { background: rgba(255,255,255,.1) !important; }
`
