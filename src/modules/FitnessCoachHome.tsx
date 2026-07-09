import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate } from '../lib/format'
import type { FitnessProgram } from '../lib/types'

const label: React.CSSProperties = { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700, margin: '22px 2px 10px' }
const todayKey = () => new Date().toISOString().slice(0, 10)

export default function FitnessCoachHome({ goto }: { goto?: (r: string) => void }) {
  const { profile } = useAuth()
  const { athletes } = useAthlete()
  const [programs, setPrograms] = useState<FitnessProgram[]>([])
  const [feedback, setFeedback] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('fitness_programs').select('*').order('created_at', { ascending: false }),
      supabase.from('fitness_feedback').select('*, fitness_programs(player_id, program_date)'),
      supabase.from('fitness_requests').select('*').eq('status', 'aperta').order('created_at', { ascending: false }),
    ]).then(([p, f, r]) => {
      setPrograms((p.data as FitnessProgram[]) || [])
      setFeedback((f.data as any[]) || [])
      setRequests((r.data as any[]) || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <Spinner />

  const name = profile?.full_name || profile?.email?.split('@')[0] || 'Preparatore'
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera'
  const today = todayKey()
  const nameOf = (pid?: number | null) => athletes.find(a => a.api_player_id === pid)?.name || '—'

  const published = programs.filter(p => p.status === 'published')
  const drafts = programs.filter(p => p.status === 'draft')
  const todayTrainings = published.filter(p => p.program_date === today)
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))

  const byPlayer: Record<number, any> = {}
  feedback.forEach(f => {
    const pid = f.fitness_programs?.player_id; if (!pid) return
    const d = f.fitness_programs?.program_date || ''
    if (!byPlayer[pid] || (byPlayer[pid].fitness_programs?.program_date || '') < d) byPlayer[pid] = f
  })
  const daRivedere = Object.values(byPlayer).filter((f: any) => f.status !== 'completato' || (f.discomfort && f.discomfort !== 'nessuno')).length

  const stats = [
    { icon: 'dumbbell', k: 'Allenamenti di oggi', v: todayTrainings.length },
    { icon: 'check-square', k: 'Programmi attivi', v: published.length },
    { icon: 'edit', k: 'Bozze da completare', v: drafts.length },
    { icon: 'bell', k: 'Da rivedere', v: daRivedere },
    { icon: 'inbox', k: 'Richieste', v: requests.length },
  ]
  const quick = [
    { icon: 'plus', l: 'Nuovo programma', r: 'fitness' },
    { icon: 'clock', l: 'Agenda', r: 'agenda' },
    { icon: 'archive', l: 'Documenti', r: 'documents' },
    { icon: 'image', l: 'Media', r: 'media' },
  ]
  const recent = programs.slice(0, 6)

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Header */}
      <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', padding: 18, marginBottom: 20 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>{name.slice(0, 1).toUpperCase()}</div>
        <div>
          <div className="faint" style={{ fontSize: 12.5 }}>{greet},</div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{name}</div>
          <div className="faint" style={{ fontSize: 13 }}>Preparatore Atletico · {athletes.length} atlet{athletes.length === 1 ? 'a seguita' : 'i seguiti'}</div>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {stats.map(s => (
          <div key={s.k} className="card" style={{ padding: 16 }}>
            <div className="flex" style={{ alignItems: 'center', gap: 8, color: 'var(--text-dim)' }}><Icon name={s.icon} size={15} /><span style={{ fontSize: 12 }}>{s.k}</span></div>
            <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Agenda di oggi */}
      <div style={label}>Agenda di oggi</div>
      {todayTrainings.length === 0
        ? <div className="card" style={{ padding: 16 }}><span className="faint">Nessun allenamento programmato per oggi.</span></div>
        : <div className="card" style={{ padding: 6 }}><div className="list">
          {todayTrainings.map(p => (
            <div key={p.id} className="row" style={{ alignItems: 'center', cursor: goto ? 'pointer' : 'default' }} onClick={() => goto?.('fitness')}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="dumbbell" size={15} /></span>
              <div className="row-main">
                <div className="row-title">{p.name}</div>
                <div className="row-sub">{nameOf(p.player_id)}{p.start_time ? ` · ${p.start_time.slice(0, 5)}` : ''}{p.duration_min ? ` · ${p.duration_min} min` : ''}</div>
              </div>
            </div>
          ))}
        </div></div>}

      {/* Richieste ricevute */}
      {requests.length > 0 && <>
        <div style={label}>Richieste ricevute</div>
        <div className="card" style={{ padding: 6 }}><div className="list">
          {requests.map(r => (
            <div key={r.id} className="row" style={{ alignItems: 'center' }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="inbox" size={14} /></span>
              <div className="row-main">
                <div className="row-title">{nameOf(r.player_id)} — {r.type === 'programma' ? 'Nuovo programma' : r.type === 'allenamento' ? 'Prenota allenamento' : 'Messaggio'}</div>
                <div className="row-sub">{r.created_at ? fmtDate(r.created_at.slice(0, 10)) : ''}</div>
              </div>
            </div>
          ))}
        </div></div>
      </>}

      {/* Azioni rapide */}
      <div style={label}>Azioni rapide</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {quick.map(q => (
          <button key={q.l} className="card" style={{ padding: 16, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }} onClick={() => goto?.(q.r)}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={q.icon} size={16} /></span>
            <span style={{ fontWeight: 600 }}>{q.l}</span>
          </button>
        ))}
      </div>

      {/* Attività recenti */}
      <div style={label}>Attività recenti</div>
      {recent.length === 0
        ? <div className="card" style={{ padding: 16 }}><span className="faint">Nessun programma ancora.</span></div>
        : <div className="card" style={{ padding: 6 }}><div className="list">
          {recent.map(p => (
            <div key={p.id} className="row" style={{ alignItems: 'center', cursor: goto ? 'pointer' : 'default' }} onClick={() => goto?.('fitness')}>
              <div className="row-main">
                <div className="row-title">{p.name}</div>
                <div className="row-sub">{nameOf(p.player_id)}{p.program_date ? ` · ${fmtDate(p.program_date)}` : ''} · {p.status === 'published' ? 'Pubblicato' : 'Bozza'}</div>
              </div>
            </div>
          ))}
        </div></div>}
    </div>
  )
}
