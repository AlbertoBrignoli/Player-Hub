import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useLang } from '../lib/i18n'
import { fmtDate, daysUntil } from '../lib/format'
import Icon from './Icon'
import type { TaxItem } from '../modules/LegalTax'

/* Richiesta di documenti (crm_tax_items, kind 'richiesta') letta come un task:
   quando è stata fatta e da chi → entro quando → se e quando è stata consegnata.
   Usata in Fisco e legale e nella pagina Task dell'atleta. */

/** nome di chi ha fatto la richiesta: il commercialista dal suo profilo, altrimenti il team */
export function useRequesters(items: Pick<TaxItem, 'created_by'>[]) {
  const [names, setNames] = useState<Record<string, string>>({})
  const key = [...new Set(items.map(i => i.created_by).filter(Boolean))].sort().join(',')
  useEffect(() => {
    if (!key) return
    supabase.from('crm_tax_profile').select('advisor_id, name').in('advisor_id', key.split(',')).then(({ data }) => {
      const m: Record<string, string> = {}
      ;((data as { advisor_id: string; name: string | null }[]) || []).forEach(x => { if (x.name) m[x.advisor_id] = x.name })
      setNames(m)
    })
  }, [key])
  return names
}

export function RequestSteps({ item, who }: { item: TaxItem; who?: string | null }) {
  const { t } = useLang()
  const done = item.status !== 'aperto'
  const d = daysUntil(item.due_date)
  const late = !done && d != null && d < 0
  const dueText = !item.due_date ? t('Nessuna scadenza')
    : done ? fmtDate(item.due_date)
    : d! < 0 ? t('Scaduta il {d}').replace('{d}', fmtDate(item.due_date))
    : d === 0 ? t('Oggi') : d === 1 ? t('Domani')
    : `${fmtDate(item.due_date)} · ${t('fra {n} giorni').replace('{n}', String(d))}`
  const dueColor = late ? 'var(--red)' : !done && d != null && d <= 3 ? '#8A6D00' : undefined
  return (
    <div className="dr-steps">
      <style>{DR_CSS}</style>
      <div className="dr-step on">
        <span className="dr-dot"><Icon name="send" size={11} /></span>
        <span className="dr-k">{t('Richiesta')}</span>
        <span className="dr-v">{fmtDate(item.created_at)}</span>
        {who && <span className="dr-s">{t('da {who}').replace('{who}', who)}</span>}
      </div>
      <div className={'dr-step' + (late ? ' late' : ' on')}>
        <span className="dr-dot"><Icon name="clock" size={11} /></span>
        <span className="dr-k">{t('Scadenza')}</span>
        <span className="dr-v" style={{ color: dueColor }}>{dueText}</span>
      </div>
      <div className={'dr-step' + (done ? ' on ok' : '')}>
        <span className="dr-dot"><Icon name="check" size={11} /></span>
        <span className="dr-k">{t('Consegna')}</span>
        <span className="dr-v">{done ? fmtDate(item.completed_at || item.updated_at) : t('Da consegnare')}</span>
      </div>
    </div>
  )
}

const DR_CSS = `
.dr-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 8px; }
.dr-step { display: flex; flex-direction: column; gap: 1px; padding: 8px 10px; border-radius: 10px; background: var(--surface-2, rgba(0,0,0,.04)); min-width: 0; }
.dr-dot { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: var(--border); color: var(--text-dim); margin-bottom: 3px; }
.dr-step.on .dr-dot { background: var(--ink); color: var(--yellow); }
.dr-step.ok .dr-dot { background: #12A150; color: #fff; }
.dr-step.late .dr-dot { background: var(--red); color: #fff; }
.dr-k { font-size: 11px; font-weight: 800; letter-spacing: .7px; text-transform: uppercase; color: var(--text-faint); }
.dr-v { font-size: 12.5px; font-weight: 700; color: var(--text); overflow-wrap: anywhere; }
.dr-s { font-size: 11px; color: var(--text-dim); overflow-wrap: anywhere; }
`
