import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GROUPS, TEAMS } from '@/lib/tournament-data'
import { GROUP_ODDS } from '@/lib/group-odds'
import NavBar from '@/components/NavBar'
import LeaderboardTabs from '@/components/LeaderboardTabs'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

  // ── Leaderboard data ──────────────────────────────────────────────
  // Fetch all brackets with scores and user display names
  const { data: allBrackets } = await supabase
    .from('brackets')
    .select('id, name, user_id, total_score, is_complete, profiles(display_name)')
    .eq('is_complete', true)
    .lt('created_at', '2026-06-21')
    .is('last_edited_at', null)
    .order('total_score', { ascending: false })

  const brackets = allBrackets || []
  const total = brackets.length

  const mapBracket = (b: any, i: number) => ({
    rank: i + 1,
    name: b.name,
    displayName: (b.profiles as any)?.display_name || 'Unknown',
    score: b.total_score ?? 0,
    bracketId: b.id,
    isMe: b.user_id === user.id,
    percentile: total > 1 ? Math.max(1, Math.round(((i + 1) / total) * 100)) : 1,
  })

  const top20 = brackets.slice(0, 20).map(mapBracket)
  const top20Ids = new Set(top20.map((b: any) => b.bracketId))
  const myBrackets = brackets
    .map(mapBracket)
    .filter((b: any) => b.isMe && !top20Ids.has(b.bracketId))

  // Score distribution for histogram
  const allScores = brackets.map((b: any) => b.total_score ?? 0)
  const myScores = brackets
    .filter((b: any) => b.user_id === user.id)
    .map((b: any) => b.total_score ?? 0)

  // ── Predictions data ──────────────────────────────────────────────
  const { data: allPicks } = await supabase
    .from('group_picks')
    .select('group_code, first_place, second_place, third_place, fourth_place, bracket_id')

  const completeBracketIds = new Set(brackets.map((b: any) => b.id))
  const picks = (allPicks || []).filter((p: any) => completeBracketIds.has(p.bracket_id))

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
