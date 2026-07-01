import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isTournamentStarted } from '@/lib/tournament-data'
import BracketSummary from '@/components/BracketSummary'
import NavBar from '@/components/NavBar'

export const dynamic = 'force-dynamic'

export default async function BracketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const { data: bracket } = await supabase.from('brackets').select('*').eq('id', id).single()
  if (!bracket) redirect('/dashboard')

  const [
    { data: groupPicks },
    { data: thirdPlacePicks },
    { data: knockoutPicks },
    { data: groupResults },
    { data: knockoutResults },
    { data: groupStandings },
  ] = await Promise.all([
    supabase.from('group_picks').select('*').eq('bracket_id', id),
    supabase.from('third_place_picks').select('*').eq('bracket_id', id),
    supabase.from('knockout_picks').select('*').eq('bracket_id', id),
    supabase.from('group_results').select('*'),
    supabase.from('knockout_results').select('*'),
    supabase.from('group_standings').select('*'),
  ])

  const isOwner = bracket.user_id === user.id
  const isLocked = isTournamentStarted() || bracket.is_locked
  const canEdit = isOwner && !isLocked

  return (
    <div className="min-h-screen bg-gray-950">
      <NavBar profile={profile} />
      <BracketSummary
        userId={user.id}
        bracket={bracket}
        initialGroupPicks={groupPicks || []}
        initialThirdPlacePicks={(thirdPlacePicks || []).map((t: { team_code: string }) => t.team_code)}
        initialKnockoutPicks={knockoutPicks || []}
        groupResults={groupResults || []}
        knockoutResults={knockoutResults || []}
        groupStandings={groupStandings || []}
        canEdit={canEdit}
      />
    </div>
  )
}
