'use client'
import { useState } from 'react'
import { GROUPS, TEAMS } from '@/lib/tournament-data'
import { calculateDynamicMax } from '@/lib/scoring'
import BracketBuilder from './BracketBuilder'

type GroupPickRow = { group_code: string; first_place: string; second_place: string; third_place: string; fourth_place: string }
type KnockoutPickRow = { round: string; match_index: number; team_code: string }
type GroupResult = { group_code: string; first_place: string; second_place: string; third_place: string; fourth_place: string; third_advances: boolean }
type KnockoutResult = { round: string; match_index: number; winner_code: string }

type Props = {
  userId: string
  bracket: any
  initialGroupPicks: GroupPickRow[]
  initialThirdPlacePicks: string[]
  initialKnockoutPicks: KnockoutPickRow[]
  groupResults: GroupResult[]
  knockoutResults: KnockoutResult[]
  canEdit: boolean
}

const ROUND_ORDER = ['R32', 'R16', 'QF', 'SF', 'FINAL'] as const
const ROUND_PTS: Record<string, number> = { R32: 2, R16: 4, QF: 6, SF: 10, FINAL: 15 }

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
  initialKnockoutPicks, groupResults, knockoutResults, canEdit,
}: Props) {
  const [editing, setEditing] = useState(false)

  const groupResultMap = Object.fromEntries(groupResults.map(r => [r.group_code, r]))
  const winnersByRound: Record<string, Set<string>> = {}
  for (const r of knockoutResults) {
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
    if (pick.first_place  === r.first_place)  { placementEarned += 1; advanceEarned += 1 }
    if (pick.second_place === r.second_place)  { placementEarned += 1; advanceEarned += 1 }
    if (pick.third_place  === r.third_place)   placementEarned += 1
    if (pick.fourth_place === r.fourth_place)  placementEarned += 1
  }
  for (const code of initialThirdPlacePicks) {
    const t = team(code)
    const groupResult = t ? groupResultMap[t.group] : undefined
    if (groupResult?.third_place === code && groupResult?.third_advances) advanceEarned += 1
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
    knockoutResults,
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
        knockoutResults={knockoutResults}
        readOnly={false}
        onDone={() => setEditing(false)}
      />
    )
  }

  const hasGroupResults = groupResults.length > 0

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{bracket?.name}</h1>
          <div className="mt-1">
            <span className="text-2xl font-bold text-yellow-400">{totalEarned} pts</span>
            {dynamicMaxPotential > totalEarned && (
              <div className="text-sm text-gray-400 mt-0.5">
                Max potential: <span className="text-green-400 font-medium">{dynamicMaxPotential} pts</span>
              </div>
            )}
          </div>
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

          for (const pos of ['first_place', 'second_place'] as const) {
            for (const g of GROUPS) {
              const pick = initialGroupPicks.find(p => p.group_code === g)
              if (!pick) continue
              const code = pick[pos]
              const result = groupResultMap[g]
              const status = !result ? 'pending' : code === result[pos] ? 'correct' : 'wrong'
              advancePicks.push({ code, status })
            }
          }

          for (const code of initialThirdPlacePicks) {
            const t = team(code)
            // Look up by the team's group, not by third_place column
            const groupResult = t ? groupResultMap[t.group] : undefined
            const hasResult = !!groupResult
            const advances = groupResult?.third_place === code && groupResult?.third_advances
            const status = !hasResult ? 'pending' : advances ? 'correct' : 'wrong'
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
        const decidedMatchKeys = new Set(knockoutResults.map(r => `${r.round}-${r.match_index}`))

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
          const prevResultCount = knockoutResults.filter(r => r.round === prev).length
          return prevResultCount >= (ROUND_MATCH_COUNTS[prev] || Infinity)
        }

        return ROUND_ORDER.map(round => {
          const picks = knockoutByRound[round] || []
          const section = ROUND_SECTIONS[round]
          const pts = ROUND_PTS[round]
          const earned = knockoutEarned[round] || 0

          // Per-pick status: correct, wrong (lost or eliminated), or pending
          const pickStatuses = picks.map(code => {
            const won = winnersByRound[round]?.has(code)
            if (won) return 'correct' as const
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
    </div>
  )
}
