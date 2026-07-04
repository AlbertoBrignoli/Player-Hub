import { useState } from 'react'
import { useAuth } from './auth/AuthContext'
import Login from './auth/Login'
import Shell from './components/Shell'
import { Spinner } from './components/ui'

import Dashboard from './modules/Dashboard'
import Performance from './modules/Performance'
import Contracts from './modules/Contracts'
import Documents from './modules/Documents'
import Editorial from './modules/Editorial'
import Media from './modules/Media'
import Sponsors from './modules/Sponsors'
import Agenda from './modules/Agenda'
import Tasks from './modules/Tasks'
import Messages from './modules/Messages'
import Settings from './modules/Settings'

export default function App() {
  const { session, profile, loading } = useAuth()
  const [route, setRoute] = useState('dashboard')

  if (loading) return <Spinner />
  if (!session) return <Login />

  // Sessione presente ma profilo assente = email non in whitelist (trigger ha bloccato)
  if (!profile) return <NoAccess />

  const view = (() => {
    switch (route) {
      case 'dashboard': return <Dashboard goto={setRoute} />
      case 'performance': return <Performance />
      case 'contracts': return <Contracts />
      case 'documents': return <Documents />
      case 'editorial': return <Editorial />
      case 'media': return <Media />
      case 'sponsors': return <Sponsors />
      case 'agenda': return <Agenda />
      case 'tasks': return <Tasks />
      case 'messages': return <Messages />
      case 'settings': return <Settings />
      default: return <Dashboard goto={setRoute} />
    }
  })()

  return <Shell route={route} setRoute={setRoute}>{view}</Shell>
}

function NoAccess() {
  const { signOut } = useAuth()
  return (
    <div className="login-wrap">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div className="login-logo" style={{ margin: '0 auto 20px' }}>A</div>
        <div className="login-title">Accesso non autorizzato</div>
        <div className="login-sub">Questo indirizzo email non è abilitato all'ingresso in questo spazio riservato.</div>
        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={signOut}>Esci</button>
      </div>
    </div>
  )
}
