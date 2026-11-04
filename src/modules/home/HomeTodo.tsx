import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAthlete } from '../../lib/athlete'
import { useLang } from '../../lib/i18n'
import { undoable, toast } from '../../lib/toast'
import Icon from '../../components/Icon'

// "Da fare" in Home: le cose concrete che aspettano l'atleta, ognuna con la sua azione accanto,
// così arriva la notifica, apre la Home, capisce subito cosa deve fare e lo smarca lì.
//  - task assegnato a lui → cerchio da toccare (con Annulla per qualche secondo)
//  - impegno proposto dal team → Conferma direttamente dalla riga
//  - allenamento del preparatore → Rispondi (apre la scheda)
//  - documento richiesto dal commercialista → Carica (apre la richiesta)
// Se non c'è niente la sezione non compare.
type Row = { id: string; kind: 'task' | 'event' | 'program' | 'doc'; title: string; sub: string; route?: string }

const PRO_ROLES = ['agente', 'preparatore', 'assicuratore', 'commercialista', 'fisioterapista', 'nutrizionista', 'wealth', 'partner']
const ROLE_L: Record<string, string> = {
  agente: 'Procuratore', preparatore: 'Preparatore', assicuratore: 'Assicuratore', commercialista: 'Commercialista',
  fisioterapista: 'Fisioterapista', nutrizionista: 'Nutrizionista', wealth: 'Wealth manager', partner: 'Partner', admin: 'AUVI',
}

export default function HomeTodo({ goto, locale, tz }: { goto: (r: string) => void; locale: string; tz?: string | null }) {
  const { athleteId } = useAthlete()
  const { t } = useLang()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const when = (iso: string, time = true) => new Date(iso).toLocaleString(locale, {
    weekday: 'short', day: 'numeric', month: 'short', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: tz || undefined,
  }).replace('.', '')

  async function load() {
    if (!athleteId) { setRows([]); return }
    const today = new Date().toISOString().slice(0, 10)
    const [ev, tk, pr, dc] = await Promise.all([
      supabase.from('crm_events').select('id, title, start_at, proposed_by_role').eq('player_id', athleteId)
        .eq('request_status', 'da_confermare').in('proposed_by_role', PRO_ROLES).order('start_at').limit(5),
      supabase.from('crm_tasks').select('id, title, due_date').eq('player_id', athleteId).eq('assignee', 'player')
        .neq('status', 'done').order('due_date', { ascending: true, nullsFirst: false }).limit(5),
      supabase.from('fitness_programs').select('id, name, program_date').eq('player_id', athleteId).eq('status', 'published')
        .is('deleted_at', null).is('athlete_response', null).gte('program_date', today).order('program_date').limit(3),
      supabase.from('crm_tax_items').select('id, title, due_date').eq('player_id', athleteId).eq('kind', 'richiesta')
        .eq('status', 'aperto').order('due_date', { ascending: true, nullsFirst: false }).limit(3),
    ])
    const out: Row[] = []
    ;((ev.data as any[]) || []).forEach(e => out.push({ id: e.id, kind: 'event', title: e.title,
      sub: `${when(e.start_at)} · ${t('proposto da')} ${t(ROLE_L[e.proposed_by_role] || e.proposed_by_role)}`, route: `agenda?event=${e.id}` }))
    ;((tk.data as any[]) || []).forEach(x => out.push({ id: x.id, kind: 'task', title: x.title,
      sub: x.due_date ? t('entro il {d}').replace('{d}', when(x.due_date, false)) : t('Da AUVI') }))
    ;((pr.data as any[]) || []).forEach(p => out.push({ id: p.id, kind: 'program', title: p.name || t('Allenamento'),
      sub: `${when(p.program_date, false)} · ${t('dì al preparatore se lo farai')}`, route: `fitness?program=${p.id}` }))
    ;((dc.data as any[]) || []).forEach(d => out.push({ id: d.id, kind: 'doc', title: d.title,
      sub: d.due_date ? `${t('Documento richiesto')} · ${t('entro il {d}').replace('{d}', when(d.due_date, false))}` : t('Documento richiesto'),
      route: `legaltax?item=${d.id}` }))
    setRows(out)
  }
  useEffect(() => { load() }, [athleteId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows || rows.length === 0) return null

  // smarca subito: sparisce dalla lista, si salva dopo qualche secondo (Annulla lo rimette)
  function doneTask(r: Row) {
    setRows(rs => (rs || []).filter(x => x.id !== r.id))
    undoable(t('Fatto: {t}').replace('{t}', r.title),
      () => supabase.from('crm_tasks').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', r.id).then(({ error }) => { if (error) throw error }),
      () => setRows(rs => [r, ...(rs || [])]))
  }
  async function confirmEvent(r: Row) {
    setBusy(r.id)
    const { error } = await supabase.from('crm_events').update({ request_status: 'confermata' }).eq('id', r.id)
    setBusy(null)
    if (error) { toast(error.message, 'err'); return }
    toast(t('Impegno confermato'))
    setRows(rs => (rs || []).filter(x => x.id !== r.id))
  }

  return (
    <section className="home-sec">
      <style>{TD_CSS}</style>
      <div className="home-h">
        <span>{t('Da fare')} <span className="td-count">{rows.length}</span></span>
        <button className="home-h-link" onClick={() => goto('tasks')}>{t('Apri')} <Icon name="chevron-right" size={14} /></button>
      </div>
      <div className="td-list">
        {rows.slice(0, 6).map(r => (
          <div key={r.kind + r.id} className="td-row">
            {r.kind === 'task'
              ? <button className="td-check" onClick={() => doneTask(r)} aria-label={t('Segna come fatto')}><Icon name="check" size={14} strokeWidth={2.6} /></button>
              : <span className="td-ic"><Icon name={r.kind === 'event' ? 'calendar' : r.kind === 'program' ? 'dumbbell' : 'file'} size={15} /></span>}
            <button className="td-txt" onClick={() => r.route ? goto(r.route) : goto('tasks')}>
              <span className="td-t">{r.title}</span>
              <span className="td-s">{r.sub}</span>
            </button>
            {r.kind === 'event' && (
              <button className="td-act" disabled={busy === r.id} onClick={() => confirmEvent(r)}>{t('Conferma')}</button>
            )}
            {r.kind === 'program' && <button className="td-act ghost" onClick={() => goto(r.route!)}>{t('Rispondi')}</button>}
            {r.kind === 'doc' && <button className="td-act ghost" onClick={() => goto(r.route!)}>{t('Carica')}</button>}
          </div>
        ))}
      </div>
    </section>
  )
}

const TD_CSS = `
.td-count { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; margin-left: 4px; border-radius: 999px; background: var(--ink); color: var(--yellow); font-size: 12px; font-weight: 800; vertical-align: 2px; font-variant-numeric: tabular-nums; }
.td-list { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.td-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px 10px 14px; min-height: 60px; }
.td-row + .td-row { border-top: 1px solid var(--border); }
.td-check { width: 28px; height: 28px; border-radius: 50%; border: 2px solid var(--border-2); background: var(--surface); color: transparent; display: grid; place-items: center; cursor: pointer; flex-shrink: 0; transition: background .15s, border-color .15s, color .15s; }
.td-check:hover { border-color: var(--ink); color: var(--text-faint); }
.td-check:active { background: var(--yellow); border-color: var(--yellow); color: var(--ink); }
.td-ic { width: 28px; height: 28px; border-radius: 8px; background: var(--yellow); color: var(--ink); display: grid; place-items: center; flex-shrink: 0; }
.td-txt { flex: 1; min-width: 0; display: grid; gap: 1px; text-align: left; border: 0; background: none; padding: 0; font: inherit; color: var(--text); cursor: pointer; }
.td-t { font-weight: var(--w-semi); font-size: var(--fs-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.td-s { font-size: var(--fs-meta); color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.td-act { flex-shrink: 0; min-height: 36px; padding: 0 14px; border-radius: 999px; border: 0; background: var(--yellow); color: var(--ink); font: inherit; font-size: var(--fs-meta); font-weight: 800; cursor: pointer; }
.td-act.ghost { background: var(--bg-2); }
.td-act:disabled { opacity: .5; }
`
