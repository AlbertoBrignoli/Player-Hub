import { useEffect, useState } from 'react'
import { supabase, PLAYER_NAME } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate, isImageFile } from '../lib/format'
import type { Player, Task, EventItem, Contract, Match, StatsMatch, EditorialEntry, MediaItem } from '../lib/types'

const BUCKET = 'crm-media'
const CHIP: Record<string, { l: string; c: string }> = {
  da_preparare: { l: 'Da preparare', c: 'ed-chip-gold' },
  copy_pronto: { l: 'Copy pronto', c: 'ed-chip-blue' },
  grafica_caricata: { l: 'Grafica', c: 'ed-chip-gold' },
  pronto: { l: 'Pronto', c: 'ed-chip-green' },
}
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']

export default function Dashboard({ goto }: { goto: (r: string) => void }) {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [lastMatch, setLastMatch] = useState<StatsMatch | null>(null)
  const [events, setEvents] = useState<EventItem[]>([])
  void events
  const [nextContent, setNextContent] = useState<EditorialEntry | null>(null)
  const [nextContentThumb, setNextContentThumb] = useState<string | null>(null)
  const [toApprove, setToApprove] = useState<MediaItem[]>([])

  useEffect(() => {
    (async () => {
      const todayKey = new Date().toISOString().slice(0, 10)
      const [p, m, t, ev, ct, ed, ph] = await Promise.all([
        supabase.from('player').select('*').limit(1).maybeSingle(),
        supabase.from('matches').select('*').order('match_date', { ascending: true }),
        supabase.from('player_stats_match').select('*').order('match_date', { ascending: false }).limit(1),
        supabase.from('crm_events').select('*').gte('start_at', new Date().toISOString()).order('start_at').limit(5),
        supabase.from('crm_contracts').select('*'),
        supabase.from('crm_editorial').select('*').gte('entry_date', todayKey)
          .neq('status', 'pubblicato').order('entry_date').limit(1).maybeSingle(),
        supabase.from('crm_media').select('*').eq('status', 'da_approvare').order('created_at', { ascending: false }),
      ])
      void ct
      setPlayer(p.data as Player)
      setMatches((m.data as Match[]) || [])
      setLastMatch(((t.data as StatsMatch[]) || [])[0] || null)
      setEvents((ev.data as EventItem[]) || [])
      const content = ed.data as EditorialEntry | null
      setNextContent(content)
      setToApprove((ph.data as MediaItem[]) || [])

      // Thumbnail del prossimo contenuto (prima immagine collegata)
      if (content) {
        const { data: cm } = await supabase.from('crm_media').select('storage_path,file_name')
          .eq('editorial_id', content.id).limit(4)
        const img = (cm || []).find(x => isImageFile((x as any).file_name))
        if (img) {
          const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl((img as any).storage_path, 3600)
          if (signed?.signedUrl) setNextContentThumb(signed.signedUrl)
        }
      }
      setLoading(false)
    })()
  }, [])

  if (loading) return <Spinner />

  const nextMatch = matches.find(m => m.match_date && new Date(m.match_date).getTime() > Date.now())
  const played = matches.filter(m => m.minutes != null && m.minutes > 0)
  const presenze = played.length
  const ratings = played.map(m => Number(m.rating)).filter(r => !isNaN(r) && r > 0)
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : null
  const goals = matches.reduce((s, m) => s + (m.goals || 0), 0)

  const greeting = new Date().getHours() < 13 ? 'Buongiorno' : new Date().getHours() < 19 ? 'Buon pomeriggio' : 'Buonasera'
  const firstName = (profile?.full_name || PLAYER_NAME).split(' ')[0]
  const igHandle = player?.instagram_url?.replace(/\/$/, '').split('/').pop()

  const bd = player?.birth_date ? new Date(player.birth_date + 'T12:00') : null
  const birthLabel = bd ? `${bd.getDate()} ${MESI[bd.getMonth()]} ${bd.getFullYear()}` : null

  // Prossima partita: countdown, meta
  let matchWhen = ''
  let matchMeta: string[] = []
  if (nextMatch?.match_date) {
    const days = Math.ceil((new Date(nextMatch.match_date).getTime() - Date.now()) / 86400000)
    matchWhen = days <= 0 ? 'Oggi' : days === 1 ? 'Domani' : `Fra ${days} giorni`
    const d = new Date(nextMatch.match_date)
    matchMeta = [
      `${d.getDate().toString().padStart(2, '0')} ${MESI[d.getMonth()].slice(0, 3).toUpperCase()}`,
      d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      nextMatch.venue === 'Home' ? 'IN CASA' : 'TRASFERTA',
    ]
  }

  return (
    <div className="grid" style={{ gap: 22 }}>
      {/* 1 · Identità + anagrafica */}
      <div className="ed-id-card">
        <div className="flex gap" style={{ gap: 16, alignItems: 'center' }}>
          {player?.photo_url
            ? <img src={player.photo_url} alt="" style={{ width: 74, height: 74, borderRadius: 20, objectFit: 'cover', border: '1px solid var(--border-2)', flexShrink: 0 }} />
            : <div className="avatar" style={{ width: 74, height: 74, fontSize: 26, borderRadius: 20 }}>{firstName[0]}</div>}
          <div style={{ minWidth: 0 }}>
            <div className="ed-kicker">{greeting}</div>
            <div className="ed-id-name">{player?.name || PLAYER_NAME}</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              {player ? `${player.position} · ${player.team_name} · #${player.shirt_number ?? '—'}` : 'Gestione riservata AUVI'}
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

        <div className="grid" style={{ gap: 13 }}>
          {birthLabel && <Anag icon="cake" label="Nato il" value={birthLabel} />}
          {player?.contact_email && <Anag icon="mail" label="Email" value={player.contact_email} href={`mailto:${player.contact_email}`} />}
          {player?.instagram_url && <Anag icon="instagram" label="Instagram" value={igHandle ? `@${igHandle}` : 'Profilo'} href={player.instagram_url} external />}
        </div>
      </div>

      {/* 2 · Ultima partita (strip) */}
      {lastMatch && (
        <button className="ed-strip" onClick={() => goto('performance')}>
          <div style={{ minWidth: 0 }}>
            <div className="ed-kicker">Ultima partita</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginTop: 5 }}>{lastMatch.match_name}</div>
            <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>{fmtDate(lastMatch.match_date)} · {lastMatch.minutes}′ giocati · {lastMatch.competition}</div>
          </div>
          <span className="ed-chev">›</span>
        </button>
      )}

      {/* 3 · Hero prossima partita */}
      {nextMatch && (
        <button className="ed-hero" onClick={() => goto('editorial')} style={{ padding: 0, border: '1px solid var(--border)' }}>
          {player?.stadium_photo_url && <img className="ed-hero-img" src={player.stadium_photo_url} alt="" style={{ opacity: .5 }} />}
          <div className="ed-hero-scrim" />
          <div className="ed-hero-body" style={{ textAlign: 'left' }}>
            <div className="ed-livepill"><span className="ed-livedot" /><span>Prossima · {matchWhen}</span></div>
            <div className="ed-hero-title">{nextMatch.home_team} — {nextMatch.away_team}</div>
            <div className="ed-hero-meta">
              {matchMeta.map((x, i) => (
                <span key={i} style={{ display: 'contents' }}>{i > 0 && <span className="sep">|</span>}<span>{x}</span></span>
              ))}
            </div>
          </div>
        </button>
      )}

      {/* 4 · Da fare ora */}
      <div>
        <div className="ed-masthead"><div className="ed-masthead-t">Da fare ora</div><div className="ed-rule" /></div>
        <div className="grid" style={{ gap: 10 }}>
          {toApprove.length > 0 && (
            <button className="ed-action prio" onClick={() => goto('media')}>
              <div className="ed-action-num">{toApprove.length}</div>
              <div style={{ flex: 1 }}>
                <div className="ed-action-t">Foto da approvare</div>
                <div className="ed-action-s">Selezioni in attesa del tuo ok</div>
              </div>
              <span className="ed-chev">›</span>
            </button>
          )}
          {nextContent ? (
            <button className="ed-action" onClick={() => goto('editorial')}>
              {nextContentThumb
                ? <img className="ed-action-thumb" src={nextContentThumb} alt="" />
                : <div className="ed-action-thumb" style={{ display: 'grid', placeItems: 'center', color: 'var(--text-faint)' }}><Icon name="image" size={18} strokeWidth={1.5} /></div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex gap" style={{ gap: 8, alignItems: 'baseline' }}>
                  <span className="ed-action-t">{nextContent.title}</span>
                  <span className="faint" style={{ fontSize: 10 }}>· {fmtDate(nextContent.entry_date)}</span>
                </div>
                <div className="flex gap" style={{ gap: 6, marginTop: 6 }}>
                  <span className={`ed-chip ${CHIP[nextContent.status]?.c || 'ed-chip-gold'}`}>{CHIP[nextContent.status]?.l || 'In lavorazione'}</span>
                  {nextContent.copy_text && <span className="ed-chip ed-chip-blue">Copy pronto</span>}
                </div>
              </div>
              <span className="ed-chev">›</span>
            </button>
          ) : (
            <div className="faint" style={{ fontSize: 12.5, padding: '4px 2px' }}>Nessun contenuto in coda: calendario editoriale pulito.</div>
          )}
        </div>
      </div>

      {/* 5 · In stagione */}
      <div>
        <div className="ed-masthead">
          <div className="ed-masthead-t quiet">In stagione</div>
          <div className="ed-rule" />
          <button className="ed-more" onClick={() => goto('performance')}>Dettagli →</button>
        </div>
        <div className="ed-statcols">
          <div className="ed-statcol"><div className="v">{presenze}</div><div className="l">Presenze</div></div>
          <div className="ed-statdiv" />
          <div className="ed-statcol"><div className="v" style={{ color: avgRating && avgRating >= 7 ? 'var(--green)' : undefined }}>{avgRating ? avgRating.toFixed(2) : '—'}</div><div className="l">Rating</div></div>
          <div className="ed-statdiv" />
          <div className="ed-statcol"><div className="v">{goals}</div><div className="l">Gol</div></div>
        </div>
      </div>
    </div>
  )
}

function Anag({ icon, label, value, href, external }: { icon: string; label: string; value: string; href?: string; external?: boolean }) {
  const inner = (
    <div className="ed-anag">
      <span className="ed-anag-ic"><Icon name={icon} size={15} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="ed-anag-l">{label}</div>
        <div className="ed-anag-v">{value}</div>
      </div>
    </div>
  )
  if (href) return <a href={href} target={external ? '_blank' : undefined} rel="noreferrer" className="ed-anag-link" style={{ display: 'block' }}>{inner}</a>
  return inner
}
