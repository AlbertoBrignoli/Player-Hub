import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../auth/AuthContext'

export interface AthleteLite {
  api_player_id: number
  name: string | null
  photo_url?: string | null
}

interface AthleteState {
  athleteId: number | null          // atleta attivo (api_player_id)
  athletes: AthleteLite[]           // elenco visibile (RLS: player = solo il suo)
  loading: boolean
  canSwitch: boolean                // true solo per team con >1 atleta
  setAthleteId: (id: number) => void
}

const Ctx = createContext<AthleteState>({} as AthleteState)
export const useAthlete = () => useContext(Ctx)

export function AthleteProvider({ children }: { children: React.ReactNode }) {
  const { profile, role } = useAuth()
  const [athletes, setAthletes] = useState<AthleteLite[]>([])
  const [athleteId, setAthleteId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (!profile) { setAthletes([]); setAthleteId(null); setLoading(false); return }
      setLoading(true)
      // RLS: il player vede solo il proprio atleta; admin/creator vedono tutti.
      const { data } = await supabase
        .from('player')
        .select('api_player_id, name, photo_url')
        .not('api_player_id', 'is', null)
        .order('name', { ascending: true })
      if (!mounted) return
      const list = (data as AthleteLite[]) || []
      setAthletes(list)
      const preferred = profile.player_api_id ?? list[0]?.api_player_id ?? null
      setAthleteId(prev => prev ?? preferred)
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [profile?.id, profile?.player_api_id])

  const canSwitch = (role === 'admin' || role === 'creator' || role === 'preparatore' || role === 'brand' || role === 'agente') && athletes.length > 1

  return (
    <Ctx.Provider value={{ athleteId, athletes, loading, canSwitch, setAthleteId }}>
      {children}
    </Ctx.Provider>
  )
}
