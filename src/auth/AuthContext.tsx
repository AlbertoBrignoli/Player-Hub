import React, { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
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
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (data.session) await loadProfile(data.session.user.id)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s)
      if (s) await loadProfile(s.user.id)
      else setProfile(null)
      setLoading(false)
    })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])

  const value: AuthState = {
    session,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    signOut: async () => { await supabase.auth.signOut() },
    refreshProfile: async () => { if (session) await loadProfile(session.user.id) },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
