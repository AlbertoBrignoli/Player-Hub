import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import Icon from './Icon'

// Ricerca unica (come Spotlight): un campo che cerca in tutta l'app dell'atleta selezionato:
// sezioni, impegni, task, contratti, documenti, fisco, polizze, patrimonio, contenuti, sponsor,
// messaggi e servizi. Un tocco porta dove sta la voce. Le regole di accesso del database valgono
// anche qui: ognuno trova solo ciò che può già vedere.
type Hit = { key: string; group: string; icon: string; title: string; sub?: string; route: string }

const esc = (q: string) => q.replace(/[%_,()]/g, ' ').trim()

export function SearchButton({ goto, sections }: { goto: (r: string) => void; sections: { key: string; label: string }[] }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  // Cmd/Ctrl + K apre la ricerca su PC
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  return (
    <>
      <button className="bell" onClick={() => setOpen(true)} aria-label={t('Cerca')} title={`${t('Cerca')} (⌘K)`}>
        <Icon name="search" size={18} />
      </button>
      {open && <SearchSheet goto={r => { setOpen(false); goto(r) }} onClose={() => setOpen(false)} sections={sections} />}
    </>
  )
}

function SearchSheet({ goto, onClose, sections }: { goto: (r: string) => void; onClose: () => void; sections: { key: string; label: string }[] }) {
  const { t } = useLang()
  const { athleteId } = useAthlete()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    const term = esc(q)
    if (term.length < 2) { setHits([]); setBusy(false); return }
    let ok = true
    setBusy(true)
    const timer = setTimeout(async () => {
      const like = `%${term}%`
      const pid = athleteId
      const by = (qb: any) => pid ? qb.eq('player_id', pid) : qb
      const [ev, tk, ct, dc, tx, ins, wl, ed, sp, ms, sv] = await Promise.all([
        by(supabase.from('crm_events').select('id,title,start_at').ilike('title', like)).order('start_at', { ascending: false }).limit(5),
        by(supabase.from('crm_tasks').select('id,title').ilike('title', like)).limit(5),
        by(supabase.from('crm_contracts').select('id,title,end_date').ilike('title', like)).limit(5),
        by(supabase.from('crm_documents').select('id,name,category').ilike('name', like)).limit(5),
        by(supabase.from('crm_tax_items').select('id,title,category').ilike('title', like)).limit(5),
        by(supabase.from('crm_insurance_policies').select('id,title,category').ilike('title', like)).limit(5),
        by(supabase.from('crm_wealth_items').select('id,title,category').ilike('title', like)).limit(5),
        by(supabase.from('crm_editorial').select('id,title,entry_date').ilike('title', like)).order('entry_date', { ascending: false }).limit(5),
        by(supabase.from('crm_sponsors').select('id,brand').ilike('brand', like)).limit(5),
        by(supabase.from('crm_messages').select('id,body,sender_name,channel,created_at').ilike('body', like)).order('created_at', { ascending: false }).limit(5),
        supabase.from('crm_services_public').select('id,title,partner_name').ilike('title', like).limit(5),
      ])
      if (!ok) return
      const d = (s?: string | null) => s ? new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : undefined
      const out: Hit[] = []
      const low = term.toLowerCase()
      sections.filter(s => t(s.label).toLowerCase().includes(low)).slice(0, 4)
        .forEach(s => out.push({ key: 'sec' + s.key, group: t('Sezioni'), icon: 'grid', title: t(s.label), route: s.key }))
      const push = (rows: any, group: string, icon: string, map: (r: any) => Omit<Hit, 'key' | 'group' | 'icon'>) =>
        ((rows?.data as any[]) || []).forEach(r => out.push({ key: group + r.id, group: t(group), icon, ...map(r) }))
      push(ev, 'Impegni', 'calendar', r => ({ title: r.title, sub: d(r.start_at), route: `agenda?event=${r.id}` }))
      push(tk, 'Task', 'check-square', r => ({ title: r.title, route: 'tasks' }))
      push(ct, 'Contratti', 'briefcase', r => ({ title: r.title, sub: r.end_date ? `${t('scade')} ${d(r.end_date)}` : undefined, route: 'contracts' }))
      push(dc, 'Documenti', 'archive', r => ({ title: r.name, sub: r.category ? t(r.category) : undefined, route: 'documents' }))
      push(tx, 'Fisco e legale', 'file', r => ({ title: r.title, sub: r.category ? t(r.category) : undefined, route: `legaltax?item=${r.id}` }))
      push(ins, 'Polizze', 'lock', r => ({ title: r.title, sub: r.category ? t(r.category) : undefined, route: `insurance?item=${r.id}` }))
      push(wl, 'Patrimonio', 'briefcase', r => ({ title: r.title, route: `wealth?item=${r.id}` }))
      push(ed, 'Contenuti', 'image', r => ({ title: r.title, sub: d(r.entry_date), route: `editorial?entry=${r.id}` }))
      push(sp, 'Sponsor', 'award', r => ({ title: r.brand, route: 'sponsors' }))
      push(ms, 'Messaggi', 'message', r => ({ title: r.body, sub: [r.sender_name, d(r.created_at)].filter(Boolean).join(' · '), route: 'messages' }))
      push(sv, 'Servizi AUVI', 'layers', r => ({ title: r.title, sub: r.partner_name || undefined, route: `services?service=${r.id}` }))
      setHits(out)
      setBusy(false)
    }, 250)
    return () => { ok = false; clearTimeout(timer) }
  }, [q, athleteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = [...new Set(hits.map(h => h.group))]
  return (
    <div className="gs-overlay" onClick={onClose}>
      <style>{GS_CSS}</style>
      <div className="gs" onClick={e => e.stopPropagation()} role="dialog" aria-label={t('Cerca')}>
        <label className="gs-field">
          <Icon name="search" size={18} />
          <input ref={ref} value={q} onChange={e => setQ(e.target.value)} placeholder={t('Cerca in tutta l\'app')} enterKeyHint="search" />
          <button className="gs-close" onClick={onClose}>{t('Annulla')}</button>
        </label>
        <div className="gs-body">
          {esc(q).length < 2 ? (
            <div className="gs-hint">{t('Impegni, contratti, documenti, messaggi, servizi…')}</div>
          ) : busy && !hits.length ? (
            <div className="gs-hint">{t('Cerco…')}</div>
          ) : !hits.length ? (
            <div className="gs-hint">{t('Nessun risultato')}</div>
          ) : groups.map(g => (
            <div key={g} className="gs-group">
              <div className="gs-gt">{g}</div>
              {hits.filter(h => h.group === g).map(h => (
                <button key={h.key} className="gs-hit" onClick={() => goto(h.route)}>
                  <span className="gs-ic"><Icon name={h.icon} size={15} /></span>
                  <span className="gs-txt">
                    <span className="gs-t">{h.title}</span>
                    {h.sub && <span className="gs-s">{h.sub}</span>}
                  </span>
                  <Icon name="chevron-right" size={15} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const GS_CSS = `
.gs-overlay { position: fixed; inset: 0; z-index: 120; background: rgba(10,10,10,.42); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  display: grid; justify-items: center; align-items: start; padding: calc(10vh + env(safe-area-inset-top)) 16px 16px; }
.gs { width: 100%; max-width: 620px; max-height: 76vh; display: flex; flex-direction: column; background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
.gs-field { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border); color: var(--text-dim); }
.gs-field input { flex: 1; min-width: 0; border: 0; outline: none; background: none; font: inherit; font-size: 16px; color: var(--text); }
.gs-close { border: 0; background: none; font: inherit; font-size: var(--fs-meta); font-weight: 600; color: var(--text-dim); cursor: pointer; }
.gs-body { overflow-y: auto; padding: 6px 0 10px; }
.gs-hint { padding: 22px 16px; text-align: center; color: var(--text-faint); font-size: var(--fs-body); }
.gs-group { padding: 6px 0; }
.gs-gt { padding: 6px 16px 4px; font-size: var(--fs-meta); font-weight: var(--w-bold); color: var(--text-dim); }
.gs-hit { display: flex; align-items: center; gap: 12px; width: 100%; padding: 9px 16px; min-height: 48px; border: 0; background: none; text-align: left; cursor: pointer; font: inherit; color: var(--text); }
.gs-hit:hover, .gs-hit:focus-visible { background: var(--surface-2); outline: none; }
.gs-ic { width: 32px; height: 32px; border-radius: 12px; background: var(--bg-2); display: grid; place-items: center; flex-shrink: 0; }
.gs-txt { flex: 1; min-width: 0; display: grid; gap: 1px; }
.gs-t { font-weight: var(--w-semi); font-size: var(--fs-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gs-s { font-size: var(--fs-meta); color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 640px) {
  .gs-overlay { padding: 0; align-items: stretch; }
  .gs { max-width: none; max-height: none; height: 100%; border-radius: 0; padding-top: env(safe-area-inset-top); }
}
`
