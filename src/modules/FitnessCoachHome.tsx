import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Spinner, Empty } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate } from '../lib/format'
import type { FitnessProgram } from '../lib/types'

// Home del preparatore: la sua scheda in evidenza + i suoi atleti.
// Ogni box apre l'atleta: schede, performance, agenda, chat.
const ACCENT = '#C8FF2E' // verde fluo: identità del mondo fitness

const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800,
}
const todayKey = () => new Date().toISOString().slice(0, 10)

type Ath = { api_player_id: number; name: string | null; photo_url?: string | null }

export default function FitnessCoachHome({ goto }: { goto?: (r: string) => void }) {
  const { profile, session } = useAuth()
  const { athletes, setAthleteId } = useAthlete()
  const [coach, setCoach] = useState<any | null>(null)
  const [programs, setPrograms] = useState<FitnessProgram[]>([])
  const [feedback, setFeedback] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [nextMatch, setNextMatch] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)

  const uid = session?.user.id

  useEffect(() => {
    Promise.all([
      supabase.from('fitness_programs').select('*').order('created_at', { ascending: false }),
      supabase.from('fitness_feedback').select('*, fitness_programs(player_id, program_date)'),
      supabase.from('fitness_requests').select('*').eq('status', 'aperta').order('created_at', { ascending: false }),
      supabase.from('fitness_coach_profile').select('*').eq('trainer_id', uid).maybeSingle(),
      supabase.from('matches').select('player_id, match_date, opponent').gte('match_date', new Date().toISOString()).order('match_date'),
    ]).then(([p, f, r, c, m]) => {
      setPrograms((p.data as FitnessProgram[]) || [])
      setFeedback((f.data as any[]) || [])
      setRequests((r.data as any[]) || [])
      setCoach(c.data || null)
      // prossima partita per atleta: serve al coach per calibrare i carichi
      const nm: Record<number, string> = {}
      ;((m.data as any[]) || []).forEach(x => {
        if (x.player_id && !nm[x.player_id]) nm[x.player_id] = `${fmtDate(x.match_date)} · ${x.opponent || ''}`.trim()
      })
      setNextMatch(nm)
      setLoading(false)
    })
  }, [uid])

  if (loading) return <Spinner />

  const name = coach?.name || profile?.full_name || 'Preparatore'
  const today = todayKey()
  const published = programs.filter(p => p.status === 'published')
  const drafts = programs.filter(p => p.status === 'draft')
  const todayTrainings = published.filter(p => p.program_date === today)

  // ultimo feedback per atleta → chi va rivisto
  const byPlayer: Record<number, any> = {}
  feedback.forEach(f => {
    const pid = f.fitness_programs?.player_id; if (!pid) return
    const d = f.fitness_programs?.program_date || ''
    if (!byPlayer[pid] || (byPlayer[pid].fitness_programs?.program_date || '') < d) byPlayer[pid] = f
  })
  const attention = (pid: number) => {
    const f = byPlayer[pid]
    if (!f) return null
    if (f.discomfort && f.discomfort !== 'nessuno') return 'Fastidio segnalato'
    if (f.status && f.status !== 'completato') return 'Ultima seduta incompleta'
    return null
  }

  const open = (id: number, route: string) => { setAthleteId(id); goto?.(route) }
  const list = athletes as Ath[]

  return (
    <div className="grid" style={{ gap: 20 }}>
      {/* --- HERO preparatore --- */}
      <div style={{
        position: 'relative', overflow: 'hidden', borderRadius: 18,
        background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '24px 22px',
      }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
        <div className="flex gap" style={{ alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
          {coach?.photo_url
            ? <img src={coach.photo_url} alt="" style={{ width: 58, height: 58, borderRadius: 15, objectFit: 'cover' }} />
            : <div style={{ width: 58, height: 58, borderRadius: 15, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 22, color: '#111' }}>
                {name.slice(0, 1)}
              </div>}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...kicker, color: ACCENT }}>Preparatore atletico</div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.4, marginTop: 2 }}>{name}</div>
            {coach?.availability && (
              <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{coach.availability}</div>
            )}
          </div>
          {goto && (
            <button className="btn btn-sm" onClick={() => goto('coach-profile')}>
              <Icon name="edit" size={13} /> Il mio profilo
            </button>
          )}
        </div>

        <div className="flex gap" style={{ gap: 26, marginTop: 20, flexWrap: 'wrap' }}>
          <Metric label="Atleti seguiti" value={String(list.length)} />
          <Metric label="Sedute oggi" value={String(todayTrainings.length)} />
          <Metric label="Bozze" value={String(drafts.length)} />
          <Metric label="Richieste aperte" value={String(requests.length)} tone={requests.length ? '#c9922b' : undefined} />
        </div>
      </div>

      {/* --- Richieste aperte --- */}
      {requests.length > 0 && (
        <div className="card" style={{ borderColor: '#c9922b55' }}>
          <div className="flex between" style={{ alignItems: 'center', marginBottom: 10 }}>
            <div style={{ ...kicker, color: '#c9922b' }}>Richieste da gestire</div>
            <span className="faint" style={{ fontSize: 12 }}>{requests.length}</span>
          </div>
          <div className="grid" style={{ gap: 8 }}>
            {requests.slice(0, 5).map(r => (
              <div key={r.id} className="flex between" style={{ alignItems: 'center', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                    {list.find(a => a.api_player_id === r.player_id)?.name || 'Atleta'}
                  </div>
                  <div className="faint" style={{ fontSize: 11.5 }}>
                    {r.type === 'programma' ? 'Richiede un programma' : 'Vuole prenotare un allenamento'} · {fmtDate(r.created_at)}
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => open(r.player_id, 'fitness')}>Apri</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Sedute di oggi --- */}
      {todayTrainings.length > 0 && (
        <div className="card">
          <div style={{ ...kicker, color: 'var(--text-dim)', marginBottom: 10 }}>Oggi</div>
          <div className="grid" style={{ gap: 8 }}>
            {todayTrainings.map(p => (
              <div key={p.id} className="flex between" style={{ alignItems: 'center', gap: 10 }}>
                <div className="flex gap" style={{ alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 3, height: 26, background: ACCENT, borderRadius: 2 }} />
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{p.name || 'Seduta'}</div>
                    <div className="faint" style={{ fontSize: 11.5 }}>
                      {list.find(a => a.api_player_id === p.player_id)?.name} {p.start_time ? `· ${p.start_time}` : ''}
                    </div>
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => open(p.player_id!, 'fitness')}>Vedi</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- I miei atleti --- */}
      <div>
        <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
          <div className="flex gap" style={{ alignItems: 'center', gap: 9 }}>
            <span style={{ width: 3, height: 15, background: ACCENT, borderRadius: 2 }} />
            <span style={{ ...kicker, color: 'var(--text)' }}>I miei atleti</span>
          </div>
          <span className="faint" style={{ fontSize: 12 }}>{list.length} seguit{list.length === 1 ? 'o' : 'i'}</span>
        </div>

        {list.length === 0 ? (
          <div className="card">
            <Empty icon={<Icon name="user" size={30} strokeWidth={1.4} />} title="Nessun atleta assegnato"
              hint="Chiedi ad AUVI di assegnarti gli atleti." />
          </div>
        ) : (
          <div className="grid g3" style={{ gap: 12 }}>
            {list.map(a => {
              const warn = attention(a.api_player_id)
              const last = published.filter(p => p.player_id === a.api_player_id)[0]
              return (
                <div key={a.api_player_id} className="card" style={{ padding: 0, cursor: 'pointer', overflow: 'hidden' }}
                  onClick={() => open(a.api_player_id, 'fitness')}
                  role="button" tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') open(a.api_player_id, 'fitness') }}>
                  <div style={{ height: 3, background: warn ? '#c9922b' : ACCENT }} />
                  <div style={{ padding: 16 }}>
                    <div className="flex gap" style={{ alignItems: 'center', gap: 12 }}>
                      {a.photo_url
                        ? <img src={a.photo_url} alt="" style={{ width: 54, height: 54, borderRadius: 14, objectFit: 'cover' }} />
                        : <div style={{ width: 54, height: 54, borderRadius: 14, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                            {(a.name || '?').slice(0, 1)}
                          </div>}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                        <div className="faint" style={{ fontSize: 11.5 }}>
                          {last ? `Ultima scheda · ${fmtDate(last.program_date)}` : 'Nessuna scheda'}
                        </div>
                        {nextMatch[a.api_player_id] && (
                          <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>
                            <Icon name="calendar" size={10} /> {nextMatch[a.api_player_id]}
                          </div>
                        )}
                      </div>
                    </div>

                    {warn && (
                      <div style={{ marginTop: 10, fontSize: 11.5, fontWeight: 700, color: '#c9922b' }}>
                        <Icon name="bell" size={11} /> {warn}
                      </div>
                    )}

                    <div className="flex gap" style={{ marginTop: 13, flexWrap: 'wrap' }}>
                      <button className="btn btn-sm" onClick={e => { e.stopPropagation(); open(a.api_player_id, 'fitness') }}>
                        <Icon name="dumbbell" size={13} /> Schede
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); open(a.api_player_id, 'performance') }}>
                        <Icon name="activity" size={13} /> Performance
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); open(a.api_player_id, 'messages') }}>
                        <Icon name="message" size={13} /> Scrivi
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div style={{ ...kicker, fontSize: 10, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2, borderBottom: `2px solid ${tone || ACCENT}`, display: 'inline-block', paddingBottom: 2 }}>
        {value}
      </div>
    </div>
  )
}
