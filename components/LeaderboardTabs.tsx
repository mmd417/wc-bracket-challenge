'use client'
import { useState } from 'react'
import Link from 'next/link'
import { GROUPS as GroupsType } from '@/lib/tournament-data'

type BracketRow = {
  rank: number
  name: string
  displayName: string
  score: number
  bracketId: string
  isMe: boolean
  percentile: number
}

type PosPct = { first: number; second: number; third: number; fourth: number; total: number }

type Props = {
  top25: BracketRow[]
  myBrackets: BracketRow[]
  total: number
  allScores: number[]
  myScores: number[]
  teamStats: Record<string, PosPct>
  picks: any[]
  groups: string[]
  teams: any[]
  groupOdds: Record<string, { odds: string; impliedProb: number }>
}

function pct(n: number, total: number) {
  if (!total) return 0
  return Math.round((n / total) * 100)
}

function RankBadge({ rank }: { rank: number }) {
  const base = 'w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0'
  if (rank === 1) return <div className={`${base} bg-yellow-500 text-black`}>1</div>
  if (rank === 2) return <div className={`${base} bg-gray-400 text-black`}>2</div>
  if (rank === 3) return <div className={`${base} bg-amber-700 text-white`}>3</div>
  return <div className={`${base} bg-gray-800 text-gray-400 border border-gray-700`}>{rank}</div>
}

function BracketEntry({ b }: { b: BracketRow }) {
  return (
    <Link href={`/brackets/${b.bracketId}`} className={`flex items-center gap-3 px-4 py-2 hover:bg-gray-700/50 transition-colors ${b.isMe ? 'bg-yellow-500/5 border-l-2 border-yellow-500' : ''}`}>
      <RankBadge rank={b.rank} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-white truncate">{b.displayName}</span>
          {b.isMe && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded font-medium shrink-0">you</span>}
        </div>
        <div className="text-xs text-gray-500 truncate">{b.name}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-bold text-sm text-white tabular-nums">{b.score} pts</div>
        <div className="text-[10px] text-gray-500 tabular-nums">top {b.percentile}%</div>
      </div>
    </Link>
  )
}

function ScoreHistogram({ allScores, myScores }: { allScores: number[]; myScores: number[] }) {
  if (allScores.length === 0) return null

  const min = Math.min(...allScores)
  const max = Math.max(...allScores)

  // Build buckets — 1 pt wide when range is small, wider when range grows
  const range = max - min
  const bucketSize = range <= 20 ? 1 : range <= 60 ? 2 : 5
  const bucketCount = Math.floor((max - min) / bucketSize) + 1
  const buckets: number[] = Array(bucketCount).fill(0)
  for (const s of allScores) {
    buckets[Math.floor((s - min) / bucketSize)]++
  }
  const peakCount = Math.max(...buckets)
  const mySet = new Set(myScores)

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl px-5 pt-4 pb-3 mb-6">
      <p className="text-xs text-gray-400 mb-3 font-medium">Score distribution · <span className="text-gray-500">{allScores.length.toLocaleString()} brackets</span></p>
      <div className="flex items-end gap-0.5" style={{ height: 80 }}>
        {buckets.map((count, i) => {
          const label = min + i * bucketSize
          const hasMe = mySet.has(label) || (bucketSize > 1 && myScores.some(s => Math.floor((s - min) / bucketSize) === i))
          const heightPx = peakCount > 0 ? Math.max((count / peakCount) * 80, 2) : 2
          return (
            <div
              key={i}
              className={`flex-1 rounded-sm transition-all ${hasMe ? 'bg-yellow-400' : 'bg-gray-600 hover:bg-gray-500'}`}
              style={{ height: heightPx }}
              title={`${label}${bucketSize > 1 ? `–${label + bucketSize - 1}` : ''} pts: ${count.toLocaleString()} brackets`}
            />
          )
        })}
      </div>
      {/* x-axis labels: just show min, mid, max */}
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] text-gray-600">{min} pts</span>
        {bucketCount > 2 && <span className="text-[10px] text-gray-600">{Math.round((min + max) / 2)} pts</span>}
        <span className="text-[10px] text-gray-600">{max} pts</span>
      </div>
      {myScores.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2">
          <div className="w-2.5 h-2.5 rounded-sm bg-yellow-400 shrink-0" />
          <span className="text-[10px] text-gray-500">your bracket{myScores.length > 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  )
}

export default function LeaderboardTabs({ top25, myBrackets, total, allScores, myScores, teamStats, picks, groups, teams, groupOdds }: Props) {
  const [tab, setTab] = useState<'leaderboard' | 'predictions'>('leaderboard')

  return (
    <main className="max-w-7xl mx-auto p-4 sm:p-6">
      {/* Tabs */}
      <div className="flex gap-0 mb-8 border border-gray-700 rounded-lg overflow-hidden w-fit">
        <button
          onClick={() => setTab('leaderboard')}
          className={`px-5 py-2 text-sm font-medium transition-colors ${tab === 'leaderboard' ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'}`}
        >
          🏆 Leaderboard
        </button>
        <button
          onClick={() => setTab('predictions')}
          className={`px-5 py-2 text-sm font-medium transition-colors border-l border-gray-700 ${tab === 'predictions' ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'}`}
        >
          📊 Predictions
        </button>
      </div>

      {/* ── Leaderboard Tab ───────────────────────────────────── */}
      {tab === 'leaderboard' && (
        <div className="max-w-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Overall Leaderboard</h1>
            <p className="text-gray-400 text-sm mt-1">
              <span className="text-white font-semibold">{total.toLocaleString()}</span> completed brackets
            </p>
          </div>

          <ScoreHistogram allScores={allScores} myScores={myScores} />

          <div className="bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden">
            {top25.length === 0 ? (
              <p className="text-gray-500 text-sm italic p-6">No completed brackets yet.</p>
            ) : (
              <div className="divide-y divide-gray-700/50">
                {top25.map(b => <BracketEntry key={b.bracketId} b={b} />)}
              </div>
            )}

            {myBrackets.length > 0 && (
              <>
                <div className="px-4 py-2 bg-gray-900/50 border-t border-gray-700 text-xs text-gray-500 text-center">
                  · · · your bracket{myBrackets.length > 1 ? 's' : ''} · · ·
                </div>
                <div className="divide-y divide-gray-700/50">
                  {myBrackets.map(b => <BracketEntry key={b.bracketId} b={b} />)}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Predictions Tab ───────────────────────────────────── */}
      {tab === 'predictions' && (
        <div>
          <div className="mb-8">
            <h1 className="text-3xl font-bold">Group Stage Predictions</h1>
            <p className="text-gray-400 mt-1 text-sm">
              Based on <span className="text-white font-semibold">{total.toLocaleString()}</span> completed brackets · % columns show how many brackets picked each team to finish in that position · Sorted by odds to win group
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groups.map(g => {
              const groupTeams = teams.filter((t: any) => t.group === g)
              const sorted = [...groupTeams].sort((a: any, b: any) => {
                const aProb = groupOdds[a.code]?.impliedProb ?? 0
                const bProb = groupOdds[b.code]?.impliedProb ?? 0
                return bProb - aProb
              })
              const groupPickCount = picks.filter((p: any) => p.group_code === g).length

              return (
                <div key={g} className="bg-gray-800/60 border border-gray-700 rounded-2xl overflow-hidden">
                  <div className="bg-gray-700/40 px-4 py-3 border-b border-gray-700">
                    <h2 className="font-bold text-yellow-400 text-sm tracking-wide uppercase">Group {g}</h2>
                  </div>
                  <div className="flex items-end gap-x-2 px-4 pt-2 pb-1 border-b border-gray-700/50">
                    <div className="flex-1 min-w-0 text-xs text-gray-500 uppercase tracking-wide">Team</div>
                    <div className="w-12 flex flex-col items-end shrink-0">
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Odds</span>
                      <span className="text-[10px] text-gray-600 leading-tight whitespace-nowrap">to win group</span>
                    </div>
                    <div className="flex flex-col items-center shrink-0">
                      <span className="text-[10px] text-gray-600 leading-tight">% of brackets</span>
                      <div className="flex gap-x-2">
                        {['1st','2nd','3rd','4th'].map(l => (
                          <span key={l} className="w-8 text-xs text-gray-500 uppercase tracking-wide text-right">{l}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-700/30">
                    {sorted.map((team: any, i: number) => {
                      const stats = teamStats[team.code]
                      const firstPct  = pct(stats?.first  ?? 0, groupPickCount)
                      const secondPct = pct(stats?.second ?? 0, groupPickCount)
                      const thirdPct  = pct(stats?.third  ?? 0, groupPickCount)
                      const fourthPct = pct(stats?.fourth ?? 0, groupPickCount)
                      const odds = groupOdds[team.code]
                      return (
                        <div key={team.code} className={`flex items-center gap-x-2 px-4 py-2.5 ${i === 0 ? 'bg-yellow-500/5' : ''}`}>
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span className="text-base leading-none shrink-0">{team.flag}</span>
                            <span className="truncate text-white text-xs font-medium">{team.name}</span>
                          </div>
                          <div className={`w-12 text-right text-xs font-semibold tabular-nums shrink-0 ${odds?.odds.startsWith('-') ? 'text-green-400' : 'text-gray-300'}`}>
                            {odds?.odds ?? '—'}
                          </div>
                          {[firstPct, secondPct, thirdPct, fourthPct].map((p, pi) => (
                            <div key={pi} className="w-8 text-right shrink-0">
                              <span className={`text-xs tabular-nums font-medium ${p >= 50 ? 'text-yellow-400' : p >= 25 ? 'text-white' : p > 0 ? 'text-gray-400' : 'text-gray-600'}`}>
                                {groupPickCount > 0 ? `${p}%` : '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                  <div className="px-4 pb-3 pt-1">
                    <div className="flex gap-0.5 h-1.5 rounded-full overflow-hidden">
                      {sorted.map((team: any) => {
                        const stats = teamStats[team.code]
                        const p = pct(stats?.first ?? 0, groupPickCount)
                        return <div key={team.code} style={{ width: `${p}%` }} className="bg-yellow-500/60 transition-all" title={`${team.name}: ${p}% picked 1st`} />
                      })}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">% of brackets picking each team 1st</p>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-center text-xs text-gray-600 mt-8">
            Odds are approximate and for reference only. Bracket percentages based on completed brackets only.
          </p>
        </div>
      )}
    </main>
  )
}
