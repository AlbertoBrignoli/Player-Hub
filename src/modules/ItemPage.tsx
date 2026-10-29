import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { useRouteParam, goto } from '../lib/route'
import { fmtDate, fmtDateTime, fmtMoney } from '../lib/format'
import { Spinner, Empty } from '../components/ui'
import Icon from '../components/Icon'
import { ItemThread, useItemPeople, type ItemKind } from '../components/ItemPeople'

// Una voce condivisa aperta da una notifica (item?k=<tipo>&id=<id>): la vede chi la segue
// e chi è stato coinvolto. Mostra i dati essenziali, le persone coinvolte e la conversazione.
const AREA: Record<ItemKind, { table: string; label: string; route: (id: string) => string; owners: string[] }> = {
  wealth: { table: 'crm_wealth_items', label: 'Patrimonio', route: id => `wealth?item=${id}`, owners: ['admin', 'player', 'wealth'] },
  tax: { table: 'crm_tax_items', label: 'Fisco e legale', route: () => 'legaltax', owners: ['admin', 'player', 'commercialista', 'agente'] },
  insurance: { table: 'crm_insurance_policies', label: 'Polizze', route: () => 'insurance', owners: ['admin', 'player', 'assicuratore', 'agente'] },
  contract: { table: 'crm_contracts', label: 'Contratti', route: () => 'contracts', owners: ['admin', 'player', 'agente'] },
  event: { table: 'crm_events', label: 'Agenda', route: id => `agenda?event=${id}`, owners: ['admin', 'player', 'agente', 'preparatore', 'assicuratore', 'commercialista', 'fisioterapista', 'nutrizionista', 'wealth'] },
}

export default function ItemPage() {
  const { t: tr } = useLang()
  const { role } = useAuth()
  const { setAthleteId } = useAthlete()
  const k = (useRouteParam('k') || '') as ItemKind
  const id = useRouteParam('id') || ''
  const area = AREA[k]
  const [row, setRow] = useState<Record<string, any> | null | undefined>(undefined)
  const { people, reload } = useItemPeople(k, area && id ? [id] : [])

  useEffect(() => {
    if (!area || !id) { setRow(null); return }
    supabase.from(area.table).select('*').eq('id', id).maybeSingle().then(({ data }) => {
      setRow((data as any) || null)
      if ((data as any)?.player_id) setAthleteId((data as any).player_id)
    })
  }, [k, id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (row === undefined) return <Spinner />
  if (!row || !area) return <Empty icon={<Icon name="lock" size={26} />} title={tr('Voce non disponibile')}
    hint={tr('Non sei più coinvolto in questa voce, oppure è stata eliminata.')} />

  const due = row.due_date || row.expiry_date || row.end_date
  const facts = [
    k === 'event' && row.start_at ? fmtDateTime(row.start_at) : null,
    due && k !== 'event' ? tr('Scadenza') + ': ' + fmtDate(due) : null,
    row.amount ? fmtMoney(row.amount) : null,
    row.company || row.counterpart || row.location || null,
  ].filter(Boolean)
  const files: { name: string; path: string }[] = Array.isArray(row.attachments) ? row.attachments.filter((a: any) => a?.path) : []

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 820 }}>
      <div className="card">
        <div className="flex between" style={{ alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800, color: '#1F4E79' }}>{tr(area.label)}</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 2 }}>{row.title || '—'}</div>
            {facts.length > 0 && <div className="faint" style={{ fontSize: 12.5, marginTop: 3 }}>{facts.join(' · ')}</div>}
          </div>
          {role && area.owners.includes(role) && (
            <button className="btn btn-sm" onClick={() => goto(area.route(id))}>
              {tr("Apri nell'area")} <Icon name="send" size={12} />
            </button>
          )}
        </div>
        {(row.description || row.notes) && <div style={{ fontSize: 13.5, marginTop: 12, whiteSpace: 'pre-wrap' }}>{row.description || row.notes}</div>}
        {files.length > 0 && (
          <div className="flex gap" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            {files.map(f => <FileBtn key={f.path} kind={k} f={f} />)}
          </div>
        )}
      </div>
      <div className="card">
        <ItemThread kind={k} itemId={id} playerId={row.player_id} people={people[id] || []} onPeople={reload} />
      </div>
    </div>
  )
}

const BUCKET: Partial<Record<ItemKind, string>> = { wealth: 'wealth-docs', tax: 'tax-docs', insurance: 'insurance-docs', event: 'crm-documents' }
function FileBtn({ kind, f }: { kind: ItemKind; f: { name: string; path: string } }) {
  const { t: tr } = useLang()
  async function open() {
    const b = BUCKET[kind]; if (!b) return
    const w = window.open('', '_blank')
    const { data } = await supabase.storage.from(b).createSignedUrl(f.path, 300)
    if (data?.signedUrl && w) w.location.href = data.signedUrl
    else w?.close()
  }
  return <button className="btn btn-sm" onClick={open} title={tr('Apri')}><Icon name="download" size={13} /> {f.name}</button>
}
