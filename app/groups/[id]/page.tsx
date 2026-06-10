import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NavBar from '@/components/NavBar'
import GroupLeaderboard from '@/components/GroupLeaderboard'
import { calculateCurrentScore, calculateDynamicMax } from '@/lib/scoring'

export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Verify membership
  const { data: membership } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', id)
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/dashboard')

  const { data: group } = await supabase
    .from('groups')
    .select('*')
    .eq('id', id)
    .single()

  const { data: members } = await supabase
    .from('group_members')
    .select('*, profiles(*)')
    .eq('group_id', id)

  const { data: entries } = await supabase
    .from('group_bracket_entries')
    .select('*, brackets(*), profiles(*)')
    .eq('group_id', id)

  const bracketIds = (entries || []).map((e: any) => e.bracket_id)

  // Fetch all picks + results needed for live scoring
  const [
    { data: allGroupPicks },
    { data: allThirdPicks },
    { data: allKnockoutPicks },
    { data: groupResults },
    { data: knockoutResults },
  ] = await Promise.all([
    bracketIds.length > 0 ? supabase.from('group_picks').select('*').in('bracket_id', bracketIds) : Promise.resolve({ data: [] }),
    bracketIds.length > 0 ? supabase.from('third_place_picks').select('*').in('bracket_id', bracketIds) : Promise.resolve({ data: [] }),
    bracketIds.length > 0 ? supabase.from('knockout_picks').select('*').in('bracket_id', bracketIds) : Promise.resolve({ data: [] }),
    supabase.from('group_results').select('*'),
    supabase.from('knockout_results').select('*'),
  ])

  // Compute live score + max potential per bracket
  const liveScoreByBracket: Record<string, number> = {}
  const dynamicMaxByBracket: Record<string, number> = {}
  const winnerByBracket: Record<string, string> = {}

  for (const bracketId of bracketIds) {
    const gp = (allGroupPicks || []).filter((p: any) => p.bracket_id === bracketId)
    const tp = (allThirdPicks || []).filter((p: any) => p.bracket_id === bracketId).map((p: any) => p.team_code)
    const kp = (allKnockoutPicks || []).filter((p: any) => p.bracket_id === bracketId)
    const gr = groupResults || []
    const kr = knockoutResults || []

    liveScoreByBracket[bracketId] = calculateCurrentScore({ groupPicks: gp, thirdPlacePicks: tp, knockoutPicks: kp, groupResults: gr, knockoutResults: kr })
    dynamicMaxByBracket[bracketId] = calculateDynamicMax({ groupPicks: gp, thirdPlacePicks: tp, knockoutPicks: kp, groupResults: gr, knockoutResults: kr })

    const finalPick = kp.find((p: any) => p.round === 'FINAL' && p.match_index === 0)
    if (finalPick) winnerByBracket[bracketId] = finalPick.team_code
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <NavBar profile={profile} />
      <GroupLeaderboard
        group={group}
        members={members || []}
        entries={entries || []}
        currentUserId={user.id}
        winnerByBracket={winnerByBracket}
        liveScoreByBracket={liveScoreByBracket}
        dynamicMaxByBracket={dynamicMaxByBracket}
      />
    </div>
  )
}
