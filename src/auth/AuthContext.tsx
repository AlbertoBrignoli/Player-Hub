import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile, Role } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  isTeam: boolean // admin o creator: chi prepara contenuti
  isBrand: boolean
  role: Role | null
  playerApiId: number | null // atleta collegato a questo login (null per admin/creator)
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const Ctx = createContext<AuthState>({} as AuthState)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(uid: string) {
    const { data } = await supabase.from('crm_profiles').select('*').eq('id', uid).maybeSingle()
    setProfile(data as Profile | null)
  }

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession()
      .then(async ({ data }) => {
        if (!mounted) return
        setSession(data.session)
        if (data.session) await loadProfile(data.session.user.id)
      })
      .catch(() => { /* rete assente: si mostra il login invece di restare in caricamento */ })
      .finally(() => { if (mounted) setLoading(false) })
    // Dentro questo callback supabase-js tiene un lock: chiamare di nuovo Supabase
    // in attesa (await) può bloccare tutto e lasciare l'app sullo spinner.
    // Il profilo si carica quindi fuori dal callback (setTimeout 0).
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (!s) { setProfile(null); setLoading(false); return }
      setTimeout(() => {
        loadProfile(s.user.id).catch(() => {}).finally(() => { if (mounted) setLoading(false) })
      }, 0)
    })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])

  const value: AuthState = {
    session,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    isTeam: profile?.role === 'admin' || profile?.role === 'creator',
    isBrand: profile?.role === 'brand',
    role: profile?.role ?? null,
    playerApiId: profile?.player_api_id ?? null,
    signOut: async () => { await supabase.auth.signOut() },
    refreshProfile: async () => { if (session) await loadProfile(session.user.id) },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
