import React, { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { PLAYER_NAME } from '../lib/supabase'
import { initials } from '../lib/format'

export interface NavDef { key: string; label: string; icon: string; adminOnly?: boolean }

export const NAV: { group: string; items: NavDef[] }[] = [
  { group: 'Panoramica', items: [
    { key: 'dashboard', label: 'Dashboard', icon: '◎' },
    { key: 'performance', label: 'Performance', icon: '⚽' },
  ]},
  { group: 'Gestione', items: [
    { key: 'contracts', label: 'Contratti', icon: '📄' },
    { key: 'payments', label: 'Compensi', icon: '💶' },
    { key: 'documents', label: 'Documenti', icon: '🗂' },
    { key: 'sponsors', label: 'Sponsor', icon: '🤝' },
  ]},
  { group: 'Operatività', items: [
    { key: 'agenda', label: 'Agenda', icon: '🗓' },
    { key: 'tasks', label: 'Task', icon: '✓' },
    { key: 'messages', label: 'Messaggi', icon: '💬' },
  ]},
  { group: 'Sistema', items: [
    { key: 'settings', label: 'Impostazioni', icon: '⚙', adminOnly: true },
  ]},
]

const TITLES: Record<string, { t: string; s: string }> = {
  dashboard: { t: 'Dashboard', s: 'Quadro generale della gestione' },
  performance: { t: 'Performance', s: 'Statistiche, partite e rendimento' },
  contracts: { t: 'Contratti', s: 'Accordi sportivi e scadenze' },
  payments: { t: 'Compensi & Pagamenti', s: 'Entrate, uscite e scadenzario' },
  documents: { t: 'Documenti', s: 'Archivio file riservato' },
  sponsors: { t: 'Sponsor & Commerciale', s: 'Accordi e deliverable' },
  agenda: { t: 'Agenda', s: 'Impegni e appuntamenti' },
  tasks: { t: 'Task', s: 'Attività condivise' },
  messages: { t: 'Messaggi', s: 'Comunicazione diretta' },
  settings: { t: 'Impostazioni', s: 'Accessi e configurazione' },
}

export default function Shell({ route, setRoute, right, children }: {
  route: string; setRoute: (r: string) => void; right?: React.ReactNode; children: React.ReactNode
}) {
  const { profile, isAdmin, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const title = TITLES[route] || { t: '', s: '' }

  return (
    <div className="app">
      <div className={`scrim ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-logo">A</div>
          <div>
            <div className="brand-name">Player Hub</div>
            <div className="brand-sub">{PLAYER_NAME}</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map(g => {
            const items = g.items.filter(i => !i.adminOnly || isAdmin)
            if (!items.length) return null
            return (
              <React.Fragment key={g.group}>
                <div className="nav-label">{g.group}</div>
                {items.map(i => (
                  <button key={i.key} className={`nav-item ${route === i.key ? 'active' : ''}`}
                    onClick={() => { setRoute(i.key); setOpen(false) }}>
                    <span className="nav-ico">{i.icon}</span>{i.label}
                  </button>
                ))}
              </React.Fragment>
            )
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="avatar">{initials(profile?.full_name || profile?.email)}</div>
            <div className="user-meta">
              <div className="user-name">{profile?.full_name || profile?.email}</div>
              <div className="user-role">{isAdmin ? 'AUVI · Admin' : 'Giocatore'}</div>
            </div>
            <button className="btn-ghost" style={{ marginLeft: 'auto', padding: 6 }} title="Esci" onClick={signOut}>⎋</button>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="flex gap">
            <button className="menu-btn" onClick={() => setOpen(true)}>☰</button>
            <div>
              <div className="page-title">{title.t}</div>
              <div className="page-sub">{title.s}</div>
            </div>
          </div>
          <div className="flex gap">{right}</div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  )
}
