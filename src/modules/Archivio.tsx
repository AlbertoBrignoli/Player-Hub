import { useState } from 'react'
import Contracts from './Contracts'
import Documents from './Documents'
import Icon from '../components/Icon'

// Archivio unico: Contratti e Documenti erano due voci separate ma vivono
// nello stesso posto. Un solo ingresso, due schede.
export default function Archivio() {
  const [tab, setTab] = useState<'contracts' | 'documents'>('contracts')
  const tabs: { k: 'contracts' | 'documents'; label: string; icon: string }[] = [
    { k: 'contracts', label: 'Contratti', icon: 'briefcase' },
    { k: 'documents', label: 'Documenti', icon: 'archive' },
  ]
  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="flex gap" style={{ gap: 6, background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 999, padding: 4, alignSelf: 'start' }}>
        {tabs.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className="flex gap"
            style={{ alignItems: 'center', gap: 7, cursor: 'pointer', border: 'none', borderRadius: 999,
              padding: '8px 16px', fontSize: 13.5, fontWeight: 700,
              background: tab === t.k ? 'var(--text)' : 'transparent',
              color: tab === t.k ? 'var(--bg, #0b0b0e)' : 'var(--text-dim)' }}>
            <Icon name={t.icon} size={15} /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'contracts' ? <Contracts /> : <Documents />}
    </div>
  )
}
