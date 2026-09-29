import React, { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { supabase } from '../lib/supabase'
import { initials } from '../lib/format'
import NotificationBell from './NotificationBell'
import { useLang, LangToggle } from '../lib/i18n'
import Toaster from './Toaster'
import PushNudge from './PushNudge'
import Icon from './Icon'
import { Modal, Field, Input, Tabs } from './ui'

// Schermate home dei vari ruoli: qui compare l'invito ad attivare le notifiche.
const HOME_ROUTES = ['dashboard', 'brandhome', 'agent-home', 'insurer-home', 'tax-home', 'physio-home']

export const APP_VERSION = 'v5.6'

export interface NavDef {
  key: string; label: string; icon: string; adminOnly?: boolean; roles?: string[]
  /** sezione con schede: le route elencate sono le schede della stessa voce di menu */
  tabs?: { key: string; label: string; roles?: string[] }[]
}

// Menu principale (admin / player / creator): 5 gruppi, niente gruppi da una voce,
// le azioni quotidiane (Messaggi, Agenda, Task) subito dopo i contenuti.
export const NAV: { group: string; items: NavDef[] }[] = [
  { group: 'Principale', items: [
    { key: 'dashboard', label: 'Home', icon: 'home' },
    { key: 'editorial', label: 'Calendario', icon: 'calendar', tabs: [
      { key: 'editorial', label: 'Editoriale' },
      { key: 'agenda', label: 'Impegni' },
      { key: 'tasks', label: 'Task' },
    ]},
    { key: 'media', label: 'Media', icon: 'image' },
    { key: 'messages', label: 'Messaggi', icon: 'message' },
    { key: 'performance', label: 'Atleta', icon: 'activity', tabs: [
      { key: 'performance', label: 'Performance' },
      { key: 'fitness', label: 'Preparazione' },
      { key: 'profile', label: 'Profilo' },
    ]},
    { key: 'commercial', label: 'Business', icon: 'briefcase', tabs: [
      { key: 'commercial', label: 'Profilo commerciale', roles: ['admin', 'player', 'creator'] },
      { key: 'sponsors', label: 'Sponsor' },
      { key: 'contracts', label: 'Contratti' },
      { key: 'documents', label: 'Documenti' },
    ]},
  ]},
  { group: 'Altro', items: [
    { key: 'services', label: 'Servizi AUVI', icon: 'layers' },
    { key: 'my-team', label: 'Il mio team', icon: 'users' },
    { key: 'access-requests', label: 'Collegamenti', icon: 'key' },
  ]},
]

// Menu dedicato ai brand: solo media kit, scheda e chat.
export const BRAND_NAV: { group: string; items: NavDef[] }[] = [
  { group: 'Partnership', items: [
    { key: 'brandhome', label: 'Home', icon: 'grid' },
    { key: 'mediakit', label: 'Media Kit', icon: 'activity' },
    { key: 'campaigns', label: 'Campagne', icon: 'image' },
    { key: 'talent', label: 'Ricerca talent', icon: 'star' },
    { key: 'brandcard', label: 'La mia scheda', icon: 'award' },
    { key: 'messages', label: 'Messaggi', icon: 'message' },
  ]},
]

// Menu del preparatore sul telaio unico dei professionisti.
// Stessa impostazione del fisioterapista: cambia solo il "principio" del ruolo
// (qui gli strumenti di preparazione: Area Fitness, Performance, Agenda).
export const COACH_NAV: { group: string; items: NavDef[] }[] = [
  { group: 'Principale', items: [
    { key: 'dashboard', label: 'Home', icon: 'home' },
    { key: 'fitness', label: 'Atleta', icon: 'dumbbell', tabs: [
      { key: 'fitness', label: 'Area Fitness' },
      { key: 'performance', label: 'Performance' },
    ]},
    { key: 'agenda', label: 'Agenda', icon: 'calendar' },
    { key: 'messages', label: 'Messaggi', icon: 'message' },
    { key: 'coach-office', label: 'Il mio ufficio', icon: 'briefcase' },
  ]},
  { group: 'Altro', items: [
    { key: 'coach-profile', label: 'Il mio profilo', icon: 'user' },
    { key: 'my-team', label: 'Il mio team', icon: 'users' },
    { key: 'access-requests', label: 'Collegamenti', icon: 'key' },
  ]},
]

// Menu dell'agente/procuratore: accesso completo a tutto ciò che riguarda il suo atleta.
// Fuori solo le Impostazioni di sistema (whitelist accessi) e l'ufficio privato del preparatore.
export const AGENT_NAV: { group: string; items: NavDef[] }[] = [
  { group: 'Principale', items: [
    { key: 'agent-home', label: 'Home', icon: 'home' },
    { key: 'dashboard', label: 'Atleta', icon: 'activity', tabs: [
      { key: 'dashboard', label: 'Panoramica' },
      { key: 'performance', label: 'Performance' },
      { key: 'fitness', label: 'Preparazione' },
      { key: 'profile', label: 'Scheda' },
    ]},
    { key: 'editorial', label: 'Calendario', icon: 'calendar', tabs: [
      { key: 'editorial', label: 'Editoriale' },
      { key: 'agenda', label: 'Impegni' },
      { key: 'tasks', label: 'Task' },
    ]},
    { key: 'media', label: 'Media', icon: 'image' },
    { key: 'messages', label: 'Messaggi', icon: 'message' },
    { key: 'commercial', label: 'Business', icon: 'briefcase', tabs: [
      { key: 'commercial', label: 'Profilo commerciale' },
      { key: 'sponsors', label: 'Sponsor' },
      { key: 'contracts', label: 'Contratti' },
      { key: 'documents', label: 'Documenti' },
    ]},
  ]},
  { group: 'Altro', items: [
    { key: 'agent-profile', label: 'Il mio profilo', icon: 'user' },
    { key: 'my-team', label: 'Il mio team', icon: 'users' },
    { key: 'access-requests', label: 'Collegamenti', icon: 'key' },
  ]},
]

// Menu dell'assicuratore: le sue polizze, i suoi atleti, la sua scheda.
export const INSURER_NAV: { group: string; items: NavDef[] }[] = [
  { group: 'Assicurazioni', items: [
    { key: 'insurer-home', label: 'Home', icon: 'grid' },
    { key: 'insurance', label: 'Polizze', icon: 'lock' },
    { key: 'insurer-profile', label: 'Il mio profilo', icon: 'user' },
    { key: 'access-requests', label: 'Collegamenti', icon: 'key' },
  ]},
  { group: 'Atleta', items: [
    { key: 'my-team', label: 'Il mio team', icon: 'users' },
    { key: 'documents', label: 'Documenti', icon: 'archive' },
    { key: 'agenda', label: 'Scadenze', icon: 'clock' },
    { key: 'messages', label: 'Messaggi', icon: 'message' },
  ]},
]

// Menu del commercialista: area fiscale, atleti seguiti, scheda personale.
export const TAX_NAV: { group: string; items: NavDef[] }[] = [
  { group: 'Legal & Tax', items: [
    { key: 'tax-home', label: 'Home', icon: 'grid' },
    { key: 'legaltax', label: 'Fisco e legale', icon: 'briefcase' },
    { key: 'services', label: 'Richieste servizi', icon: 'star' },
    { key: 'tax-profile', label: 'Il mio profilo', icon: 'user' },
    { key: 'access-requests', label: 'Collegamenti', icon: 'key' },
  ]},
  { group: 'Atleta', items: [
    { key: 'my-team', label: 'Il mio team', icon: 'users' },
    { key: 'documents', label: 'Documenti', icon: 'archive' },
    { key: 'agenda', label: 'Scadenze', icon: 'clock' },
    { key: 'messages', label: 'Messaggi', icon: 'message' },
  ]},
]

// Menu del fisioterapista: profilo, atleti seguiti, chat.
export const PHYSIO_NAV: { group: string; items: NavDef[] }[] = [
  { group: 'Fisioterapia', items: [
    { key: 'physio-home', label: 'Home', icon: 'grid' },
    { key: 'physio-profile', label: 'Il mio profilo', icon: 'user' },
    { key: 'physio-office', label: 'Il mio ufficio', icon: 'briefcase' },
    { key: 'access-requests', label: 'Collegamenti', icon: 'key' },
  ]},
  { group: 'Atleta', items: [
    { key: 'my-team', label: 'Il mio team', icon: 'users' },
    { key: 'messages', label: 'Messaggi', icon: 'message' },
  ]},
]

const TITLES: Record<string, { t: string; s: string }> = {
  dashboard: { t: 'Home', s: 'Quadro generale della gestione' },
  fitness: { t: 'Preparazione', s: 'AUVI Performance · preparazione atletica' },
  'coach-profile': { t: 'Profilo Preparatore', s: 'Il tuo profilo professionale' },
  profile: { t: 'Profilo', s: 'Spedizioni, equipaggiamento e contatti club' },
  performance: { t: 'Performance', s: 'Statistiche, partite e rendimento' },
  contracts: { t: 'Contratti', s: 'Accordi sportivi e scadenze' },
  documents: { t: 'Documenti', s: 'Archivio file riservato' },
  editorial: { t: 'Calendario', s: 'Partite, copy e grafiche pronte da pubblicare' },
  media: { t: 'Media', s: 'Foto, selezioni e grafiche del team' },
  sponsors: { t: 'Sponsor & Commerciale', s: 'Accordi e deliverable' },
  commercial: { t: 'Commercial Profile', s: 'Misura il tuo valore, scopri i brand compatibili, costruisci opportunità' },
  agenda: { t: 'Agenda', s: 'Extra campo · impegni, prenotazioni, call, viaggi' },
  tasks: { t: 'Task', s: 'Attività condivise' },
  messages: { t: 'Messaggi', s: 'Comunicazione diretta' },
  settings: { t: 'Impostazioni', s: 'Password, accessi e configurazione' },
  brandhome: { t: 'Home', s: 'La tua scheda e gli atleti in partnership' },
  'coach-office': { t: 'Il mio ufficio', s: 'Agenda personale, clienti e cassa · area privata' },
  'agent-home': { t: 'Home', s: 'La tua scheda e i tuoi assistiti' },
  'insurer-home': { t: 'Home', s: 'La tua scheda e gli atleti seguiti' },
  'access-requests': { t: 'Collegamenti', s: 'Richieste di accesso agli atleti' },
  'insurer-profile': { t: 'Il mio profilo', s: 'Contatti e agenzia' },
  insurance: { t: 'Insurance', s: 'Polizze, documenti e scadenze' },
  legaltax: { t: 'Legal & Tax', s: 'Pagamenti, documenti e richieste' },
  services: { t: 'Servizi AUVI', s: 'Servizi e partner a tua disposizione' },
  'my-team': { t: 'Il mio team', s: 'Il tuo team di lavoro' },
  archivio: { t: 'Contratti e Documenti', s: 'Accordi, scadenze e archivio file riservato' },
  'tax-home': { t: 'Home', s: 'La tua scheda e gli atleti seguiti' },
  'tax-profile': { t: 'Il mio profilo', s: 'Contatti e studio' },
  'physio-home': { t: 'Home', s: 'La tua scheda e gli atleti seguiti' },
  'physio-profile': { t: 'Il mio profilo', s: 'Anagrafica, contatti e biografia' },
  'physio-office': { t: 'Il mio ufficio', s: 'Atleti seguiti e spazio clinico' },
  'agent-profile': { t: 'Il mio profilo', s: 'Contatti personali e agenzia' },
  mediakit: { t: 'Media Kit', s: "I numeri dell'atleta" },
  campaigns: { t: 'Campagne', s: 'Proponi contenuti e carica lo shooting' },
  brandcard: { t: 'La mia scheda', s: 'Dati e referente del brand' },
  talent: { t: 'Ricerca talent', s: 'Trova gli atleti del roster più in linea con il tuo brand' },
}

export default function Shell({ route, setRoute, right, children }: {
  route: string; setRoute: (r: string) => void; right?: React.ReactNode; children: React.ReactNode
}) {
  const { profile, isAdmin, isBrand, role, signOut } = useAuth()
  const { t: tr } = useLang()
  const { athletes, athleteId, setAthleteId, canSwitch } = useAthlete()
  const [open, setOpen] = useState(false)
  const baseTitle = TITLES[route] || { t: '', s: '' }
  const athleteName = athletes.find(a => a.api_player_id === athleteId)?.name
  const title0 = route === 'mediakit' && athleteName
    ? { t: baseTitle.t, s: `I numeri di ${athleteName}` }
    : baseTitle
  const isCoach = role === 'preparatore'
  const isAgent = role === 'agente'
  const isInsurer = role === 'assicuratore'
  const isTax = role === 'commercialista'
  const isPhysio = role === 'fisioterapista'

  // Profili in cui questo utente può entrare (es. brand / procuratore).
  // Il selettore compare solo se ne ha più di uno.
  const [myRoles, setMyRoles] = useState<{ role: string; label: string | null }[]>([])
  useEffect(() => {
    if (!profile?.id) return
    supabase.from('crm_user_roles').select('role, label')
      .then(({ data }) => {
        // un ruolo può comparire più volte (es. una riga per atleta): nel menu basta una voce
        const seen = new Set<string>()
        setMyRoles(((data as any[]) || []).filter(r => !seen.has(r.role) && !!seen.add(r.role)))
      })
  }, [profile?.id])

  // Con più profili sullo stesso account, full_name resta quello del ruolo con cui
  // è stato creato: per l'agente si usa il nome del profilo procuratore.
  const [agentName, setAgentName] = useState<string | null>(null)
  useEffect(() => {
    if (role !== 'agente' || !profile?.id) { setAgentName(null); return }
    supabase.from('crm_agent_profile').select('name').eq('agent_id', profile.id).maybeSingle()
      .then(({ data }) => setAgentName((data as any)?.name || null))
  }, [role, profile?.id])

  async function switchRole(next: string) {
    if (next === role) return
    const { error } = await supabase.rpc('crm_switch_role', { p_role: next })
    if (error) { alert(error.message); return }
    window.location.reload()
  }
  const nav = isBrand ? BRAND_NAV : isCoach ? COACH_NAV : isAgent ? AGENT_NAV : isInsurer ? INSURER_NAV : isTax ? TAX_NAV : isPhysio ? PHYSIO_NAV : NAV

  // Sezioni con schede: una voce di menu raggruppa più schermate (es. Calendario =
  // Editoriale · Impegni · Task). La voce resta attiva su tutte le sue schede e,
  // quando la riapri, torna all'ultima scheda che stavi guardando.
  const visibleItem = (i: NavDef) => (!i.adminOnly || isAdmin) && (!i.roles || (!!role && i.roles.includes(role)))
  const tabsOf = (i: NavDef) => (i.tabs || []).filter(t => !t.roles || (!!role && t.roles.includes(role)))
  const allItems = nav.flatMap(g => g.items).filter(visibleItem)
  const hub = allItems.find(i => i.key === route || tabsOf(i).some(t => t.key === route))
  const hubTabs = hub ? tabsOf(hub) : []
  useEffect(() => {
    if (hub && hubTabs.some(t => t.key === route)) {
      try { sessionStorage.setItem('hub:' + hub.key, route) } catch { /* modalità privata */ }
    }
  }, [route]) // eslint-disable-line react-hooks/exhaustive-deps
  function openItem(i: NavDef) {
    const tabs = tabsOf(i)
    let target = tabs.length ? tabs[0].key : i.key
    try {
      const last = sessionStorage.getItem('hub:' + i.key)
      if (last && tabs.some(t => t.key === last)) target = last
    } catch { /* modalità privata */ }
    setRoute(target)
    setOpen(false)
  }
  const isActiveItem = (key: string) => hub?.key === key

  // Voci della barra in basso (telefono). Nel menu "Altro" su telefono non si ripetono.
  const tabbarItems: { key: string; label: string; icon: string }[] = (isBrand
          ? [
              { key: 'brandhome', label: 'Home', icon: 'grid' },
              { key: 'mediakit', label: 'Numeri', icon: 'activity' },
              { key: 'campaigns', label: 'Campagne', icon: 'image' },
              { key: 'messages', label: 'Chat', icon: 'message' },
            ]
          : isPhysio
          ? [
              { key: 'physio-home', label: 'Home', icon: 'grid' },
              { key: 'physio-profile', label: 'Profilo', icon: 'user' },
              { key: 'my-team', label: 'Team', icon: 'users' },
              { key: 'messages', label: 'Chat', icon: 'message' },
            ]
          : isTax
          ? [
              { key: 'tax-home', label: 'Home', icon: 'grid' },
              { key: 'legaltax', label: 'Fisco', icon: 'briefcase' },
              { key: 'agenda', label: 'Scadenze', icon: 'clock' },
              { key: 'messages', label: 'Chat', icon: 'message' },
            ]
          : isInsurer
          ? [
              { key: 'insurer-home', label: 'Home', icon: 'grid' },
              { key: 'insurance', label: 'Polizze', icon: 'lock' },
              { key: 'agenda', label: 'Scadenze', icon: 'clock' },
              { key: 'messages', label: 'Chat', icon: 'message' },
            ]
          : isAgent
          ? [
              { key: 'agent-home', label: 'Home', icon: 'home' },
              { key: 'dashboard', label: 'Atleta', icon: 'activity' },
              { key: 'editorial', label: 'Calendario', icon: 'calendar' },
              { key: 'messages', label: 'Chat', icon: 'message' },
            ]
          : isCoach
          ? [
              { key: 'dashboard', label: 'Home', icon: 'grid' },
              { key: 'fitness', label: 'Atleta', icon: 'dumbbell' },
              { key: 'agenda', label: 'Agenda', icon: 'calendar' },
              { key: 'messages', label: 'Chat', icon: 'message' },
            ]
          : [
              { key: 'dashboard', label: 'Home', icon: 'home' },
              { key: 'editorial', label: 'Calendario', icon: 'calendar' },
              { key: 'media', label: 'Media', icon: 'image' },
              { key: 'messages', label: 'Chat', icon: 'message' },
            ])
  const tabbarKeys = new Set(tabbarItems.map(t => t.key))
  const title = hub && hubTabs.length > 1 ? { t: hub.label, s: title0.s } : title0

  return (
    <div className="app">
      <div className={`scrim ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}
        style={{ paddingBottom: 'calc(26px + env(safe-area-inset-bottom))' }}>
        <div className="brand" style={{ flexShrink: 0, flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <img className="brand-wordmark" src="/brand/auvi-wordmark.svg" alt="AUVI" />
          <div className="brand-sub">Player Hub · {APP_VERSION}</div>
        </div>
        <nav className="nav"
          style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
          {nav.map(g => {
            const items = g.items.filter(visibleItem)
            if (!items.length) return null
            return (
              <React.Fragment key={g.group}>
                <div className="nav-label">{tr(g.group)}</div>
                {items.map(i => (
                  <button key={i.key} className={`nav-item ${isActiveItem(i.key) ? 'active' : ''} ${tabbarKeys.has(i.key) ? 'in-tabbar' : ''}`}
                    onClick={() => openItem(i)}>
                    <span className="nav-ico"><Icon name={i.icon} size={17} /></span>{tr(i.label)}
                  </button>
                ))}
              </React.Fragment>
            )
          })}
        </nav>
        <div className="sidebar-foot" style={{ flexShrink: 0 }}>
          <button className={`user-chip ${route === 'settings' ? 'active' : ''}`} onClick={() => { setRoute('settings'); setOpen(false) }}
            title="Impostazioni: password, calendario sul telefono, notifiche" style={{ width: '100%', textAlign: 'left' }}>
            <div className="avatar">{initials(agentName || profile?.full_name || profile?.email)}</div>
            <div className="user-meta">
              <div className="user-name">{agentName || profile?.full_name || profile?.email}</div>
              <div className="user-role">{role === 'admin' ? 'AUVI · Advisor' : role === 'creator' ? 'Team · Creator' : role === 'preparatore' ? 'Preparatore Atletico' : role === 'brand' ? 'Brand · Partner' : role === 'agente' ? 'Procuratore' : role === 'assicuratore' ? 'Assicuratore' : role === 'commercialista' ? 'Commercialista' : role === 'fisioterapista' ? 'Fisioterapista' : 'Giocatore'}</div>
            </div>
            <span style={{ marginLeft: 'auto', color: 'var(--text-faint)', display: 'grid' }}><Icon name="sliders" size={16} /></span>
          </button>
          {myRoles.length > 1 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 800, color: 'var(--text-dim)', marginBottom: 5 }}>
                Cambia profilo
              </div>
              <select className="input" style={{ width: '100%', fontSize: 13 }}
                value={role || ''} onChange={e => switchRole(e.target.value)}>
                {myRoles.map(r => (
                  <option key={r.role} value={r.role}>{r.label || r.role}</option>
                ))}
              </select>
            </div>
          )}
          <div className="drawer-lang" style={{ marginTop: 10 }}><LangToggle /></div>
          <button className="btn" style={{ width: '100%', marginTop: 8, justifyContent: 'center' }} onClick={signOut}>
            <Icon name="logout" size={15} /> Esci
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="flex gap">
            <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Menu"><Icon name="menu" size={17} /></button>
            <div>
              {HOME_ROUTES.includes(route) && <img className="topbar-wordmark" src="/brand/auvi-wordmark.svg" alt="AUVI" />}
              <div className={`page-title ${HOME_ROUTES.includes(route) ? 'desktop-only' : ''}`}>{tr(title.t)}</div>
              <div className="page-sub">{tr(title.s)}</div>
            </div>
          </div>
          <div className="flex gap" style={{ alignItems: 'center' }}>
            {canSwitch && (
              <select
                aria-label="Atleta gestito"
                title="Atleta gestito"
                value={athleteId ?? ''}
                onChange={e => setAthleteId(Number(e.target.value))}
                className="select athlete-select"
              >
                {athletes.map(a => (
                  <option key={a.api_player_id} value={a.api_player_id}>{a.name || `#${a.api_player_id}`}</option>
                ))}
              </select>
            )}
            <span className="topbar-lang"><LangToggle /></span>
            {right}<NotificationBell goto={setRoute} />
          </div>
        </div>
        <div className="content">
          {HOME_ROUTES.includes(route) && <PushNudge />}
          {hub && hubTabs.length > 1 && (
            <div className="hub-tabs">
              <Tabs tabs={hubTabs.map(t => ({ key: t.key, label: tr(t.label) }))} value={route} onChange={k => setRoute(k)} />
            </div>
          )}
          {children}
        </div>
      </div>

      {/* Tab bar mobile (iOS): pollice, zero frizioni. "Altro" apre il drawer completo. */}
      <nav className="tabbar">
        {tabbarItems.map(t => (
          <button key={t.key} className={`tab-item ${!open && (route === t.key || isActiveItem(t.key)) ? 'active' : ''}`}
            onClick={() => { const it = allItems.find(i => i.key === t.key); if (it) openItem(it); else { setRoute(t.key); setOpen(false) } }}>
            <span className="tab-ico"><Icon name={t.icon} size={21} strokeWidth={1.7} /></span>
            <span className="tab-lbl">{t.label}</span>
          </button>
        ))}
        <button className={`tab-item ${open ? 'active' : ''}`} onClick={() => setOpen(true)} aria-label="Altre sezioni">
          <span className="tab-ico"><Icon name="menu" size={21} strokeWidth={1.7} /></span>
          <span className="tab-lbl">Altro</span>
        </button>
      </nav>

      <Toaster />
    </div>
  )
}
