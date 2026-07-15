import { useState } from 'react'
import { useAuth } from './auth/AuthContext'
import Login from './auth/Login'
import Shell from './components/Shell'
import { Spinner } from './components/ui'

import Dashboard from './modules/Dashboard'
import Performance from './modules/Performance'
import Profile from './modules/Profile'
import Fitness from './modules/Fitness'
import FitnessCoachHome from './modules/FitnessCoachHome'
import FitnessCoachProfile from './modules/FitnessCoachProfile'
import Contracts from './modules/Contracts'
import Documents from './modules/Documents'
import Editorial from './modules/Editorial'
import Media from './modules/Media'
import Sponsors from './modules/Sponsors'
import Agenda from './modules/Agenda'
import Tasks from './modules/Tasks'
import Messages from './modules/Messages'
import Settings from './modules/Settings'
import PasswordSetup from './components/PasswordSetup'
import MediaKit from './modules/MediaKit'
import BrandCard from './modules/BrandCard'
import BrandHome from './modules/BrandHome'
import BrandCampaigns from './modules/BrandCampaigns'

export default function App() {
  const { session, profile, loading } = useAuth()
  const [routeState, setRoute] = useState<string | null>(null)

  if (loading) return <Spinner />
  if (!session) return <Login />

  // Sessione presente ma profilo assente = email non in whitelist (trigger ha bloccato)
  if (!profile) return <NoAccess />

  // Il brand ha un set di schermate dedicato e non accede alle aree interne.
  const isBrand = profile.role === 'brand'
  const brandAllowed = ['brandhome', 'mediakit', 'campaigns', 'brandcard', 'messages']
  // Il preparatore vede solo fitness, parte sportiva, agenda e chat.
  const coachAllowed = ['dashboard', 'fitness', 'coach-profile', 'performance', 'agenda', 'messages']
  const isCoach = profile.role === 'preparatore'
  const home = isBrand ? 'brandhome' : 'dashboard'
  let route = routeState ?? home
  if (isBrand && !brandAllowed.includes(route)) route = 'brandhome'
  if (isCoach && !coachAllowed.includes(route)) route = 'dashboard'

  const view = (() => {
    switch (route) {
      case 'brandhome': return <BrandHome goto={setRoute} />
      case 'mediakit': return <MediaKit />
      case 'campaigns': return <BrandCampaigns />
      case 'brandcard': return <BrandCard goto={setRoute} />
      case 'dashboard': return profile.role === 'preparatore' ? <FitnessCoachHome goto={setRoute} /> : <Dashboard goto={setRoute} />
      case 'performance': return <Performance goto={setRoute} />
      case 'profile': return <Profile />
      case 'fitness': return <Fitness goto={setRoute} />
      case 'coach-profile': return <FitnessCoachProfile goto={setRoute} />
      case 'contracts': return <Contracts />
      case 'documents': return <Documents />
      case 'editorial': return <Editorial />
      case 'media': return <Media />
      case 'sponsors': return <Sponsors />
      case 'agenda': return <Agenda goto={setRoute} />
      case 'tasks': return <Tasks />
      case 'messages': return <Messages />
      case 'settings': return <Settings />
      default: return isBrand ? <MediaKit /> : profile.role === 'preparatore' ? <FitnessCoachHome goto={setRoute} /> : <Dashboard goto={setRoute} />
    }
  })()

  return (
    <>
      <Shell route={route} setRoute={setRoute}>{view}</Shell>
      <PasswordSetup />
    </>
  )
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
