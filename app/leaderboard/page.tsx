import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GROUPS, TEAMS } from '@/lib/tournament-data'
import { GROUP_ODDS } from '@/lib/group-odds'
import NavBar from '@/components/NavBar'
import LeaderboardTabs from '@/components/LeaderboardTabs'
import { calculateCurrentScore } from '@/lib/scoring'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  // ── Eligible brackets (pre-tournament, unedited) ──────────────────
  const { data: allBrackets } = await supabase
    .from('brackets')
    .select('id, name, user_id, is_complete, profiles(display_name)')
    .eq('is_complete', true)
    .lt('created_at', '2026-06-21')
    .is('last_edited_at', null)

  const brackets = allBrackets || []
  const bracketIds = brackets.map((b: any) => b.id)

  // ── Fetch all picks + results in parallel ─────────────────────────
  const [
    { data: allGroupPicks },
    { data: allThirdPicks },
    { data: allKnockoutPicks },
    { data: groupResults },
    { data: knockoutResults },
  ] = await Promise.all([
    bracketIds.length > 0
      ? supabase.from('group_picks').select('*').in('bracket_id', bracketIds).limit(500000)
      : Promise.resolve({ data: [] }),
    bracketIds.length > 0
      ? supabase.from('third_place_picks').select('*').in('bracket_id', bracketIds).limit(500000)
      : Promise.resolve({ data: [] }),
    bracketIds.length > 0
      ? supabase.from('knockout_picks').select('*').in('bracket_id', bracketIds).limit(500000)
      : Promise.resolve({ data: [] }),
    supabase.from('group_results').select('*'),
    supabase.from('knockout_results').select('*'),
  ])

  const gr = groupResults || []
  const kr = (knockoutResults || []).filter((r: any) => r.winner_code != null)

  // ── Compute live score per bracket ────────────────────────────────
  const liveScores: Record<string, number> = {}
  for (const bracketId of bracketIds) {
    const gp = (allGroupPicks || []).filter((p: any) => p.bracket_id === bracketId)
    const tp = (allThirdPicks || []).filter((p: any) => p.bracket_id === bracketId).map((p: any) => p.team_code)
    const kp = (allKnockoutPicks || []).filter((p: any) => p.bracket_id === bracketId)
    liveScores[bracketId] = calculateCurrentScore({ groupPicks: gp, thirdPlacePicks: tp, knockoutPicks: kp, groupResults: gr, knockoutResults: kr })
  }

  // ── Sort by live score descending ─────────────────────────────────
  const sorted = [...brackets].sort((a: any, b: any) => (liveScores[b.id] ?? 0) - (liveScores[a.id] ?? 0))
  const total = sorted.length

  const mapBracket = (b: any, rank: number) => ({
    rank,
    name: b.name,
    displayName: (b.profiles as any)?.display_name || 'Unknown',
    score: liveScores[b.id] ?? 0,
    bracketId: b.id,
    isMe: b.user_id === user.id,
    percentile: total > 1 ? Math.max(1, Math.round((rank / total) * 100)) : 1,
  })

  const top20 = sorted.slice(0, 20).map((b: any, i: number) => mapBracket(b, i + 1))
  const top20Ids = new Set(top20.map((b: any) => b.bracketId))
  const myBrackets = sorted
    .map((b: any, i: number) => mapBracket(b, i + 1))
    .filter((b: any) => b.isMe && !top20Ids.has(b.bracketId))

  const allScores = sorted.map((b: any) => liveScores[b.id] ?? 0)
  const myScores = sorted
    .filter((b: any) => b.user_id === user.id)
    .map((b: any) => liveScores[b.id] ?? 0)

  // ── Predictions data ──────────────────────────────────────────────
  const completeBracketIds = new Set(bracketIds)
  const picks = (allGroupPicks || []).filter((p: any) => completeBracketIds.has(p.bracket_id))

  type PosPct = { first: number; second: number; third: number; fourth: number; total: number }
  const teamStats: Record<string, PosPct> = {}
  for (const pick of picks) {
    const inc = (code: string, pos: keyof Omit<PosPct, 'total'>) => {
      if (!code) return
      if (!teamStats[code]) teamStats[code] = { first: 0, second: 0, third: 0, fourth: 0, total: 0 }
      teamStats[code][pos]++
      teamStats[code].total++
    }
    inc(pick.first_place, 'first')
    inc(pick.second_place, 'second')
    inc(pick.third_place, 'third')
    inc(pick.fourth_place, 'fourth')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <NavBar profile={profile} />
      <LeaderboardTabs
        top25={top20}
        myBrackets={myBrackets}
        total={total}
        allScores={allScores}
        myScores={myScores}
        teamStats={teamStats}
        picks={picks}
        groups={GROUPS}
        teams={TEAMS}
        groupOdds={GROUP_ODDS}
      />
    </div>
  )
}
