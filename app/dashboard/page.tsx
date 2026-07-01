import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { isTournamentStarted, TEAMS } from '@/lib/tournament-data'
import NavBar from '@/components/NavBar'
import { calculateDynamicMax, calculateCurrentScore } from '@/lib/scoring'
import DeleteBracketButton from '@/components/DeleteBracketButton'
import SupportCard from '@/components/SupportCard'
import ScoringGuide from '@/components/ScoringGuide'

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const { data: brackets } = await supabase
    .from('brackets').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  const { data: groupMemberships } = await supabase
    .from('group_members').select('*, groups(*)').eq('user_id', user.id)

  const { data: announcement } = await supabase
    .from('announcements').select('message, updated_at').order('id', { ascending: false }).limit(1).single()

  const locked = isTournamentStarted()
  const lateEntry = !!profile?.allow_late_entry
  const canCreateBracket = !locked || lateEntry   // new bracket + delete
  const canJoinGroup = true                        // anyone can join a group at any time
  const canCreateGroup = true                      // anyone can create a group (post-tournament groups auto-open entries)

  const bracketIds = (brackets || []).map((b: any) => b.id)

  // Global scores for percentile computation
  const { data: globalScoreRows } = await supabase
    .from('brackets')
    .select('id, total_score')
    .eq('is_complete', true)
  const globalScores = (globalScoreRows || []).map((r: any) => r.total_score ?? 0).sort((a: number, b: number) => b - a)
  const globalTotal = globalScores.length
  function globalPercentile(score: number) {
    if (globalTotal <= 1) return 1
    const rank = globalScores.findIndex((s: number) => s <= score)
    const r = rank === -1 ? globalTotal : rank
    return Math.max(1, Math.round((r / globalTotal) * 100))
  }

  // Fetch all picks + results needed for dynamic max potential
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

  // Live score + dynamic max per bracket
  const liveScoreByBracket: Record<string, number> = {}
  const dynamicMaxByBracket: Record<string, number> = {}
  for (const b of brackets || []) {
    const gp = (allGroupPicks || []).filter((p: any) => p.bracket_id === b.id)
    const tp = (allThirdPicks || []).filter((p: any) => p.bracket_id === b.id).map((p: any) => p.team_code)
    const kp = (allKnockoutPicks || []).filter((p: any) => p.bracket_id === b.id)
    const gr = groupResults || []
    const kr = knockoutResults || []
    liveScoreByBracket[b.id] = calculateCurrentScore({ groupPicks: gp, thirdPlacePicks: tp, knockoutPicks: kp, groupResults: gr, knockoutResults: kr })
    dynamicMaxByBracket[b.id] = calculateDynamicMax({ groupPicks: gp, thirdPlacePicks: tp, knockoutPicks: kp, groupResults: gr, knockoutResults: kr })
  }

  // Final winner picks for trophy display
  const winnerByBracket: Record<string, string> = {}
  for (const p of (allKnockoutPicks || []).filter((p: any) => p.round === 'FINAL' && p.match_index === 0)) {
    winnerByBracket[p.bracket_id] = p.team_code
  }

  // Fetch leaderboard position for each group
  const groupIds = (groupMemberships || []).map((m: any) => m.group_id)
  const groupStats: Record<string, { leader: string; myPlace: number; totalEntries: number; myBestMax: number }> = {}

  // Collect all leader IDs first, then batch-fetch profiles in one query
  const leaderIdByGroup: Record<string, string> = {}
  const sortedByGroup: Record<string, [string, number][]> = {}

  for (const groupId of groupIds) {
    const { data: entries } = await supabase
      .from('group_bracket_entries')
      .select('user_id, brackets(id, total_score, user_id)')
      .eq('group_id', groupId)

    if (!entries || entries.length === 0) continue

    const scoreByUser: Record<string, number> = {}
    for (const e of entries as any[]) {
      const uid = e.brackets?.user_id || e.user_id
      const bid = e.brackets?.id
      const score = (bid && liveScoreByBracket[bid] !== undefined) ? liveScoreByBracket[bid] : (e.brackets?.total_score || 0)
      if (scoreByUser[uid] === undefined || score > scoreByUser[uid]) scoreByUser[uid] = score
    }

    const sorted = Object.entries(scoreByUser).sort((a, b) => b[1] - a[1])
    sortedByGroup[groupId] = sorted

    const myBracketIds = (entries as any[])
      .filter(e => (e.brackets?.user_id || e.user_id) === user.id)
      .map(e => e.brackets?.id)
      .filter(Boolean)
    const myBestMax = myBracketIds.reduce((best: number, bid: string) => {
      const m = dynamicMaxByBracket[bid] || 0
      return m > best ? m : best
    }, 0)

    const leaderId = sorted[0]?.[0]
    if (leaderId) leaderIdByGroup[groupId] = leaderId

    groupStats[groupId] = {
      leader: 'Unknown', // filled in below
      myPlace: sorted.findIndex(([uid]) => uid === user.id) + 1,
      totalEntries: sorted.length,
      myBestMax,
    }
  }

  // Batch fetch all leader profiles in one query
  const leaderIds = [...new Set(Object.values(leaderIdByGroup))]
  if (leaderIds.length > 0) {
    const { data: leaderProfiles } = await supabase
      .from('profiles').select('id, display_name').in('id', leaderIds)
    const profileMap = Object.fromEntries((leaderProfiles || []).map((p: any) => [p.id, p.display_name]))
    for (const [groupId, leaderId] of Object.entries(leaderIdByGroup)) {
      groupStats[groupId].leader = profileMap[leaderId] || 'Unknown'
    }
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <NavBar profile={profile} />
      <main className="max-w-6xl mx-auto p-6">
        {/* Brackets section */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">My Brackets</h1>
            <p className="text-gray-400 mt-1">
              {locked ? '🔒 Tournament has started — brackets are locked' : '✏️ Edit your brackets before the tournament starts'}
            </p>
          </div>
          {canCreateBracket && (
            <Link href="/brackets/new" className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors">
              + New Bracket
            </Link>
          )}
        </div>

        {!brackets || brackets.length === 0 ? (
          <div className="text-center py-16 bg-gray-800/50 rounded-2xl border border-gray-700 mb-12">
            <div className="text-5xl mb-4">🏆</div>
            <h2 className="text-xl font-semibold mb-2">No brackets yet</h2>
            <p className="text-gray-400 mb-6">Create your first bracket to get started</p>
            {canCreateBracket && (
              <Link href="/brackets/new" className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors">
                Create Bracket
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-12">
            {(brackets as any[]).map(b => {
              const winnerCode = winnerByBracket[b.id]
              const winnerTeam = winnerCode ? TEAMS.find(t => t.code === winnerCode) : null
              return (
                <div key={b.id} className="relative bg-gray-800 border border-gray-700 rounded-xl p-5 transition-colors group">
                  <Link href={`/brackets/${b.id}`} className="block hover:bg-gray-700 rounded-xl absolute inset-0" />
                  <div className="relative flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-lg group-hover:text-yellow-400 transition-colors">{b.name}</h3>
                    <div className="flex items-center gap-1.5">
                      {b.is_complete === false && (
                        <span className="text-xs bg-orange-900/60 text-orange-300 border border-orange-700/50 px-2 py-0.5 rounded">Incomplete</span>
                      )}
                      {b.is_locked && <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded">Locked</span>}
                      {(canCreateBracket || !b.is_complete) && <DeleteBracketButton bracketId={b.id} bracketName={b.name} />}
                    </div>
                  </div>
                  <div className="flex items-baseline gap-3">
                    <div className="text-3xl font-bold text-yellow-400">{liveScoreByBracket[b.id] ?? b.total_score} pts</div>
                    {b.is_complete && globalTotal > 0 && (
                      <span className="text-xs text-gray-400">top {globalPercentile(liveScoreByBracket[b.id] ?? b.total_score)}%</span>
                    )}
                  </div>
                  {dynamicMaxByBracket[b.id] > (liveScoreByBracket[b.id] ?? 0) && (
                    <div className="text-xs text-gray-500 mt-1">
                      Max potential: <span className="text-green-400 font-medium">{dynamicMaxByBracket[b.id]} pts</span>
                    </div>
                  )}
                  {winnerTeam && (
                    <div className="text-sm text-gray-300 mt-2">
                      🏆 {winnerTeam.flag} {winnerTeam.name}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    Created {new Date(b.created_at).toLocaleDateString()}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Groups section */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">My Groups</h2>
          <div className="flex gap-3">
            <Link href="/groups/join" className="px-4 py-2 border border-gray-600 hover:border-gray-400 rounded-lg text-sm transition-colors whitespace-nowrap">
              {locked ? '🕐 Join a group' : 'Join Group'}
            </Link>
            <Link href="/groups/new" className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg text-sm transition-colors whitespace-nowrap">
              {locked ? '🕐 New group' : '+ New Group'}
            </Link>
          </div>
        </div>

        {!groupMemberships || groupMemberships.length === 0 ? (
          <div className="text-center py-12 bg-gray-800/50 rounded-2xl border border-gray-700">
            <div className="text-4xl mb-3">👥</div>
            <h3 className="text-lg font-semibold mb-1">No groups yet</h3>
            <p className="text-gray-400 text-sm">Create a group or join one with an invite link</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {(groupMemberships as any[]).map(m => {
              const stats = groupStats[m.group_id]
              return (
                <Link key={m.id} href={`/groups/${m.group_id}`}
                  className="block bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl p-5 transition-colors group"
                >
                  <h3 className="font-semibold text-lg group-hover:text-yellow-400 transition-colors mb-2">
                    {m.groups.name}
                  </h3>
                  {stats && stats.totalEntries > 0 ? (
                    <div className="text-sm text-gray-400 space-y-0.5">
                      <div>🥇 Current leader: <span className="text-white font-medium">{stats.leader}</span></div>
                      <div>📍 Your place: <span className="text-yellow-400 font-medium">{ordinal(stats.myPlace)} of {stats.totalEntries}</span></div>
                      {stats.myBestMax > 0 && (
                        <div>📈 Max potential: <span className="text-green-400 font-medium">{stats.myBestMax} pts</span></div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No brackets entered yet</p>
                  )}
                </Link>
              )
            })}
          </div>
        )}
        {/* Scoring Guide + Support + Feedback */}
        <ScoringGuide />
        <SupportCard userId={user.id} announcement={announcement?.message || null} />
      </main>
    </div>
  )
}
