import React, { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase, PLAYER_NAME } from '../lib/supabase'
import { initials } from '../lib/format'
import NotificationBell from './NotificationBell'
import Toaster from './Toaster'
import Icon from './Icon'
import { Modal, Field, Input } from './ui'

export interface NavDef { key: string; label: string; icon: string; adminOnly?: boolean; roles?: string[] }

export const NAV: { group: string; items: NavDef[] }[] = [
  { group: 'Panoramica', items: [
    { key: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { key: 'performance', label: 'Performance', icon: 'activity' },
    { key: 'editorial', label: 'Cal. Editoriale', icon: 'calendar' },
  ]},
  { group: 'Gestione', items: [
    { key: 'contracts', label: 'Contratti', icon: 'briefcase' },
    { key: 'documents', label: 'Documenti', icon: 'archive' },
    { key: 'sponsors', label: 'Sponsor', icon: 'award' },
  ]},
  { group: 'Contenuti', items: [
    { key: 'media', label: 'Media', icon: 'image' },
  ]},
  { group: 'Operatività', items: [
    { key: 'agenda', label: 'Agenda', icon: 'clock' },
    { key: 'tasks', label: 'Task', icon: 'check-square' },
    { key: 'messages', label: 'Messaggi', icon: 'message' },
  ]},
  { group: 'Sistema', items: [
    { key: 'settings', label: 'Impostazioni', icon: 'sliders' },
  ]},
]

const TITLES: Record<string, { t: string; s: string }> = {
  dashboard: { t: 'Dashboard', s: 'Quadro generale della gestione' },
  performance: { t: 'Performance', s: 'Statistiche, partite e rendimento' },
  contracts: { t: 'Contratti', s: 'Accordi sportivi e scadenze' },
  documents: { t: 'Documenti', s: 'Archivio file riservato' },
  editorial: { t: 'Calendario Editoriale', s: 'Partite, copy e grafiche pronte da pubblicare' },
  media: { t: 'Media', s: 'Foto, selezioni e grafiche del team' },
  sponsors: { t: 'Sponsor & Commerciale', s: 'Accordi e deliverable' },
  agenda: { t: 'Agenda', s: 'Impegni e appuntamenti' },
  tasks: { t: 'Task', s: 'Attività condivise' },
  messages: { t: 'Messaggi', s: 'Comunicazione diretta' },
  settings: { t: 'Impostazioni', s: 'Password, accessi e configurazione' },
}

export default function Shell({ route, setRoute, right, children }: {
  route: string; setRoute: (r: string) => void; right?: React.ReactNode; children: React.ReactNode
}) {
  const { profile, isAdmin, role, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const title = TITLES[route] || { t: '', s: '' }

  return (
    <div className="app">
      <div className={`scrim ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <img className="brand-logo-img" src="/icons/icon-192.png" alt="AUVI" />
          <div>
            <div className="brand-name">Player Hub</div>
            <div className="brand-sub">{PLAYER_NAME}</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map(g => {
            const items = g.items.filter(i => (!i.adminOnly || isAdmin) && (!i.roles || (role && i.roles.includes(role))))
            if (!items.length) return null
            return (
              <React.Fragment key={g.group}>
                <div className="nav-label">{g.group}</div>
                {items.map(i => (
                  <button key={i.key} className={`nav-item ${route === i.key ? 'active' : ''}`}
                    onClick={() => { setRoute(i.key); setOpen(false) }}>
                    <span className="nav-ico"><Icon name={i.icon} size={17} /></span>{i.label}
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
              <div className="user-role">{role === 'admin' ? 'AUVI · Advisor' : role === 'creator' ? 'Team · Creator' : 'Giocatore'}</div>
            </div>
            <button className="btn-ghost" style={{ marginLeft: 'auto', padding: 6, color: 'var(--text-dim)' }} title="Imposta password" onClick={() => setPwOpen(true)}><Icon name="key" size={16} /></button>
            <button className="btn-ghost" style={{ padding: 6, color: 'var(--text-dim)' }} title="Esci" onClick={signOut}><Icon name="logout" size={16} /></button>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="flex gap">
            <button className="menu-btn" onClick={() => setOpen(true)}><Icon name="menu" size={17} /></button>
            <div>
              <div className="page-title">{title.t}</div>
              <div className="page-sub">{title.s}</div>
            </div>
          </div>
          <div className="flex gap" style={{ alignItems: 'center' }}>{right}<NotificationBell goto={setRoute} /></div>
        </div>
        <div className="content">{children}</div>
      </div>

      {/* Tab bar mobile (iOS): pollice, zero frizioni. "Altro" apre il drawer completo. */}
      <nav className="tabbar">
        {[
          { key: 'dashboard', label: 'Home', icon: 'home' },
          { key: 'editorial', label: 'Calendario', icon: 'calendar' },
          { key: 'media', label: 'Media', icon: 'image' },
          { key: 'messages', label: 'Chat', icon: 'message' },
        ].map(t => (
          <button key={t.key} className={`tab-item ${route === t.key ? 'active' : ''}`}
            onClick={() => { setRoute(t.key); setOpen(false) }}>
            <span className="tab-ico"><Icon name={t.icon} size={21} strokeWidth={1.7} /></span>
            <span className="tab-lbl">{t.label}</span>
          </button>
        ))}
        <button className={`tab-item ${open ? 'active' : ''}`} onClick={() => setOpen(true)}>
          <span className="tab-ico"><Icon name="menu" size={21} strokeWidth={1.7} /></span>
          <span className="tab-lbl">Altro</span>
        </button>
      </nav>

      {pwOpen && <PasswordModal onClose={() => setPwOpen(false)} />}
      <Toaster />
    </div>
  )
}

function PasswordModal({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function save() {
    if (pw.length < 8) { setMsg({ ok: false, text: 'Minimo 8 caratteri.' }); return }
    if (pw !== pw2) { setMsg({ ok: false, text: 'Le due password non coincidono.' }); return }
    setBusy(true); setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setMsg({ ok: false, text: error.message })
    else setMsg({ ok: true, text: 'Password impostata! Dal prossimo accesso entri con email e password.' })
  }

  return (
    <Modal title="Imposta la tua password" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Chiudi</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Salvo…' : 'Salva password'}</button></>}>
      <div className="grid" style={{ gap: 12 }}>
        <div className="faint" style={{ fontSize: 12.5 }}>
          Con la password entri direttamente da email + password, senza aspettare il link via email.
        </div>
        <Field label="Nuova password"><Input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Minimo 8 caratteri" autoFocus /></Field>
        <Field label="Ripeti password"><Input type="password" value={pw2} onChange={e => setPw2(e.target.value)} /></Field>
        {msg && <div className={msg.ok ? 'msg-ok' : 'msg-err'}>{msg.text}</div>}
      </div>
    </Modal>
  )
}
