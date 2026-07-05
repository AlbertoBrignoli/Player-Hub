import { useEffect, useState } from 'react'
import { supabase, PLAYER_NAME } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Spinner, Badge } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate, fmtDateTime, daysUntil, isImageFile } from '../lib/format'
import type { Player, Task, EventItem, Contract, Match, StatsMatch, EditorialEntry, MediaItem } from '../lib/types'

const BUCKET = 'crm-media'

const STATUS_LABEL: Record<string, { l: string; tone?: 'green' | 'gold' | 'blue' }> = {
  da_preparare: { l: 'Da preparare' },
  copy_pronto: { l: 'Copy pronto', tone: 'blue' },
  grafica_caricata: { l: 'Grafica caricata', tone: 'gold' },
  pronto: { l: 'Pronto', tone: 'green' },
}

export default function Dashboard({ goto }: { goto: (r: string) => void }) {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [lastMatch, setLastMatch] = useState<StatsMatch | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [nextContent, setNextContent] = useState<EditorialEntry | null>(null)
  const [toApprove, setToApprove] = useState<MediaItem[]>([])
  const [approveUrls, setApproveUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    (async () => {
      const todayKey = new Date().toISOString().slice(0, 10)
      const [p, m, t, tk, ev, ct, ed, ph] = await Promise.all([
        supabase.from('player').select('*').limit(1).maybeSingle(),
        supabase.from('matches').select('*').order('match_date', { ascending: true }),
        supabase.from('player_stats_match').select('*').order('match_date', { ascending: false }).limit(1),
        supabase.from('crm_tasks').select('*'),
        supabase.from('crm_events').select('*').gte('start_at', new Date().toISOString()).order('start_at').limit(5),
        supabase.from('crm_contracts').select('*'),
        supabase.from('crm_editorial').select('*').gte('entry_date', todayKey)
          .neq('status', 'pubblicato').order('entry_date').limit(1).maybeSingle(),
        supabase.from('crm_media').select('*').eq('status', 'da_approvare').order('created_at', { ascending: false }),
      ])
      setPlayer(p.data as Player)
      setMatches((m.data as Match[]) || [])
      setLastMatch(((t.data as StatsMatch[]) || [])[0] || null)
      setTasks((tk.data as Task[]) || [])
      setEvents((ev.data as EventItem[]) || [])
      setContracts((ct.data as Contract[]) || [])
      setNextContent(ed.data as EditorialEntry | null)
      const photos = (ph.data as MediaItem[]) || []
      setToApprove(photos)
      const paths = photos.slice(0, 8).map(x => x.storage_path)
      if (paths.length) {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
        if (signed) {
          const next: Record<string, string> = {}
          signed.forEach(d => { if (d.signedUrl && d.path) next[d.path] = d.signedUrl })
          setApproveUrls(next)
        }
      }
      setLoading(false)
    })()
  }, [])

  if (loading) return <Spinner />

  const nextMatch = matches.find(m => m.match_date && new Date(m.match_date).getTime() > Date.now())
  const openTasks = tasks.filter(t => t.status !== 'done')
  const nextContractExpiry = contracts
    .filter(c => c.end_date).map(c => ({ c, d: daysUntil(c.end_date) }))
    .filter(x => x.d != null && x.d >= 0).sort((a, b) => (a.d! - b.d!))[0]

  const greeting = new Date().getHours() < 13 ? 'Buongiorno' : new Date().getHours() < 19 ? 'Buon pomeriggio' : 'Buonasera'
  const firstName = (profile?.full_name || PLAYER_NAME).split(' ')[0]
  const igHandle = player?.instagram_url?.replace(/\/$/, '').split('/').pop()

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* Hero con anagrafica */}
      <div className="card card-lg">
        <div className="flex between wrap" style={{ gap: 20, alignItems: 'flex-start' }}>
          <div className="flex gap" style={{ gap: 16 }}>
            {player?.photo_url
              ? <img src={player.photo_url} alt="" style={{ width: 72, height: 72, borderRadius: 16, objectFit: 'cover', border: '1px solid var(--border-2)' }} />
              : <div className="avatar" style={{ width: 72, height: 72, fontSize: 24 }}>{firstName[0]}</div>}
            <div>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.5px' }}>{greeting}, {firstName}</div>
              <div className="muted" style={{ marginTop: 3 }}>
                {player ? `${player.position} · ${player.team_name} · #${player.shirt_number ?? '—'}` : 'Gestione riservata AUVI'}
              </div>
              <div className="flex wrap gap" style={{ gap: 14, marginTop: 12 }}>
                {player?.birth_date && <Anag icon="cake" label="Nato il" value={fmtDate(player.birth_date)} />}
                {player?.contact_email && <Anag icon="mail" label="Email" value={player.contact_email} href={`mailto:${player.contact_email}`} />}
                {player?.instagram_url && <Anag icon="instagram" label="Instagram" value={igHandle ? `@${igHandle}` : 'Profilo'} href={player.instagram_url} external />}
              </div>
            </div>
          </div>
          {lastMatch && (
            <div className="card" style={{ background: 'var(--bg-2)', minWidth: 210 }}>
              <div className="stat-label">Ultima partita</div>
              <div style={{ fontWeight: 700, marginTop: 4, fontSize: 13.5 }}>{lastMatch.match_name}</div>
              <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{fmtDate(lastMatch.match_date)} · {lastMatch.minutes}′ · vedi Performance</div>
            </div>
          )}
        </div>
      </div>

      {/* Le due cose da tenere d'occhio */}
      <div className="grid g2">
        <div className="card">
          <div className="card-head">
            <div className="card-title">Prossima partita</div>
            <button className="btn btn-ghost btn-sm" onClick={() => goto('editorial')}>Calendario →</button>
          </div>
          {nextMatch ? (
            <div>
              <div style={{ fontSize: 17, fontWeight: 750 }}>{nextMatch.home_team} vs {nextMatch.away_team}</div>
              <div className="muted" style={{ marginTop: 4 }}>{nextMatch.league}{nextMatch.round ? ` · ${nextMatch.round}` : ''}</div>
              <div className="flex gap wrap" style={{ marginTop: 10, gap: 8 }}>
                <Badge tone="accent">{fmtDateTime(nextMatch.match_date)}</Badge>
                <Badge>{nextMatch.venue === 'Home' ? 'In casa' : 'Trasferta'}</Badge>
              </div>
            </div>
          ) : <div className="faint" style={{ padding: '8px 0' }}>Nessuna partita in programma al momento.</div>}
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Prossimo contenuto da pubblicare</div>
            <button className="btn btn-ghost btn-sm" onClick={() => goto('editorial')}>Apri →</button>
          </div>
          {nextContent ? (
            <div>
              <div style={{ fontSize: 16, fontWeight: 750 }}>{nextContent.title}</div>
              <div className="muted" style={{ marginTop: 4 }}>{fmtDate(nextContent.entry_date)}</div>
              <div className="flex gap wrap" style={{ marginTop: 10, gap: 8 }}>
                <Badge tone={STATUS_LABEL[nextContent.status]?.tone}>{STATUS_LABEL[nextContent.status]?.l || nextContent.status}</Badge>
                {nextContent.copy_text && <Badge tone="blue">Copy pronto</Badge>}
              </div>
            </div>
          ) : <div className="faint" style={{ padding: '8px 0' }}>Niente in coda: calendario editoriale pulito.</div>}
        </div>
      </div>

      {/* Cose da fare */}
      <div className="grid g2">
        <button className="card dash-approve" onClick={() => goto('media')} style={{ textAlign: 'left', display: 'block', width: '100%' }}>
          <div className="card-head">
            <div className="card-title">Foto da approvare{toApprove.length ? ` (${toApprove.length})` : ''}</div>
            <span className="btn btn-ghost btn-sm">Apri Media →</span>
          </div>
          {toApprove.length === 0 ? (
            <div className="faint" style={{ padding: '8px 0' }}>Nessuna foto in attesa di approvazione.</div>
          ) : (
            <>
              <div className="dash-approve-grid">
                {toApprove.slice(0, 8).map(m => (
                  <div className="dash-approve-cell" key={m.id}>
                    {isImageFile(m.file_name) && approveUrls[m.storage_path]
                      ? <img src={approveUrls[m.storage_path]} alt="" loading="lazy" />
                      : <div className="dash-approve-ph"><Icon name="camera" size={16} strokeWidth={1.4} /></div>}
                  </div>
                ))}
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 10 }}>
                Tocca per aprire e approvare · {toApprove.length} in attesa
              </div>
            </>
          )}
        </button>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Prossimi impegni</div>
            <button className="btn btn-ghost btn-sm" onClick={() => goto('agenda')}>Agenda →</button>
          </div>
          {events.length === 0 ? <div className="faint" style={{ padding: '8px 0' }}>Nessun impegno in programma.</div> : (
            <div className="list">
              {events.map(e => (
                <div className="row" key={e.id}>
                  <span className="dot" style={{ background: 'var(--text-dim)' }} />
                  <div className="row-main">
                    <div className="row-title">{e.title}</div>
                    <div className="row-sub">{e.location || '—'}</div>
                  </div>
                  <div className="row-right faint" style={{ fontSize: 12 }}>{fmtDateTime(e.start_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {nextContractExpiry && (
        <div className="card flex between wrap gap" style={{ alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 650 }}>Contratto in scadenza · {nextContractExpiry.c.title}</div>
            <div className="faint" style={{ fontSize: 12.5 }}>Scade il {fmtDate(nextContractExpiry.c.end_date)}</div>
          </div>
          <Badge tone={nextContractExpiry.d! < 90 ? 'red' : 'gold'}>{nextContractExpiry.d} giorni</Badge>
        </div>
      )}
    </div>
  )
}

function Anag({ icon, label, value, href, external }: { icon: string; label: string; value: string; href?: string; external?: boolean }) {
  const inner = (
    <div className="anag">
      <span className="anag-ic"><Icon name={icon} size={15} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="faint" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.6px' }}>{label}</div>
        <div style={{ fontWeight: 650, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      </div>
    </div>
  )
  if (href) return <a href={href} target={external ? '_blank' : undefined} rel="noreferrer" className="anag-link">{inner}</a>
  return inner
}
