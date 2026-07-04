export type Role = 'admin' | 'player'

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: Role
}

export interface Player {
  id: string
  api_player_id: number | null
  name: string | null
  team_name: string | null
  team_country: string | null
  stadium_name: string | null
  stadium_capacity: number | null
  height: string | null
  weight: string | null
  preferred_foot: string | null
  position: string | null
  shirt_number: number | null
  photo_url: string | null
  nationality: string | null
  age: number | null
}

export interface Match {
  id: string
  match_date: string | null
  league: string | null
  round: string | null
  home_team: string | null
  away_team: string | null
  opponent: string | null
  venue: string | null
  status: string | null
  team_score: number | null
  opponent_score: number | null
  minutes: number | null
  rating: number | string | null
  goals: number | null
  assists: number | null
  yellow_cards: number | null
  red_cards: number | null
  tackles: number | null
  interceptions: number | null
  duels_total: number | null
  duels_won: number | null
  passes_total: number | null
  passes_accuracy: string | null
}

export interface SeasonStat {
  id: string
  season: number | null
  competition: string | null
  appearances: number | null
  minutes: number | null
  goals: number | null
  assists: number | null
  rating: number | null
  yellow_cards: number | null
  red_cards: number | null
}

export interface Contract {
  id: string
  title: string
  counterpart: string | null
  type: string
  start_date: string | null
  end_date: string | null
  salary_gross: number | null
  currency: string
  clauses: { label: string; value: string }[]
  status: string
  notes: string | null
  created_at: string
}

export interface Doc {
  id: string
  name: string
  category: string
  file_path: string | null
  file_url: string | null
  size: number | null
  mime: string | null
  uploaded_by: string | null
  created_at: string
}

export interface Payment {
  id: string
  direction: 'in' | 'out'
  category: string
  description: string | null
  amount: number
  currency: string
  counterpart: string | null
  due_date: string | null
  paid: boolean
  paid_date: string | null
  notes: string | null
  created_at: string
}

export interface Sponsor {
  id: string
  brand: string
  type: string
  value: number | null
  currency: string
  start_date: string | null
  end_date: string | null
  status: string
  deliverables: { title: string; due_date?: string; done?: boolean }[]
  contact: string | null
  notes: string | null
  created_at: string
}

export interface EventItem {
  id: string
  title: string
  type: string
  start_at: string
  end_at: string | null
  location: string | null
  notes: string | null
  created_at: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: 'todo' | 'doing' | 'done'
  priority: 'low' | 'medium' | 'high'
  assignee: 'auvi' | 'player'
  due_date: string | null
  created_by: string | null
  created_at: string
}

export interface Message {
  id: string
  sender_id: string | null
  sender_name: string | null
  sender_role: string | null
  body: string
  created_at: string
}

export interface AllowedEmail {
  email: string
  role: Role
  note: string | null
  created_at: string
}
