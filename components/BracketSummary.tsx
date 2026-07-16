'use client'
import { useState } from 'react'
import { GROUPS, TEAMS } from '@/lib/tournament-data'
import { calculateDynamicMax } from '@/lib/scoring'
import BracketBuilder from './BracketBuilder'

type GroupPickRow = { group_code: string; first_place: string; second_place: string; third_place: string; fourth_place: string }
type KnockoutPickRow = { round: string; match_index: number; team_code: string }
type GroupResult = { group_code: string; first_place: string; second_place: string; third_place: string; fourth_place: string; third_advances: boolean }
type KnockoutResult = { round: string; match_index: number; winner_code: string | null; home_code?: string | null; away_code?: string | null }
type GroupStandingRow = { group_code: string; team_code: string; position: number; mp: number; w: number; d: number; l: number; gd: number; pts: number }

type Props = {
  userId: string
  bracket: any
  initialGroupPicks: GroupPickRow[]
  initialThirdPlacePicks: string[]
  initialKnockoutPicks: KnockoutPickRow[]
  groupResults: GroupResult[]
  knockoutResults: KnockoutResult[]
  groupStandings: GroupStandingRow[]
  canEdit: boolean
}

const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', 'FINAL'] as const
const ROUND_PTS: Record<string, number> = { R32: 2, R16: 4, QF: 6, SF: 10, FINAL: 15 }

// ── Knockout bracket structure (WC 2026) ──────────────────────
type SlotDef = { type: 'winner' | 'runner_up'; group: string } | { type: 'third'; eligibleGroups: string[] }
const R32_MATCHES: [SlotDef, SlotDef][] = [
  [{ type: 'runner_up', group: 'A' }, { type: 'runner_up', group: 'B' }],
  [{ type: 'winner',    group: 'E' }, { type: 'third', eligibleGroups: ['A','B','C','D','F'] }],
  [{ type: 'winner',    group: 'F' }, { type: 'runner_up', group: 'C' }],
  [{ type: 'winner',    group: 'C' }, { type: 'runner_up', group: 'F' }],
  [{ type: 'winner',    group: 'I' }, { type: 'third', eligibleGroups: ['C','D','F','G','H'] }],
  [{ type: 'runner_up', group: 'E' }, { type: 'runner_up', group: 'I' }],
  [{ type: 'winner',    group: 'A' }, { type: 'third', eligibleGroups: ['C','E','F','H','I'] }],
  [{ type: 'winner',    group: 'L' }, { type: 'third', eligibleGroups: ['E','H','I','J','K'] }],
  [{ type: 'winner',    group: 'D' }, { type: 'third', eligibleGroups: ['B','E','F','I','J'] }],
  [{ type: 'winner',    group: 'G' }, { type: 'third', eligibleGroups: ['A','E','H','I','J'] }],
  [{ type: 'runner_up', group: 'K' }, { type: 'runner_up', group: 'L' }],
  [{ type: 'winner',    group: 'H' }, { type: 'runner_up', group: 'J' }],
  [{ type: 'winner',    group: 'B' }, { type: 'third', eligibleGroups: ['E','F','G','I','J'] }],
  [{ type: 'winner',    group: 'J' }, { type: 'runner_up', group: 'H' }],
  [{ type: 'winner',    group: 'K' }, { type: 'third', eligibleGroups: ['D','E','I','J','L'] }],
  [{ type: 'runner_up', group: 'D' }, { type: 'runner_up', group: 'G' }],
]
const R16_PAIRS: [number, number][] = [[0,2],[1,4],[3,5],[6,7],[10,11],[8,9],[13,15],[12,14]]
const QF_PAIRS:  [number, number][] = [[0,1],[4,5],[2,3],[6,7]]
const SF_PAIRS:  [number, number][] = [[0,1],[2,3]]

function assignWildcards(
  advancingThirds: string[],
  groupResultMap: Record<string, { third_place: string }>
): Record<number, string> {
  const thirdSlots = [
    { idx: 1,  eligible: ['A','B','C','D','F'] },
    { idx: 4,  eligible: ['C','D','F','G','H'] },
    { idx: 6,  eligible: ['C','E','F','H','I'] },
    { idx: 7,  eligible: ['E','H','I','J','K'] },
    { idx: 8,  eligible: ['B','E','F','I','J'] },
    { idx: 9,  eligible: ['A','E','H','I','J'] },
    { idx: 12, eligible: ['E','F','G','I','J'] },
    { idx: 14, eligible: ['D','E','I','J','L'] },
  ]
  const teamGroup: Record<string, string> = {}
  for (const [g, r] of Object.entries(groupResultMap)) teamGroup[r.third_place] = g
  const result: Record<number, string> = {}
  const rem = [...advancingThirds]
  function bt(si: number): boolean {
    if (si >= thirdSlots.length) return true
    const slot = thirdSlots[si]
    for (let i = 0; i < rem.length; i++) {
      const code = rem[i]
      if (slot.eligible.includes(teamGroup[code] ?? '')) {
        result[slot.idx] = code; rem.splice(i, 1)
        if (bt(si + 1)) return true
        rem.splice(i, 0, code); delete result[slot.idx]
      }
    }
    return false
  }
  bt(0)
  return result
}

function resolveSlot(slot: SlotDef, grm: Record<string, { first_place: string; second_place: string }>, wc: Record<number, string>, idx: number): string | null {
  if (slot.type === 'winner')    return grm[slot.group]?.first_place  ?? null
  if (slot.type === 'runner_up') return grm[slot.group]?.second_place ?? null
  return wc[idx] ?? null
}

// Each round's section title and subtitle
const ROUND_SECTIONS: Record<string, { title: string; sub: string }> = {
  R32:   { title: 'Advance to Round of 16',  sub: '+2pts per correct pick' },
  R16:   { title: 'Advance to Quarter-Finals', sub: '+4pts per correct pick' },
  QF:    { title: 'Advance to Semi-Finals',   sub: '+6pts per correct pick' },
  SF:    { title: 'Finalist',                 sub: '+10pts per correct pick' },
  FINAL: { title: 'Winner',                   sub: '+15pts' },
}

function team(code: string) { return TEAMS.find(t => t.code === code) }

// Reusable team chip
function TeamChip({ code, status }: { code: string; status: 'correct' | 'wrong' | 'pending'; pts?: number }) {
  const t = team(code)
  if (!t) return null
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${
      status === 'correct' ? 'bg-green-900/30 border-green-700/50' :
      status === 'wrong'   ? 'bg-red-900/20 border-red-800/30' :
                             'bg-gray-800 border-gray-700'
    }`}>
      <span className={`flex items-center gap-1.5 ${status === 'wrong' ? 'line-through text-gray-500' : 'text-white'}`}>
        {t.flag} {t.name}
      </span>
    </div>
  )
}

// Section wrapper
function ScoringSection({ title, sub, earned, children }: { title: string; sub: string; earned: number; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
        </div>
        <span className={`text-sm font-bold ${earned > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
          +{earned}pts earned
        </span>
      </div>
      {children}
    </section>
  )
}

export default function BracketSummary({
  userId, bracket, initialGroupPicks, initialThirdPlacePicks,
  initialKnockoutPicks, groupResults, knockoutResults, groupStandings, canEdit,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [activeTab, setActiveTab] = useState<'picks' | 'standings' | 'knockout'>('picks')

  const groupResultMap = Object.fromEntries(groupResults.map(r => [r.group_code, r]))
  const completedKnockoutResults = knockoutResults.filter(r => r.winner_code != null) as (KnockoutResult & { winner_code: string })[]
  const winnersByRound: Record<string, Set<string>> = {}
  for (const r of completedKnockoutResults) {
    if (!winnersByRound[r.round]) winnersByRound[r.round] = new Set()
    winnersByRound[r.round].add(r.winner_code)
  }

  const knockoutByRound: Record<string, string[]> = {}
  for (const pick of initialKnockoutPicks) {
    if (!knockoutByRound[pick.round]) knockoutByRound[pick.round] = []
    knockoutByRound[pick.round].push(pick.team_code)
  }

  // ── Scoring calculations ──────────────────────────────────────
  let placementEarned = 0
  let advanceEarned = 0

  for (const pick of initialGroupPicks) {
    const r = groupResultMap[pick.group_code]
    if (!r) continue
    if (pick.first_place  === r.first_place)  placementEarned += 1
    if (pick.second_place === r.second_place) placementEarned += 1
    if (pick.third_place  === r.third_place)  placementEarned += 1
    if (pick.fourth_place === r.fourth_place) placementEarned += 1
    // Advance: team advanced via any route (1st, 2nd, or 3rd-place wildcard)
    for (const pos of ['first_place', 'second_place'] as const) {
      const code = pick[pos]
      if (r.first_place === code || r.second_place === code || (r.third_place === code && r.third_advances)) {
        advanceEarned += 1
      }
    }
  }
  for (const code of initialThirdPlacePicks) {
    const t = team(code)
    const groupResult = t ? groupResultMap[t.group] : undefined
    if (groupResult && (groupResult.first_place === code || groupResult.second_place === code || (groupResult.third_place === code && groupResult.third_advances))) {
      advanceEarned += 1
    }
  }

  const knockoutEarned: Record<string, number> = {}
  for (const pick of initialKnockoutPicks) {
    if (winnersByRound[pick.round]?.has(pick.team_code)) {
      knockoutEarned[pick.round] = (knockoutEarned[pick.round] || 0) + (ROUND_PTS[pick.round] || 0)
    }
  }

  const totalEarned = placementEarned + advanceEarned + Object.values(knockoutEarned).reduce((a, b) => a + b, 0)

  // ── Dynamic max potential ──────────────────────────────────────
  const dynamicMaxPotential = calculateDynamicMax({
    groupPicks: initialGroupPicks,
    thirdPlacePicks: initialThirdPlacePicks,
    knockoutPicks: initialKnockoutPicks,
    groupResults,
    knockoutResults: completedKnockoutResults,
  })

  if (editing) {
    return (
      <BracketBuilder
        userId={userId}
        bracket={bracket}
        initialGroupPicks={initialGroupPicks}
        initialThirdPlacePicks={initialThirdPlacePicks}
        initialKnockoutPicks={initialKnockoutPicks}
        groupResults={groupResults}
        knockoutResults={completedKnockoutResults}
        readOnly={false}
        onDone={() => setEditing(false)}
      />
    )
  }

  const hasGroupResults = groupResults.length > 0

  // ── Live standings helpers ─────────────────────────────────────
  const standingsByGroup: Record<string, GroupStandingRow[]> = {}
  for (const row of groupStandings) {
    if (!standingsByGroup[row.group_code]) standingsByGroup[row.group_code] = []
    standingsByGroup[row.group_code].push(row)
  }
  for (const g of GROUPS) {
    if (standingsByGroup[g]) standingsByGroup[g].sort((a, b) => a.position - b.position)
  }

  // Count wrong picks from completed groups only
  const wrongPicks = (() => {
    let count = 0
    for (const pick of initialGroupPicks) {
      const r = groupResultMap[pick.group_code]
      if (!r) continue
      const rows = standingsByGroup[pick.group_code] || []
      const allPlayed = rows.length === 4 && rows.every(r => r.mp === 3)
      if (!allPlayed) continue
      if (pick.first_place  !== r.first_place)  count++
      if (pick.second_place !== r.second_place) count++
      if (pick.third_place  !== r.third_place)  count++
      if (pick.fourth_place !== r.fourth_place) count++
    }
    return count
  })()

  const pickPositionMap: Record<string, string> = {}
  for (const pick of initialGroupPicks) {
    pickPositionMap[pick.first_place]  = '1st'
    pickPositionMap[pick.second_place] = '2nd'
    pickPositionMap[pick.third_place]  = '3rd'
    pickPositionMap[pick.fourth_place] = '4th'
  }
  const advancePicks = new Set([
    ...initialGroupPicks.map(p => p.first_place),
    ...initialGroupPicks.map(p => p.second_place),
    ...initialThirdPlacePicks,
  ])

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{bracket?.name}</h1>
        </div>
        {canEdit ? (
          <button onClick={() => setEditing(true)}
            className="ml-4 shrink-0 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors text-sm sm:text-base">
            ✏️ Edit Bracket
          </button>
        ) : (
          <span className="ml-4 shrink-0 text-sm text-gray-500 bg-gray-800 px-3 py-2 rounded-lg">🔒 Locked</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-8 border border-gray-700 rounded-lg overflow-hidden w-fit">
        <button
          onClick={() => setActiveTab('picks')}
          className={`px-5 py-2 text-sm font-medium transition-colors ${activeTab === 'picks' ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'}`}
        >
          My Picks
        </button>
        <button
          onClick={() => setActiveTab('standings')}
          className={`px-5 py-2 text-sm font-medium transition-colors border-l border-gray-700 ${activeTab === 'standings' ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'}`}
        >
          📊 Group Stage Results
        </button>
        <button
          onClick={() => setActiveTab('knockout')}
          className={`px-5 py-2 text-sm font-medium transition-colors border-l border-gray-700 ${activeTab === 'knockout' ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'}`}
        >
          ⚽ Knockout Results
        </button>
      </div>

        {/* ── Knockout Results Tab ─────────────────────────────────── */}
      {activeTab === 'knockout' && (() => {
        // Group actual ESPN matchup data by round
        const matchesByRound: Record<string, { home: string | null; away: string | null; winner: string | null }[]> = {}
        for (const r of [...knockoutResults].sort((a, b) => a.match_index - b.match_index)) {
          if (!matchesByRound[r.round]) matchesByRound[r.round] = []
          matchesByRound[r.round].push({
            home: r.home_code ?? null,
            away: r.away_code ?? null,
            winner: r.winner_code ?? null,
          })
        }

        const userPicked: Record<string, Set<string>> = {}
        for (const round of ROUND_ORDER) {
          userPicked[round] = new Set(knockoutByRound[round] || [])
        }

        function MatchCard({ home, away, winner, round }: { home: string | null; away: string | null; winner: string | null; round: string }) {
          const picks = userPicked[round]
          function Cell({ code }: { code: string | null }) {
            if (!code) return (
              <div className="flex-1 bg-gray-800/40 border border-gray-700/30 rounded-lg px-2 py-1.5 text-gray-600 text-xs text-center">TBD</div>
            )
            const t = team(code)
            const isWinner = winner !== null && code === winner
            const isLoser  = winner !== null && code !== winner
            const picked = picks.has(code)
            return (
              <div className={`flex-1 min-w-0 rounded-lg border px-2 py-1.5 text-xs flex items-center justify-between gap-1 ${
                isWinner ? 'bg-green-900/30 border-green-700/50' :
                isLoser  ? 'bg-gray-900/30 border-gray-700/20 opacity-50' :
                           'bg-gray-800 border-gray-700'
              }`}>
                <span className={`flex items-center gap-1 min-w-0 ${isLoser ? 'line-through text-gray-500' : 'text-white'}`}>
                  <span className="shrink-0 text-sm leading-none">{t?.flag ?? '🏳️'}</span>
                  <span className="truncate">{t?.name ?? code}</span>
                </span>
                <span className="shrink-0 font-bold ml-0.5 text-[11px]">
                  {picked && isWinner && <span className="text-green-400">✓</span>}
                  {picked && isLoser  && <span className="text-red-400">✗</span>}
                  {picked && !winner  && <span className="text-yellow-400">★</span>}
                </span>
              </div>
            )
          }
          return (
            <div className="flex items-center gap-1">
              <Cell code={home} />
              <span className="text-gray-600 text-[9px] font-medium shrink-0">vs</span>
              <Cell code={away} />
            </div>
          )
        }

        const ROUND_LABELS: Record<string, string> = {
          R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-Finals', SF: 'Semi-Finals', FINAL: 'Final',
        }

        return (
          <div>
            {ROUND_ORDER.map(round => {
              const matches = matchesByRound[round] || []
              if (matches.length === 0) return (
                <section key={round} className="mb-10">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-white">{ROUND_LABELS[round]}</h2>
                    <span className="text-xs text-gray-600 italic">Not started</span>
                  </div>
                </section>
              )
              const playedCount = matches.filter(m => m.winner !== null).length
              return (
                <section key={round} className="mb-10">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-white">{ROUND_LABELS[round]}</h2>
                    <span className="text-xs text-gray-500">{playedCount}/{matches.length} played</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {matches.map((m, i) => (
                      <MatchCard key={i} home={m.home} away={m.away} winner={m.winner} round={round} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )
      })()}

    {/* ── Shared score summary card (picks + standings tabs only) ─ */}
    {activeTab !== 'knockout' && (<>
      {(() => {
        const thirdPlaceAdvanceEarned = initialThirdPlacePicks.reduce((acc, code) => {
          const t = team(code)
          const gr = t ? groupResultMap[t.group] : undefined
          return acc + (gr?.third_place === code && gr?.third_advances ? 1 : 0)
        }, 0)
        const groupAdvanceEarned = advanceEarned - thirdPlaceAdvanceEarned
        const thirdAdvanceMax = Math.min(initialThirdPlacePicks.length, 4)
        const sections = [
          { label: 'Group Stage Placement', earned: placementEarned, max: GROUPS.length * 4 },
          { label: 'Advance to Knockout', earned: groupAdvanceEarned + thirdPlaceAdvanceEarned, max: GROUPS.length * 2 + thirdAdvanceMax },
          ...ROUND_ORDER.map(r => ({
            label: ROUND_SECTIONS[r].title,
            earned: knockoutEarned[r] || 0,
            max: (knockoutByRound[r]?.length || 0) * ROUND_PTS[r],
          })).filter(s => s.max > 0),
        ]
        return (
          <div className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-4 mb-6">
            {/* Totals row */}
            <div className="flex items-center gap-5 mb-3 pb-3 border-b border-gray-700">
              <div>
                <span className="text-xl font-bold text-yellow-400">{totalEarned}</span>
                <span className="text-xs text-gray-500 ml-1.5">earned</span>
              </div>
              {wrongPicks > 0 && (
                <>
                  <div className="w-px h-4 bg-gray-600" />
                  <div>
                    <span className="text-xl font-bold text-red-400">{wrongPicks}</span>
                    <span className="text-xs text-gray-500 ml-1.5">wrong</span>
                  </div>
                </>
              )}
            </div>
            {/* Breakdown rows */}
            <div className="space-y-1.5">
              {sections.map(s => (
                <div key={s.label} className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">{s.label}</span>
                  <span className="tabular-nums">
                    <span className={s.earned > 0 ? 'text-yellow-400 font-medium' : 'text-gray-600'}>+{s.earned}</span>
                    <span className="text-gray-700 ml-1">/ {s.max} pts</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── Live Standings Tab ──────────────────────────────────── */}
      {activeTab === 'standings' && (
        <div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-400 mb-4">
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Your pick to advance</div>
            <div className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded text-green-400 bg-green-900/30 border border-green-700/40 font-medium">1st ✓</span> correct</div>
            <div className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded text-red-400 bg-red-900/20 border border-red-700/30 font-medium">1st ✗</span> wrong</div>
            <div className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded text-gray-400 bg-gray-800 border border-gray-600 font-medium">2nd</span> in play</div>
          </div>

          {/* Group cards */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {GROUPS.map(g => {
              const rows = standingsByGroup[g] || []
              const pick = initialGroupPicks.find(p => p.group_code === g)
              const result = groupResultMap[g]
              const allPlayed = rows.length === 4 && rows.every(r => r.mp === 3)
              const hasStarted = rows.some(r => r.mp > 0)
              const matchday = rows[0]?.mp ?? 0

              return (
                <div key={g} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
                    <span className="text-xs font-bold text-yellow-400 uppercase tracking-wide">Group {g}</span>
                    <span className="text-xs text-gray-500">
                      {allPlayed ? 'Complete' : hasStarted ? `MD ${matchday}/3` : 'Not started'}
                    </span>
                  </div>

                  {/* Col headers */}
                  <div className="grid grid-cols-[12px_1fr_28px_28px_52px] gap-1 px-3 py-1.5 border-b border-gray-700/50">
                    <div />
                    <div className="text-[10px] text-gray-600">Team</div>
                    <div className="text-[10px] text-gray-600 text-right">GD</div>
                    <div className="text-[10px] text-gray-600 text-right">Pts</div>
                    <div className="text-[10px] text-gray-600 text-right">Your pick</div>
                  </div>

                  {/* Team rows — use live standings if available, else fall back to group_results order */}
                  {(rows.length > 0 ? rows : ['first_place','second_place','third_place','fourth_place'].map((pos, i) => ({
                    team_code: pick?.[pos as keyof GroupPickRow] ?? '',
                    position: i + 1, mp: 0, w: 0, d: 0, l: 0, gd: 0, pts: 0, group_code: g,
                  })) as GroupStandingRow[]).map((row) => {
                    const t = team(row.team_code)
                    if (!t) return null
                    const myPick = pickPositionMap[row.team_code]
                    const isAdvancePick = advancePicks.has(row.team_code)
                    const groupComplete = allPlayed && !!result

                    let pickStatus: 'correct' | 'wrong' | 'pending' = 'pending'
                    if (myPick && groupComplete) {
                      const posMap: Record<string, string> = { '1st': result.first_place, '2nd': result.second_place, '3rd': result.third_place, '4th': result.fourth_place }
                      pickStatus = posMap[myPick] === row.team_code ? 'correct' : 'wrong'
                    }

                    return (
                      <div key={row.team_code} className={`grid grid-cols-[12px_1fr_28px_28px_52px] gap-1 px-3 py-1.5 items-center border-b border-gray-700/30 text-xs ${!hasStarted ? 'opacity-50' : ''}`}>
                        <div className={`w-2 h-2 rounded-full ${isAdvancePick ? 'bg-yellow-400' : ''}`} />
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="leading-none">{t.flag}</span>
                          <span className="truncate text-white">{t.name}</span>
                        </div>
                        <div className="text-right text-gray-400">{hasStarted ? (row.gd > 0 ? `+${row.gd}` : row.gd) : '—'}</div>
                        <div className="text-right font-medium">{hasStarted ? row.pts : '—'}</div>
                        <div className="flex justify-end">
                          {myPick ? (
                            <span className={`px-1.5 py-0.5 rounded font-medium text-[10px] ${
                              pickStatus === 'correct' ? 'bg-green-900/40 text-green-400 border border-green-700/40' :
                              pickStatus === 'wrong'   ? 'bg-red-900/30 text-red-400 border border-red-700/30' :
                                                        'bg-gray-700 text-gray-400 border border-gray-600'
                            }`}>
                              {myPick}{pickStatus === 'correct' ? ' ✓' : pickStatus === 'wrong' ? ' ✗' : ''}
                            </span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-600 mt-4">Standings update automatically every 30 min · wrong/correct mid-group are early indicators only</p>
        </div>
      )}

      {/* ── My Picks Tab ───────────────────────────────────────── */}
      {activeTab === 'picks' && (<>

      {/* ── 1. Group Stage Placement ─────────────────────────── */}
      <ScoringSection title="Group Stage Placement" sub="+1pt per correct placement" earned={placementEarned}>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map(g => {
            const pick = initialGroupPicks.find(p => p.group_code === g)
            const result = groupResultMap[g]
            const positions = ['first_place', 'second_place', 'third_place', 'fourth_place'] as const
            const labels = ['1st', '2nd', '3rd', '4th']

            let gPts = 0
            if (pick && result) {
              if (pick.first_place  === result.first_place)  gPts++
              if (pick.second_place === result.second_place) gPts++
              if (pick.third_place  === result.third_place)  gPts++
              if (pick.fourth_place === result.fourth_place) gPts++
            }

            return (
              <div key={g} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-yellow-400 text-sm">Group {g}</h3>
                  {result && gPts > 0 && (
                    <span className="text-xs font-bold text-green-400">+{gPts}pts</span>
                  )}
                </div>
                {!pick ? (
                  <p className="text-gray-500 text-xs italic">No picks</p>
                ) : (
                  <div className="space-y-1">
                    {positions.map((pos, i) => {
                      const pickedCode = pick[pos]
                      const pickedTeam = team(pickedCode)
                      const correct = result && pickedCode === result[pos]
                      const wrong = result && !correct
                      const actualCode = result?.[pos]
                      const actualTeam = actualCode ? team(actualCode) : null

                      return (
                        <div key={pos} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-600 w-5">{labels[i]}</span>
                            {pickedTeam && (
                              <span className={
                                wrong   ? 'line-through text-gray-500' :
                                correct ? 'text-white font-medium' : 'text-gray-300'
                              }>
                                {pickedTeam.flag} {pickedTeam.name}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {correct && <span className="text-green-400 font-bold">+1pt</span>}
                            {wrong && actualTeam && (
                              <span className="text-gray-500">{actualTeam.flag} {actualTeam.name}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScoringSection>

      {/* ── 2. Advance to Knockout Bracket ───────────────────── */}
      <ScoringSection title="Advance to Knockout Bracket" sub="+1pt per team correctly picked to advance" earned={advanceEarned}>
        {initialGroupPicks.length === 0 ? (
          <p className="text-gray-600 text-sm italic">No picks made</p>
        ) : (() => {
          // Build flat list: 1st picks + 2nd picks + wildcards
          const advancePicks: { code: string; status: 'correct' | 'wrong' | 'pending' }[] = []

          // Wildcards are finalized once any group has third_advances=true (manually set before R32)
          const wildcardsFinalized = groupResults.some(r => r.third_advances)
          const r32Started = completedKnockoutResults.some(r => r.round === 'R32')

          for (const pos of ['first_place', 'second_place'] as const) {
            for (const g of GROUPS) {
              const pick = initialGroupPicks.find(p => p.group_code === g)
              if (!pick) continue
              const code = pick[pos]
              const result = groupResultMap[g]
              if (!result) { advancePicks.push({ code, status: 'pending' }); continue }
              // Correct if team advanced via any route
              const advanced = result.first_place === code || result.second_place === code || (result.third_place === code && result.third_advances)
              // Pending only if team finished 3rd AND wildcards not yet finalized AND R32 not started
              const is3rdPending = result.third_place === code && !wildcardsFinalized && !r32Started
              const status = advanced ? 'correct' : is3rdPending ? 'pending' : 'wrong'
              advancePicks.push({ code, status })
            }
          }

          for (const code of initialThirdPlacePicks) {
            const t = team(code)
            const groupResult = t ? groupResultMap[t.group] : undefined
            if (!groupResult) { advancePicks.push({ code, status: 'pending' }); continue }
            // Correct if team advanced any way
            const advanced = groupResult.first_place === code || groupResult.second_place === code || (groupResult.third_place === code && groupResult.third_advances)
            // Pending only if team finished 3rd AND wildcards not yet finalized AND R32 not started
            const is3rdPending = groupResult.third_place === code && !wildcardsFinalized && !r32Started
            const eliminated = !advanced && !is3rdPending
            const status = advanced ? 'correct' : eliminated ? 'wrong' : 'pending'
            advancePicks.push({ code, status })
          }

          return (
            <div className="grid gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
              {advancePicks.map(({ code, status }, i) => {
                const t = team(code)
                if (!t) return null
                return (
                  <div key={`${code}-${i}`} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs ${
                    status === 'correct' ? 'bg-green-900/30 border-green-700/50' :
                    status === 'wrong'   ? 'bg-red-900/20 border-red-800/30' :
                                           'bg-gray-800 border-gray-700'
                  }`}>
                    <span className={`flex items-center gap-1 ${status === 'wrong' ? 'line-through text-gray-500' : 'text-white'}`}>
                      {t.flag} {t.name}
                    </span>
                    {status === 'correct' && <span className="text-green-400 font-bold ml-1 shrink-0">+1</span>}
                    {status === 'wrong'   && <span className="text-red-400 ml-1 shrink-0">✗</span>}
                  </div>
                )
              })}
            </div>
          )
        })()}
      </ScoringSection>

      {/* ── 3–7. Knockout rounds ─────────────────────────────── */}
      {(() => {
        const PREV_ROUND: Record<string, string | null> = { R32: null, R16: 'R32', QF: 'R16', SF: 'QF', FINAL: 'SF' }
        const ROUND_MATCH_COUNTS: Record<string, number> = { R32: 16, R16: 8, QF: 4, SF: 2, FINAL: 1 }
        const decidedMatchKeys = new Set(completedKnockoutResults.map(r => `${r.round}-${r.match_index}`))

        // A team is eliminated if their specific match in a prior round was decided and they lost.
        // Chain backwards through the user's own picks.
        function isEliminated(teamCode: string, forRound: string): boolean {
          const prev = PREV_ROUND[forRound]
          if (!prev) return false
          // Already confirmed winner in prev round → still in
          if (winnersByRound[prev]?.has(teamCode)) return false
          // Find their pick in the prev round
          const prevPick = initialKnockoutPicks.find(p => p.round === prev && p.team_code === teamCode)
          if (prevPick) {
            if (decidedMatchKeys.has(`${prev}-${prevPick.match_index}`)) return true // match decided, team lost
            // Their prev match not decided — check the round before that recursively
            return isEliminated(teamCode, prev)
          }
          // No prev pick — eliminated if prev round fully complete and team not a winner
          const prevResultCount = completedKnockoutResults.filter(r => r.round === prev).length
          return prevResultCount >= (ROUND_MATCH_COUNTS[prev] || Infinity)
        }

        return ROUND_ORDER.map(round => {
          const picks = knockoutByRound[round] || []
          const section = ROUND_SECTIONS[round]
          const pts = ROUND_PTS[round]
          const earned = knockoutEarned[round] || 0

          // Per-pick status: correct, wrong (lost or eliminated), or pending
          const allGroupsDone = GROUPS.every(g => groupResultMap[g])
          const pickStatuses = picks.map(code => {
            const won = winnersByRound[round]?.has(code)
            if (won) return 'correct' as const
            // For R32: if all groups are done, check if team actually advanced from group stage
            if (round === 'R32' && allGroupsDone) {
              const advancedFromGroup = groupResults.some(r =>
                r.first_place === code || r.second_place === code || (r.third_place === code && r.third_advances)
              )
              if (!advancedFromGroup) return 'wrong' as const
            }
            // For R32 and R16: use home_code/away_code from knockout_results to check if
            // this team's specific match was played, avoiding match_index mismatch issues.
            if (round === 'R32' || round === 'R16') {
              const prevRound = round === 'R16' ? 'R32' : null
              const checkRound = round === 'R32' ? 'R32' : 'R32'
              // For R32: find if team appeared in a completed R32 match
              if (round === 'R32') {
                const playedMatch = completedKnockoutResults.find(r =>
                  r.round === 'R32' && (r.home_code === code || r.away_code === code)
                )
                if (playedMatch) return 'wrong' as const // match played, team didn't win (won handled above)
                return 'pending' as const
              }
              // For R16: team must have won R32 first
              if (round === 'R16') {
                const wonR32 = winnersByRound['R32']?.has(code)
                if (!wonR32) {
                  // Check if their R32 match was played
                  const r32Match = completedKnockoutResults.find(r =>
                    r.round === 'R32' && (r.home_code === code || r.away_code === code)
                  )
                  if (r32Match) return 'wrong' as const // lost in R32
                  const r32Done = completedKnockoutResults.filter(r => r.round === 'R32').length >= (ROUND_MATCH_COUNTS['R32'] || Infinity)
                  if (r32Done) return 'wrong' as const
                  return 'pending' as const
                }
                // Won R32 — check if their R16 match is decided
                const r16Match = completedKnockoutResults.find(r =>
                  r.round === 'R16' && (r.home_code === code || r.away_code === code)
                )
                if (r16Match) return 'wrong' as const
                return 'pending' as const
              }
            }
            const pick = initialKnockoutPicks.find(p => p.round === round && p.team_code === code)
            const thisMatchDecided = pick ? decidedMatchKeys.has(`${round}-${pick.match_index}`) : false
            const eliminated = isEliminated(code, round)
            if (thisMatchDecided || eliminated) return 'wrong' as const
            return 'pending' as const
          })

          const decidedCount = pickStatuses.filter(s => s !== 'pending').length
          const correctCount = pickStatuses.filter(s => s === 'correct').length

          return (
            <ScoringSection key={round} title={section.title} sub={section.sub} earned={earned}>
              {picks.length === 0 ? (
                <p className="text-gray-600 text-sm italic">No picks made</p>
              ) : (
                <>
                  {decidedCount > 0 && (
                    <p className="text-xs text-gray-500 mb-2">{correctCount}/{decidedCount} decided</p>
                  )}
                  <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                    {picks.map((code, i) => {
                      const t = team(code)
                      if (!t) return null
                      const status = pickStatuses[i]
                      return (
                        <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${
                          status === 'correct' ? 'bg-green-900/30 border-green-700/50' :
                          status === 'wrong'   ? 'bg-red-900/20 border-red-800/30' :
                                                 'bg-gray-800 border-gray-700'
                        }`}>
                          <span className={`flex items-center gap-1.5 ${status === 'wrong' ? 'line-through text-gray-500' : 'text-white'}`}>
                            {t.flag} {t.name}
                          </span>
                          {status === 'correct' && <span className="text-green-400 text-xs font-bold ml-2 shrink-0">+{pts}pts</span>}
                          {status === 'wrong'   && <span className="text-red-400 text-xs ml-2 shrink-0">✗</span>}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </ScoringSection>
          )
        })
      })()}
    </>)}
    </>)}
  </div>
  )
}
