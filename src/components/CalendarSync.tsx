import { useCallback, useEffect, useState } from 'react'
import Icon from './Icon'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'

// Card "Calendario sul telefono": link personale al feed iCalendar (Edge Function
// calendar-feed) da aggiungere al Calendario di iPhone/Mac o a Google Calendar.
// Il link contiene un token segreto per-utente: chi lo ha vede il calendario,
// per questo si può rigenerare (il vecchio smette di funzionare).

const BASE = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/calendar-feed`

export default function CalendarSync() {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [guide, setGuide] = useState(false)

  const load = useCallback(async (rotate = false) => {
    setError(null)
    const { data, error } = await supabase.rpc('crm_calendar_token', rotate ? { p_rotate: true } : {})
    if (error || typeof data !== 'string') {
      setError('Non riesco a preparare il link del calendario. Riprova tra poco.')
      return false
    }
    setToken(data)
    return true
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const httpsUrl = token ? `${BASE}?t=${token}` : ''
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://')
  const googleUrl = webcalUrl ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}` : ''

  async function copy() {
    if (!httpsUrl) return
    try {
      await navigator.clipboard.writeText(httpsUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast('Link copiato')
    } catch {
      toast('Copia non riuscita: tieni premuto sul link per copiarlo', 'err')
    }
  }

  function askRotate() {
    toast('Il vecchio link smetterà di funzionare: andrà riaggiunto su ogni calendario.', 'ok', {
      label: 'Rigenera',
      onClick: async () => {
        setBusy(true)
        const ok = await load(true)
        setBusy(false)
        if (ok) toast('Nuovo link pronto: aggiungilo di nuovo al calendario')
        else toast('Rigenerazione non riuscita', 'err')
      },
    })
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="calendar" size={17} /> Calendario sul telefono
        </div>
        <span className="card-hint">Si aggiorna da solo</span>
      </div>

      <div className="faint" style={{ fontSize: 12.5, marginBottom: 14, lineHeight: 1.5 }}>
        Partite, impegni e uscite editoriali nel Calendario del telefono, sempre aggiornati.
        Poi aggiungi il widget Calendario alla schermata Home.
      </div>

      {loading ? (
        <div className="faint" style={{ fontSize: 12.5 }}>Preparo il tuo link…</div>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</span>
          <button className="btn btn-sm" onClick={() => { setLoading(true); load().finally(() => setLoading(false)) }}>
            Riprova
          </button>
        </div>
      ) : (
        <>
          <div className="quick-actions" style={{ marginBottom: 12 }}>
            <a className="qa" href={webcalUrl}>
              <span className="qa-ico"><Icon name="smartphone" size={16} /></span>
              Aggiungi a iPhone / Mac
            </a>
            <a className="qa" href={googleUrl} target="_blank" rel="noopener noreferrer">
              <span className="qa-ico"><Icon name="calendar" size={16} /></span>
              Google Calendar
            </a>
            <button type="button" className="qa" onClick={copy}>
              <span className="qa-ico"><Icon name={copied ? 'check' : 'copy'} size={16} /></span>
              {copied ? 'Copiato' : 'Copia link'}
            </button>
            <button type="button" className="qa" onClick={askRotate} disabled={busy}>
              <span className="qa-ico"><Icon name="rotate-ccw" size={16} /></span>
              {busy ? 'Rigenero…' : 'Rigenera link'}
            </button>
          </div>

          <div className="cal-sync-url" aria-label="Link del calendario">{httpsUrl}</div>
          <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>
            Il link è personale: chi lo possiede vede il tuo calendario. Se lo hai condiviso per errore, rigeneralo.
          </div>

          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 12 }}
            aria-expanded={guide}
            onClick={() => setGuide(g => !g)}
          >
            <Icon name="chevron-right" size={14} style={{ transform: guide ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }} />
            Come aggiungere il widget su iPhone
          </button>
          {guide && (
            <ol className="faint" style={{ fontSize: 12.5, lineHeight: 1.8, paddingLeft: 18, marginTop: 8 }}>
              <li>Tocca <b>Aggiungi a iPhone / Mac</b> e conferma <b>Abbonati</b>.</li>
              <li>Tieni premuto su uno spazio vuoto della schermata Home, poi tocca <b>Modifica</b> → <b>Aggiungi widget</b> (o <b>+</b>).</li>
              <li>Cerca <b>Calendario</b>, scegli la dimensione e tocca <b>Aggiungi widget</b>.</li>
            </ol>
          )}
        </>
      )}
    </div>
  )
}
