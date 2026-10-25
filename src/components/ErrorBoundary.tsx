// Se una schermata va in errore non resta la pagina bianca: messaggio, "Ricarica" e il resto
// dell'app (menu, navigazione) continua a funzionare. Cambiando schermata l'errore si azzera.
import React from 'react'
import { useLang } from '../lib/i18n'

function Fallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useLang()
  return (
    <div className="card" style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center', display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 28 }}>⚠️</div>
      <b style={{ fontSize: 16 }}>{t('Questa schermata ha avuto un problema')}</b>
      <div className="faint" style={{ fontSize: 13 }}>{t('Il resto dell\'app funziona. Riprova o ricarica la pagina; se si ripete, avvisa AUVI.')}</div>
      <div className="flex gap" style={{ justifyContent: 'center', gap: 8 }}>
        <button className="btn" onClick={onRetry}>{t('Riprova')}</button>
        <button className="btn btn-primary" onClick={() => location.reload()}>{t('Ricarica')}</button>
      </div>
    </div>
  )
}

export default class ErrorBoundary extends React.Component<{ resetKey?: string; children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(err: Error) { console.error('Errore schermata:', err) }
  componentDidUpdate(prev: { resetKey?: string }) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }) }
  render() { return this.state.err ? <Fallback onRetry={() => this.setState({ err: null })} /> : this.props.children }
}
