import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { defaultWeek } from './WeekPlan'
import Icon from './Icon'

// "Ti aspettano": in UN solo elenco tutto quello che attende l'atleta, ovunque si trovi nell'app
// (proposte d'impegno, programmi da confermare, documenti richiesti, task, foto, messaggi non letti,
// richieste di accesso, programma della settimana). Ogni riga porta dove si risponde.
// Lo usano la Home (riga "Oggi") e la pagina Task.
export type WaitItem = { key: string; icon: string; title: string; sub: string; n: number; route: string }

const PRO_ROLES = ['agente', 'preparatore', 'assicuratore', 'commercialista', 'fisioterapista', 'nutrizionista', 'wealth', 'partner']

export function useWaiting(): { items: WaitItem[]; total: number; loading: boolean } {
  const { athleteId } = useAthlete()
  const { role, session } = useAuth()
  const { t } = useLang()
  const [items, setItems] = useState<WaitItem[]>([])
  const [loading, setLoading] = useState(true)
  const isPlayer = role === 'player'
  const me = session?.user.id

  useEffect(() => {
    if (!athleteId) { setItems([]); setLoading(false); return }
    let ok = true
    setLoading(true)
    ;(async () => {
      const today = new Date().toISOString().slice(0, 10)
      const count = (q: any) => q.then((r: { count: number | null }) => r.count || 0)
      const [proposals, programs, docs, tasks, photos, unread, access, plan] = await Promise.all([
        count(supabase.from('crm_events').select('id', { count: 'exact', head: true }).eq('player_id', athleteId)
          .eq('request_status', 'da_confermare').in('proposed_by_role', PRO_ROLES)),
        count(supabase.from('fitness_programs').select('id', { count: 'exact', head: true }).eq('player_id', athleteId)
          .eq('status', 'published').is('deleted_at', null).is('athlete_response', null).gte('program_date', today)),
        count(supabase.from('crm_tax_items').select('id', { count: 'exact', head: true }).eq('player_id', athleteId)
          .eq('kind', 'richiesta').eq('status', 'aperto')),
        count(supabase.from('crm_tasks').select('id', { count: 'exact', head: true }).eq('player_id', athleteId)
          .neq('status', 'done')),
        count(supabase.from('crm_media').select('id', { count: 'exact', head: true }).eq('player_id', athleteId)
          .eq('status', 'da_approvare')),
        me ? count(supabase.from('crm_messages').select('id', { count: 'exact', head: true }).eq('player_id', athleteId)
          .is('read_at', null).neq('sender_id', me)) : Promise.resolve(0),
        isPlayer ? count(supabase.from('crm_access_requests').select('id', { count: 'exact', head: true })
          .eq('player_id', athleteId).eq('status', 'pending')) : Promise.resolve(0),
        isPlayer ? count(supabase.from('crm_week_plans').select('id', { count: 'exact', head: true }).eq('player_id', athleteId)
          .eq('week_start', defaultWeek()).eq('status', 'confermato')) : Promise.resolve(1),
      ])
      if (!ok) return
      const list: WaitItem[] = []
      const add = (n: number, key: string, icon: string, title: string, sub: string, route: string) => {
        if (n > 0) list.push({ key, icon, title: t(title), sub: t(sub), n, route })
      }
      add(proposals, 'proposals', 'calendar', 'Impegni da confermare', 'Proposti dal tuo team', 'agenda')
      add(programs, 'programs', 'dumbbell', 'Allenamenti da confermare', 'Dì al preparatore se li farai', 'fitness')
      add(docs, 'docs', 'file', 'Documenti richiesti', 'Dal commercialista', 'legaltax')
      add(unread, 'unread', 'message', 'Messaggi da leggere', 'Nelle tue chat', 'messages')
      add(photos, 'photos', 'image', 'Foto da approvare', 'In Media', 'media?tab=cartelle')
      add(tasks, 'tasks', 'check-square', 'Task aperti', 'Le attività condivise', 'tasks')
      add(access, 'access', 'key', 'Richieste di accesso', 'Professionisti che vogliono entrare nel team', 'access-requests')
      if (isPlayer && plan === 0) list.push({ key: 'plan', icon: 'upload', title: t('Carica il programma della settimana'),
        sub: t('Il PDF o la foto del club'), n: 1, route: 'agenda?plan=1' })
      setItems(list)
      setLoading(false)
    })()
    return () => { ok = false }
  }, [athleteId, isPlayer, me]) // eslint-disable-line react-hooks/exhaustive-deps

  return { items, total: items.reduce((s, i) => s + i.n, 0), loading }
}

/** Elenco "Ti aspettano": una riga per tipo, con il numero e la freccia verso dove si risponde */
export function WaitingList({ items, goto }: { items: WaitItem[]; goto: (r: string) => void }) {
  const { t } = useLang()
  return (
    <div className="wt-list">
      <style>{WT_CSS}</style>
      {items.length === 0 ? (
        <div className="wt-empty"><span className="wt-ic"><Icon name="check" size={16} /></span>{t('Niente in sospeso: sei in pari.')}</div>
      ) : items.map(i => (
        <button key={i.key} className="wt-row" onClick={() => goto(i.route)}>
          <span className="wt-ic"><Icon name={i.icon} size={16} /></span>
          <span className="wt-txt"><span className="wt-t">{i.title}</span><span className="wt-s">{i.sub}</span></span>
          {i.key !== 'plan' && <span className="wt-n">{i.n > 99 ? '99+' : i.n}</span>}
          <Icon name="chevron-right" size={16} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
        </button>
      ))}
    </div>
  )
}

const WT_CSS = `
.wt-list { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.wt-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; min-height: 60px; border: 0; background: none; text-align: left; cursor: pointer; font: inherit; color: var(--text); }
.wt-row + .wt-row { border-top: 1px solid var(--border); }
.wt-row:hover { background: var(--surface-2); }
.wt-ic { width: 36px; height: 36px; border-radius: 12px; background: var(--yellow); color: var(--ink); display: grid; place-items: center; flex-shrink: 0; }
.wt-txt { flex: 1; min-width: 0; display: grid; gap: 1px; }
.wt-t { font-weight: var(--w-bold); font-size: var(--fs-body); }
.wt-s { font-size: var(--fs-meta); color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wt-n { min-width: 24px; height: 24px; padding: 0 7px; border-radius: 999px; background: var(--ink); color: var(--yellow); font-size: 12.5px; font-weight: 800; display: grid; place-items: center; font-variant-numeric: tabular-nums; }
.wt-empty { display: flex; align-items: center; gap: 12px; padding: 14px; color: var(--text-dim); font-size: var(--fs-body); }
.wt-empty .wt-ic { background: var(--bg-2); color: var(--green); }
`
