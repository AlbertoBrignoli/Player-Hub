import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Modal, Field, Input, Textarea, Select, Empty, Spinner, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'

// Il mio ufficio del fisioterapista: atleti collegati + spazio clinico
// (valutazioni, trattamenti, esercizi). Dati privati del fisio (RLS: physio_id = auth.uid()).
const ACCENT = '#3E8E9E'
const kicker: React.CSSProperties = { fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800 }
const today = () => new Date().toISOString().slice(0, 10)

type Ath = { player_id: number; name: string }

export default function PhysioOffice() {
  const { session } = useAuth()
  const uid = session?.user.id
  const [athletes, setAthletes] = useState<Ath[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<Ath | null>(null)

  useEffect(() => {
    if (!uid) return
    let ok = true
    ;(async () => {
      const { data: links } = await supabase.from('crm_physio_athletes').select('player_id').eq('physio_id', uid)
      const ids = (links || []).map((l: any) => l.player_id)
      let list: Ath[] = []
      if (ids.length) {
        const { data: pl } = await supabase.from('player').select('api_player_id, name').in('api_player_id', ids)
        list = (pl || []).map((p: any) => ({ player_id: p.api_player_id, name: p.name || `Atleta ${p.api_player_id}` }))
      }
      if (!ok) return
      setAthletes(list); setLoading(false)
    })()
    return () => { ok = false }
  }, [uid])

  if (loading) return <Spinner />
  if (sel && uid) return <Workspace physioId={uid} athlete={sel} onBack={() => setSel(null)} />

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18, background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '22px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
        <div style={{ ...kicker, color: ACCENT }}>Il mio ufficio</div>
        <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.3, marginTop: 2 }}>Spazio clinico</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>Seleziona un atleta per gestire valutazioni, trattamenti ed esercizi.</div>
      </div>

      <div className="card">
        <div className="card-head"><div className="card-title">Atleti seguiti</div></div>
        {athletes.length === 0 ? (
          <Empty icon={<Icon name="users" size={30} strokeWidth={1.4} />}
            title="Nessun atleta collegato"
            hint="Vai in Collegamenti e inserisci il codice fornito da AUVI per collegarti a un atleta." />
        ) : (
          <div className="grid g2" style={{ gap: 10 }}>
            {athletes.map(a => (
              <button key={a.player_id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer' }} onClick={() => setSel(a)}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#111' }}>{(a.name || 'A').slice(0, 1)}</div>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700 }}>{a.name}</div><div className="faint" style={{ fontSize: 11.5 }}>Apri cartella clinica</div></div>
                <Icon name="chevron-right" size={16} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

type Tab = 'val' | 'trt' | 'exe'
const TABLE: Record<Tab, string> = { val: 'physio_assessments', trt: 'physio_treatments', exe: 'physio_exercises' }
const TABS: { k: Tab; l: string }[] = [{ k: 'val', l: 'Valutazioni' }, { k: 'trt', l: 'Trattamenti' }, { k: 'exe', l: 'Esercizi' }]

function Workspace({ physioId, athlete, onBack }: { physioId: string; athlete: Ath; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('val')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState<any | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from(TABLE[tab]).select('*')
      .eq('physio_id', physioId).eq('player_id', athlete.player_id)
      .order('created_at', { ascending: false })
    setRows(data || []); setLoading(false)
  }, [tab, physioId, athlete.player_id])

  useEffect(() => { load() }, [load])

  async function save(rec: any) {
    const payload = { ...rec, physio_id: physioId, player_id: athlete.player_id }
    if (rec.id) await supabase.from(TABLE[tab]).update(payload).eq('id', rec.id)
    else await supabase.from(TABLE[tab]).insert(payload)
    setEdit(null); load()
  }
  async function remove(id: string) { await supabase.from(TABLE[tab]).delete().eq('id', id); load() }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="flex gap" style={{ alignItems: 'center', gap: 12 }}>
        <button className="btn btn-sm" onClick={onBack}><Icon name="chevron-left" size={14} /> Atleti</button>
        <div><div style={{ ...kicker, color: ACCENT }}>Cartella clinica</div><div style={{ fontSize: 20, fontWeight: 900 }}>{athlete.name}</div></div>
      </div>

      <div className="flex gap" style={{ gap: 8, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.k} className={tab === t.k ? 'btn btn-primary btn-sm' : 'btn btn-sm'} onClick={() => setTab(t.k)}>{t.l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={() => setEdit({})}><Icon name="plus" size={14} /> Nuovo</button>
      </div>

      {loading ? <Spinner /> : rows.length === 0 ? (
        <Empty icon={<Icon name="clipboard" size={28} strokeWidth={1.4} />} title="Ancora nessun record" hint="Aggiungi il primo con «Nuovo»." />
      ) : (
        <div className="grid" style={{ gap: 10 }}>
          {rows.map(r => <RecordCard key={r.id} tab={tab} r={r} onEdit={() => setEdit(r)} onDel={() => remove(r.id)} />)}
        </div>
      )}

      {edit && <EditModal tab={tab} rec={edit} onClose={() => setEdit(null)} onSave={save} />}
    </div>
  )
}

function RecordCard({ tab, r, onEdit, onDel }: { tab: Tab; r: any; onEdit: () => void; onDel: () => void }) {
  const title = tab === 'exe' ? (r.name || 'Esercizio') : (r.date || '—')
  const sub = tab === 'val' ? (r.diagnosis || r.reason || '') : tab === 'trt' ? (r.techniques || '') : `${r.sets || '—'}×${r.reps || '—'} · ${r.frequency || ''}`
  return (
    <div className="card">
      <div className="flex between" style={{ alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{title}</div>
          {sub && <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>{sub}</div>}
          {tab === 'val' && (r.pain_scale != null) && <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>Dolore: {r.pain_scale}/10 · ROM: {r.rom || '—'} · Forza: {r.strength || '—'}</div>}
          {tab === 'trt' && <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>Durata: {r.duration || '—'} · Dolore: {r.pain_level != null ? r.pain_level + '/10' : '—'} · {r.progress || ''}</div>}
          {r.notes && <div style={{ fontSize: 13, marginTop: 6 }}>{r.notes}</div>}
          {tab === 'exe' && r.description && <div style={{ fontSize: 13, marginTop: 6 }}>{r.description}</div>}
        </div>
        <div className="flex gap" style={{ gap: 8, flex: '0 0 auto' }}>
          <button className="btn btn-sm" onClick={onEdit}>Modifica</button>
          <ConfirmButton onConfirm={onDel}>Elimina</ConfirmButton>
        </div>
      </div>
    </div>
  )
}

function EditModal({ tab, rec, onClose, onSave }: { tab: Tab; rec: any; onClose: () => void; onSave: (r: any) => void }) {
  const [f, setF] = useState<any>({ date: today(), status: 'assegnato', ...rec })
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))
  const I = (k: string, label: string, ph = '') => <Field label={label}><Input value={f[k] ?? ''} onChange={e => set(k, e.target.value)} placeholder={ph} /></Field>
  const N = (k: string, label: string) => <Field label={label}><Input type="number" value={f[k] ?? ''} onChange={e => set(k, e.target.value === '' ? null : Number(e.target.value))} /></Field>
  const A = (k: string, label: string, rows = 2) => <Field label={label}><Textarea rows={rows} value={f[k] ?? ''} onChange={e => set(k, e.target.value)} /></Field>
  const titles: Record<Tab, string> = { val: 'Valutazione', trt: 'Trattamento', exe: 'Esercizio' }

  return (
    <Modal title={(rec.id ? 'Modifica ' : 'Nuovo ') + titles[tab].toLowerCase()} onClose={onClose}
      footer={<div className="flex gap" style={{ justifyContent: 'flex-end', width: '100%' }}>
        <button className="btn" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={() => onSave(f)}><Icon name="check" size={14} /> Salva</button>
      </div>}>
      <div className="grid" style={{ gap: 10 }}>
        {tab === 'val' && (<>
          <div className="grid g2" style={{ gap: 10 }}>
            <Field label="Data"><Input type="date" value={f.date ?? ''} onChange={e => set('date', e.target.value)} /></Field>
            {I('reason', 'Motivo', 'Es. dolore ginocchio')}
            {N('pain_scale', 'Scala dolore (0-10)')}
            {I('rom', 'ROM', 'Range di movimento')}
            {I('strength', 'Forza')}
            {I('functional_tests', 'Test funzionali')}
          </div>
          {A('history', 'Anamnesi')}
          {I('diagnosis', 'Diagnosi')}
          {A('goals', 'Obiettivi')}
          {A('notes', 'Note')}
        </>)}
        {tab === 'trt' && (<>
          <div className="grid g2" style={{ gap: 10 }}>
            <Field label="Data"><Input type="date" value={f.date ?? ''} onChange={e => set('date', e.target.value)} /></Field>
            {I('duration', 'Durata', 'Es. 45 min')}
            {N('pain_level', 'Dolore (0-10)')}
            {I('progress', 'Progresso', 'Es. in miglioramento')}
          </div>
          {A('techniques', 'Tecniche')}
          {A('feedback', "Feedback dell'atleta")}
          {A('notes', 'Note')}
        </>)}
        {tab === 'exe' && (<>
          {I('name', 'Nome esercizio')}
          {A('description', 'Descrizione')}
          <div className="grid g2" style={{ gap: 10 }}>
            {I('sets', 'Serie')}
            {I('reps', 'Ripetizioni')}
            {I('rest', 'Recupero')}
            {I('frequency', 'Frequenza', 'Es. 3x/settimana')}
          </div>
          {A('progression', 'Progressione')}
          <Field label="Stato"><Select value={f.status ?? 'assegnato'} onChange={e => set('status', e.target.value)}>
            <option value="assegnato">Assegnato</option>
            <option value="in_corso">In corso</option>
            <option value="completato">Completato</option>
          </Select></Field>
        </>)}
      </div>
    </Modal>
  )
}
