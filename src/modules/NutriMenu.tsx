import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast, undoable } from '../lib/toast'
import { Modal, Field, Input, Textarea, Select, Tabs, Empty, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { useNutriLibrary, MEAL_CATS, SUP_CATS, SUP_WHEN, type LibItem } from '../lib/nutriLibrary'

// "Il mio menu" del nutrizionista: tutti i pasti e gli integratori a portata di mano.
// Da qui si preparano e si correggono; nel calendario dell'atleta si scelgono con un tocco.
// Quello che scrive a mano su un impegno arriva qui da solo.
const ACCENT = '#4D7C0F'

type Kind = 'pasto' | 'integratore'
const empty = (kind: Kind, category = ''): Partial<LibItem> =>
  ({ kind, name: '', category: category || (kind === 'pasto' ? 'colazione' : 'recupero'), details: '', dose: '', timing: '' })

export default function NutriMenu() {
  const { items, loading, reload, setItems } = useNutriLibrary()
  const [kind, setKind] = useState<Kind>('pasto')
  const [cat, setCat] = useState<string>('')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Partial<LibItem> | null>(null)
  const cats = kind === 'pasto' ? MEAL_CATS : SUP_CATS

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return items.filter(i => i.kind === kind
      && (!cat || (i.category || 'altro') === cat)
      && (!s || [i.name, i.details, i.dose, i.timing].some(x => (x || '').toLowerCase().includes(s))))
  }, [items, kind, cat, q])

  // raggruppati per categoria, nell'ordine della giornata (pasti) o del tipo (integratori)
  const groups = useMemo(() => {
    const order = cats.map(c => c.key)
    const by: Record<string, LibItem[]> = {}
    list.forEach(i => { const k = order.includes(i.category || '') ? i.category! : (kind === 'pasto' ? 'spuntino' : 'altro'); (by[k] ||= []).push(i) })
    return order.filter(k => by[k]?.length).map(k => ({ key: k, label: cats.find(c => c.key === k)!.label, rows: by[k] }))
  }, [list, cats, kind])

  const count = (k: Kind) => items.filter(i => i.kind === k).length

  function del(i: LibItem) {
    setItems(xs => xs.filter(x => x.id !== i.id))
    undoable(`${i.name} tolto dal menu`, async () => supabase.from('crm_nutri_library').delete().eq('id', i.id), reload)
  }

  if (loading) return <Spinner />

  return (
    <div className="grid" style={{ gap: 14 }}>
      <style>{NM_CSS}</style>
      <div className="nm-hero">
        <div className="nm-hero-bar" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="nm-kicker">Il mio menu</div>
          <div className="nm-title">Pasti e integratori pronti all'uso</div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
            Preparali qui e sceglili con un tocco sugli impegni dell'atleta. Quello che scrivi a mano nel calendario si aggiunge da solo.
          </div>
        </div>
        <div className="nm-stats">
          <div><b>{count('pasto')}</b><span>pasti</span></div>
          <div><b>{count('integratore')}</b><span>integratori</span></div>
        </div>
      </div>

      <div className="flex between" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Tabs tabs={[{ key: 'pasto', label: `Pasti · ${count('pasto')}` }, { key: 'integratore', label: `Integratori · ${count('integratore')}` }]}
          value={kind} onChange={(k: Kind) => { setKind(k); setCat('') }} />
        <button className="btn btn-primary" onClick={() => setEdit(empty(kind, cat))}>
          + {kind === 'pasto' ? 'Nuovo pasto' : 'Nuovo integratore'}
        </button>
      </div>

      <div className="nm-filters">
        <div className="nm-search">
          <Icon name="grid" size={14} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={kind === 'pasto' ? 'Cerca un pasto o un alimento…' : 'Cerca un integratore…'} />
        </div>
        <div className="nm-chips">
          <button className={'nm-chip' + (!cat ? ' on' : '')} onClick={() => setCat('')}>Tutti</button>
          {cats.map(c => (
            <button key={c.key} className={'nm-chip' + (cat === c.key ? ' on' : '')} onClick={() => setCat(cat === c.key ? '' : c.key)}>{c.label}</button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="card"><Empty icon={<Icon name="layers" size={26} strokeWidth={1.5} />}
          title={q || cat ? 'Nessun risultato' : 'Menu vuoto'}
          hint={kind === 'pasto' ? 'Aggiungi il primo pasto con "Nuovo pasto".' : 'Aggiungi il primo integratore con "Nuovo integratore".'} /></div>
      ) : groups.map(g => (
        <div key={g.key}>
          <div className="nm-group">{g.label} <span>{g.rows.length}</span>
            <button className="nm-group-add" onClick={() => setEdit(empty(kind, g.key))}>+ Aggiungi</button>
          </div>
          <div className="nm-grid">
            {g.rows.map(i => (
              <div key={i.id} className="nm-card">
                <div className="nm-card-h">
                  <b>{i.name}</b>
                  <span className="nm-card-ic">
                    <button className="ev-ic" onClick={() => setEdit(i)} aria-label="Modifica"><Icon name="edit" size={15} /></button>
                    <button className="ev-ic ev-ic-danger" onClick={() => del(i)} aria-label="Elimina"><Icon name="trash" size={15} /></button>
                  </span>
                </div>
                {i.kind === 'pasto'
                  ? <div className="nm-card-d">{i.details || '—'}</div>
                  : <div className="nm-card-d">{[i.dose, i.timing].filter(Boolean).join(' · ') || '—'}</div>}
                {i.usage_count > 0 && <div className="nm-used">Usato {i.usage_count === 1 ? '1 volta' : `${i.usage_count} volte`}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {edit && <ItemForm value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function ItemForm({ value, onClose, onSaved }: { value: Partial<LibItem>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<LibItem>>(value)
  const [busy, setBusy] = useState(false)
  const meal = f.kind === 'pasto'
  const set = (k: keyof LibItem, v: any) => setF(p => ({ ...p, [k]: v }))
  const ok = !!f.name?.trim() && (meal ? !!f.details?.trim() : true)

  async function save() {
    if (!ok) return
    setBusy(true)
    const row = {
      kind: f.kind, name: f.name!.trim(), category: f.category || null,
      details: meal ? (f.details || '').trim() : null,
      dose: meal ? null : (f.dose || '').trim() || null,
      timing: meal ? null : (f.timing || '').trim() || null,
    }
    const { error } = f.id
      ? await supabase.from('crm_nutri_library').update(row).eq('id', f.id)
      : await supabase.from('crm_nutri_library').insert(row)
    setBusy(false)
    if (error) { toast(error.code === '23505' ? 'Esiste già una voce con questo nome' : error.message, 'err'); return }
    toast(f.id ? 'Voce aggiornata' : 'Aggiunto al menu')
    onSaved()
  }

  return (
    <Modal title={(f.id ? 'Modifica ' : 'Nuovo ') + (meal ? 'pasto' : 'integratore')} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" disabled={busy || !ok} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button>
      </>}>
      <div className="grid" style={{ gap: 10 }}>
        <Field label="Nome"><Input value={f.name || ''} onChange={e => set('name', e.target.value)} placeholder={meal ? 'Es. Colazione proteica' : 'Es. Creatina'} autoFocus /></Field>
        <Field label="Categoria">
          <Select value={f.category || ''} onChange={e => set('category', e.target.value)}>
            {(meal ? MEAL_CATS : SUP_CATS).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </Select>
        </Field>
        {meal ? (
          <Field label="Cosa mangiare"><Textarea rows={3} value={f.details || ''} onChange={e => set('details', e.target.value)} placeholder="Es. Avena 80 g, yogurt greco 170 g, frutti rossi, 2 uova" /></Field>
        ) : (
          <div className="grid g2" style={{ gap: 10 }}>
            <Field label="Dose"><Input value={f.dose || ''} onChange={e => set('dose', e.target.value)} placeholder="Es. 5 g" /></Field>
            <Field label="Quando">
              <Select value={f.timing || ''} onChange={e => set('timing', e.target.value)}>
                <option value="">—</option>
                {SUP_WHEN.map(w => <option key={w} value={w}>{w}</option>)}
              </Select>
            </Field>
          </div>
        )}
      </div>
    </Modal>
  )
}

const NM_CSS = `
.nm-hero { position: relative; overflow: hidden; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; border-radius: 18px; background: var(--bg-2); border: 1px solid var(--border); padding: 20px 22px; }
.nm-hero-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: ${ACCENT}; }
.nm-kicker { font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; font-weight: 800; color: ${ACCENT}; }
.nm-title { font-size: 22px; font-weight: 900; letter-spacing: -.3px; margin-top: 2px; }
.nm-stats { display: flex; gap: 10px; }
.nm-stats > div { display: grid; justify-items: center; min-width: 74px; padding: 8px 10px; border-radius: 12px; background: var(--card); border: 1px solid var(--border); }
.nm-stats b { font-size: 20px; font-weight: 900; }
.nm-stats span { font-size: 11px; color: var(--text-dim); }
.nm-filters { display: grid; gap: 10px; }
.nm-search { display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 40px; border-radius: 12px; border: 1px solid var(--border); background: var(--card); color: var(--text-dim); }
.nm-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: inherit; font-size: 14px; color: var(--text); }
.nm-chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
.nm-chips::-webkit-scrollbar { display: none; }
.nm-chip { flex-shrink: 0; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--card); font-size: 12.5px; font-weight: 600; color: var(--text); cursor: pointer; }
.nm-chip.on { background: ${ACCENT}; border-color: ${ACCENT}; color: #fff; }
.nm-group { display: flex; align-items: center; gap: 8px; font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; font-weight: 800; color: var(--text-dim); margin: 6px 2px 8px; }
.nm-group span { font-weight: 700; color: var(--text-faint, var(--text-dim)); }
.nm-group-add { margin-left: auto; border: 0; background: none; color: ${ACCENT}; font-size: 12px; font-weight: 700; text-transform: none; letter-spacing: 0; cursor: pointer; }
.nm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.nm-card { background: var(--card); border: 1px solid var(--border); border-left: 3px solid ${ACCENT}; border-radius: 14px; padding: 11px 12px; display: grid; gap: 4px; min-width: 0; }
.nm-card-h { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.nm-card-h b { font-size: 14px; line-height: 1.3; overflow-wrap: anywhere; }
.nm-card-ic { display: inline-flex; gap: 2px; flex-shrink: 0; margin: -4px -6px 0 0; }
.nm-card-d { font-size: 12.5px; color: var(--text-dim); line-height: 1.4; overflow-wrap: anywhere; }
.nm-used { font-size: 11px; color: ${ACCENT}; font-weight: 700; }
`
