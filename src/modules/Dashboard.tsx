import { useEffect, useState } from 'react'
import { supabase, PLAYER_NAME } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Stat, Spinner, Badge } from '../components/ui'
import { fmtMoney, fmtDate, fmtDateTime, daysUntil } from '../lib/format'
import type { Player, Payment, Task, EventItem, Contract, Sponsor } from '../lib/types'

export default function Dashboard({ goto }: { goto: (r: string) => void }) {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [events, setEvents] = useState<EventItem[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [sponsors, setSponsors] = useState<Sponsor[]>([])

  useEffect(() => {
    (async () => {
      const [p, pay, tk, ev, ct, sp] = await Promise.all([
        supabase.from('player').select('*').limit(1).maybeSingle(),
        supabase.from('crm_payments').select('*'),
        supabase.from('crm_tasks').select('*'),
        supabase.from('crm_events').select('*').gte('start_at', new Date().toISOString()).order('start_at').limit(5),
        supabase.from('crm_contracts').select('*'),
        supabase.from('crm_sponsors').select('*'),
      ])
      setPlayer(p.data as Player)
      setPayments((pay.data as Payment[]) || [])
      setTasks((tk.data as Task[]) || [])
      setEvents((ev.data as EventItem[]) || [])
      setContracts((ct.data as Contract[]) || [])
      setSponsors((sp.data as Sponsor[]) || [])
      setLoading(false)
    })()
  }, [])

  if (loading) return <Spinner />

  const upcomingPayments = payments.filter(p => !p.paid && p.direction === 'in')
  const incomeYear = payments.filter(p => p.direction === 'in').reduce((s, p) => s + Number(p.amount), 0)
  const openTasks = tasks.filter(t => t.status !== 'done')
  const nextEvent = events[0]
  const nextContractExpiry = contracts
    .filter(c => c.end_date)
    .map(c => ({ c, d: daysUntil(c.end_date) }))
    .filter(x => x.d != null && x.d >= 0)
    .sort((a, b) => (a.d! - b.d!))[0]
  const activeSponsors = sponsors.filter(s => s.status === 'active')

  const greeting = new Date().getHours() < 13 ? 'Buongiorno' : new Date().getHours() < 19 ? 'Buon pomeriggio' : 'Buonasera'
  const firstName = (profile?.full_name || PLAYER_NAME).split(' ')[0]

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* Hero */}
      <div className="card card-lg flex between" style={{ gap: 20, alignItems: 'center' }}>
        <div className="flex gap" style={{ gap: 16 }}>
          {player?.photo_url
            ? <img src={player.photo_url} alt="" style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'cover', border: '1px solid var(--border-2)' }} />
            : <div className="avatar" style={{ width: 64, height: 64, fontSize: 22 }}>{firstName[0]}</div>}
          <div>
            <div style={{ fontSize: 20, fontWeight: 750, letterSpacing: '-.5px' }}>{greeting}, {firstName}</div>
            <div className="muted" style={{ marginTop: 3 }}>
              {player ? `${player.position} · ${player.team_name} · #${player.shirt_number ?? '—'}` : 'Gestione riservata AUVI'}
            </div>
          </div>
        </div>
        {nextEvent && (
          <div className="card" style={{ background: 'var(--bg-2)', minWidth: 210 }}>
            <div className="stat-label">Prossimo impegno</div>
            <div style={{ fontWeight: 700, marginTop: 4 }}>{nextEvent.title}</div>
            <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{fmtDateTime(nextEvent.start_at)}</div>
          </div>
        )}
      </div>

      {/* KPI */}
      <div className="grid g4">
        <Stat icon="💶" label="Incassi registrati" value={fmtMoney(incomeYear)} sub={`${payments.filter(p => p.direction === 'in').length} voci`} />
        <Stat icon="⏳" label="Pagamenti da incassare" value={upcomingPayments.length} tone="var(--gold)"
          sub={fmtMoney(upcomingPayments.reduce((s, p) => s + Number(p.amount), 0))} />
        <Stat icon="✓" label="Task aperte" value={openTasks.length} tone={openTasks.length ? 'var(--accent)' : undefined}
          sub={`${tasks.filter(t => t.status === 'done').length} completate`} />
        <Stat icon="🤝" label="Sponsor attivi" value={activeSponsors.length}
          sub={fmtMoney(activeSponsors.reduce((s, x) => s + Number(x.value || 0), 0)) + ' valore'} />
      </div>

      <div className="grid g2">
        {/* Prossimi impegni */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">🗓 Prossimi impegni</div>
            <button className="btn btn-ghost btn-sm" onClick={() => goto('agenda')}>Agenda →</button>
          </div>
          {events.length === 0 ? <div className="faint" style={{ padding: '10px 0' }}>Nessun impegno in programma.</div> : (
            <div className="list">
              {events.map(e => (
                <div className="row" key={e.id}>
                  <span className="dot" style={{ background: eventColor(e.type) }} />
                  <div className="row-main">
                    <div className="row-title">{e.title}</div>
                    <div className="row-sub">{e.location || eventLabel(e.type)}</div>
                  </div>
                  <div className="row-right faint" style={{ fontSize: 12 }}>{fmtDateTime(e.start_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scadenze */}
        <div className="card">
          <div className="card-head"><div className="card-title">⚠️ Scadenze da tenere d'occhio</div></div>
          <div className="list">
            {nextContractExpiry && (
              <div className="row">
                <div className="row-main">
                  <div className="row-title">Contratto · {nextContractExpiry.c.title}</div>
                  <div className="row-sub">Scade il {fmtDate(nextContractExpiry.c.end_date)}</div>
                </div>
                <Badge tone={nextContractExpiry.d! < 90 ? 'red' : 'gold'}>{nextContractExpiry.d} gg</Badge>
              </div>
            )}
            {upcomingPayments.slice(0, 3).map(p => (
              <div className="row" key={p.id}>
                <div className="row-main">
                  <div className="row-title">{p.description || p.category}</div>
                  <div className="row-sub">Incasso previsto {fmtDate(p.due_date)}</div>
                </div>
                <div className="row-right"><b className="mono">{fmtMoney(Number(p.amount), p.currency)}</b></div>
              </div>
            ))}
            {!nextContractExpiry && upcomingPayments.length === 0 && (
              <div className="faint" style={{ padding: '10px 0' }}>Tutto in ordine, nessuna scadenza imminente. ✅</div>
            )}
          </div>
        </div>
      </div>

      {/* Task rapide */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">✓ Attività aperte</div>
          <button className="btn btn-ghost btn-sm" onClick={() => goto('tasks')}>Tutte le task →</button>
        </div>
        {openTasks.length === 0 ? <div className="faint" style={{ padding: '10px 0' }}>Nessuna attività aperta.</div> : (
          <div className="list">
            {openTasks.slice(0, 5).map(t => (
              <div className="row" key={t.id}>
                <span className="dot" style={{ background: t.priority === 'high' ? 'var(--red)' : t.priority === 'low' ? 'var(--text-faint)' : 'var(--gold)' }} />
                <div className="row-main">
                  <div className="row-title">{t.title}</div>
                  <div className="row-sub">{t.assignee === 'player' ? 'Assegnata al giocatore' : 'In carico ad AUVI'}{t.due_date ? ` · entro ${fmtDate(t.due_date)}` : ''}</div>
                </div>
                <Badge tone={t.status === 'doing' ? 'blue' : undefined}>{t.status === 'doing' ? 'In corso' : 'Da fare'}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function eventColor(t: string) {
  return t === 'partita' ? 'var(--accent)' : t === 'commerciale' ? 'var(--gold)' : t === 'scadenza' ? 'var(--red)' : 'var(--blue)'
}
function eventLabel(t: string) {
  return t === 'partita' ? 'Partita' : t === 'commerciale' ? 'Impegno commerciale' : t === 'scadenza' ? 'Scadenza' : 'Personale'
}
