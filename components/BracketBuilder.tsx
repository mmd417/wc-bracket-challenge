'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GROUPS, TEAMS, getTeamsByGroup, type Team } from '@/lib/tournament-data'

type GroupPickRow = {
  group_code: string;
  first_place: string;
  second_place: string;
  third_place: string;
  fourth_place: string;
};

type KnockoutPickRow = {
  round: string;
  match_index: number;
  team_code: string;
};

type BracketRecord = {
  id: string;
  name: string;
  is_locked: boolean;
  total_score: number;
  user_id: string;
};

type GroupResult = {
  group_code: string;
  first_place: string;
  second_place: string;
  third_place: string;
  fourth_place: string;
  third_advances: boolean;
};

type KnockoutResult = {
  round: string;
  match_index: number;
  winner_code: string;
};

type Props = {
  userId: string;
  bracket: BracketRecord | null;
  initialGroupPicks?: GroupPickRow[];
  initialThirdPlacePicks?: string[];
  initialKnockoutPicks?: KnockoutPickRow[];
  groupResults?: GroupResult[];
  knockoutResults?: KnockoutResult[];
  readOnly?: boolean;
  onDone?: () => void;
  returnToGroup?: string;
};

const ROUND_COUNTS: Record<string, number> = { R32: 16, R16: 8, QF: 4, SF: 2, FINAL: 1 }
const ROUND_LABELS: Record<string, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-Finals',
  SF: 'Semi-Finals',
  FINAL: 'Final',
}
const ROUNDS = ['R32', 'R16', 'QF', 'SF', 'FINAL'] as const

const ROUND_PTS: Record<string, number> = { R32: 2, R16: 4, QF: 6, SF: 10, FINAL: 15 }

export default function BracketBuilder({
  userId,
  bracket,
  initialGroupPicks = [],
  initialThirdPlacePicks = [],
  initialKnockoutPicks = [],
  groupResults = [],
  knockoutResults = [],
  readOnly = false,
  onDone,
  returnToGroup,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<'group' | 'third_place' | 'knockout'>('group')
  const [bracketName, setBracketName] = useState(bracket?.name || 'My Bracket')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Group picks: group_code -> ordered array of team codes [1st, 2nd, 3rd, 4th]
  const [groupPicks, setGroupPicks] = useState<Record<string, string[]>>(() => {
    const picks: Record<string, string[]> = {}
    for (const g of GROUPS) {
      const saved = initialGroupPicks.find(p => p.group_code === g)
      if (saved) {
        picks[g] = [saved.first_place, saved.second_place, saved.third_place, saved.fourth_place]
      } else {
        picks[g] = []
      }
    }
    return picks
  })

  const [thirdPlacePicks, setThirdPlacePicks] = useState<string[]>(initialThirdPlacePicks)

  const [knockoutPicks, setKnockoutPicks] = useState<Record<string, Record<number, string>>>(() => {
    const picks: Record<string, Record<number, string>> = {}
    for (const kp of initialKnockoutPicks) {
      if (!picks[kp.round]) picks[kp.round] = {}
      picks[kp.round][kp.match_index] = kp.team_code
    }
    return picks
  })

  // Inline cascade: remove stale third picks whenever groupPicks changes
  // We do this by filtering thirdPlacePicks in the toggle functions directly
  function removeStaleThirdPicks(newGroupPicks: Record<string, string[]>) {
    const validCodes = new Set(
      GROUPS.filter(g => (newGroupPicks[g] || []).length >= 3).map(g => newGroupPicks[g][2])
    )
    setThirdPlacePicks(prev => {
      const next = prev.filter(c => validCodes.has(c))
      // If third picks changed, knockout picks may be stale — clear them all
      if (next.length !== prev.length) setKnockoutPicks({})
      return next
    })
    // Clear knockout picks if any group winner/runner-up changed (slot participants changed)
    setKnockoutPicks(prev => {
      const hasAnyPicks = Object.values(prev).some(m => Object.keys(m).length > 0)
      if (!hasAnyPicks) return prev
      // Check if any slot-sourced team in prev knockout picks is no longer a valid group winner/runner-up
      const winners = new Set(GROUPS.map(g => newGroupPicks[g]?.[0]).filter(Boolean))
      const runners = new Set(GROUPS.map(g => newGroupPicks[g]?.[1]).filter(Boolean))
      const validR32Teams = new Set([...winners, ...runners])
      // Add third-place teams that are still valid
      const validThird = new Set(
        GROUPS.filter(g => (newGroupPicks[g] || []).length >= 3).map(g => newGroupPicks[g][2])
      )
      for (const code of validThird) validR32Teams.add(code)
      // If any R32 pick is no longer a valid team, wipe knockout picks to avoid broken bracket
      const r32Picks = Object.values(prev['R32'] || {})
      if (r32Picks.some(code => !validR32Teams.has(code))) return {}
      return prev
    })
  }

  // Auto-assign 3rd-place teams to R32 slots using backtracking (guarantees valid assignment)
  function autoAssignThirdSlots(): Record<number, string> {
    const THIRD_SLOT_INDICES = [1, 4, 6, 7, 8, 9, 12, 14]
    const thirdByGroup: Record<string, string> = {}
    for (const g of GROUPS) {
      const code = groupPicks[g]?.[2]
      if (code && thirdPlacePicks.includes(code)) thirdByGroup[g] = code
    }

    // Build eligible team list per slot
    const slotEligible: Record<number, string[]> = {}
    for (const idx of THIRD_SLOT_INDICES) {
      const s2 = R32_MATCHES[idx][1]
      if (s2.type !== 'third') continue
      slotEligible[idx] = s2.eligibleGroups.filter(g => thirdByGroup[g]).map(g => thirdByGroup[g])
    }

    const assigned: Record<number, string> = {}
    const usedTeams = new Set<string>()

    function solve(slots: number[]): boolean {
      if (slots.length === 0) return true
      // Pick most constrained slot (fewest available options) first
      const sorted = [...slots].sort(
        (a, b) => slotEligible[a].filter(t => !usedTeams.has(t)).length
                - slotEligible[b].filter(t => !usedTeams.has(t)).length
      )
      const slot = sorted[0]
      const rest = sorted.slice(1)
      for (const teamCode of slotEligible[slot].filter(t => !usedTeams.has(t))) {
        assigned[slot] = teamCode
        usedTeams.add(teamCode)
        if (solve(rest)) return true
        delete assigned[slot]
        usedTeams.delete(teamCode)
      }
      return false
    }

    solve(THIRD_SLOT_INDICES)
    return assigned
  }

  // Result lookup helpers
  const groupResultMap = Object.fromEntries(groupResults.map(r => [r.group_code, r]))
  const knockoutResultMap: Record<string, Record<number, string>> = {}
  for (const r of knockoutResults) {
    if (!knockoutResultMap[r.round]) knockoutResultMap[r.round] = {}
    knockoutResultMap[r.round][r.match_index] = r.winner_code
  }

  function groupPositionResult(group: string, pos: number): 'correct' | 'wrong' | 'pending' {
    const result = groupResultMap[group]
    if (!result) return 'pending'
    const actual = [result.first_place, result.second_place, result.third_place, result.fourth_place][pos]
    const pick = (groupPicks[group] || [])[pos]
    if (!pick) return 'pending'
    return pick === actual ? 'correct' : 'wrong'
  }

  // Build set of actual winners per round for team-based scoring
  const winnersByRound: Record<string, Set<string>> = {}
  for (const result of knockoutResults) {
    if (!winnersByRound[result.round]) winnersByRound[result.round] = new Set()
    winnersByRound[result.round].add(result.winner_code)
  }

  function knockoutPickResult(round: string, matchIndex: number): 'correct' | 'wrong' | 'pending' {
    const pick = knockoutPicks[round]?.[matchIndex]
    if (!pick) return 'pending'
    const roundWinners = winnersByRound[round]
    if (!roundWinners) return 'pending'
    // Round has results — if pick is in the winners set, correct; otherwise wrong
    return roundWinners.has(pick) ? 'correct' : 'wrong'
  }

  function positionPoints(pos: number): number {
    // 1pt per correct position for all placements
    return 1
  }

  function advanceBonus(pos: number): number {
    // +1 advance bonus for correctly picking 1st or 2nd place (auto-advance to knockout)
    return pos === 0 || pos === 1 ? 1 : 0
  }

  function toggleTeamInGroup(group: string, teamCode: string) {
    if (readOnly) return
    setGroupPicks(prev => {
      const current = prev[group] || []
      let next: Record<string, string[]>
      if (current.includes(teamCode)) {
        next = { ...prev, [group]: current.filter(c => c !== teamCode) }
      } else if (current.length < 4) {
        next = { ...prev, [group]: [...current, teamCode] }
      } else {
        return prev
      }
      removeStaleThirdPicks(next)
      return next
    })
  }

  function removeFromGroup(group: string, teamCode: string) {
    if (readOnly) return
    setGroupPicks(prev => {
      const next = { ...prev, [group]: prev[group].filter(c => c !== teamCode) }
      removeStaleThirdPicks(next)
      return next
    })
  }

  const isGroupComplete = (group: string) => (groupPicks[group] || []).length === 4
  const allGroupsComplete = GROUPS.every(g => isGroupComplete(g))
  const completedGroupCount = GROUPS.filter(g => isGroupComplete(g)).length

  // Third-place teams derived from group picks
  const thirdPlaceTeams = GROUPS
    .filter(g => (groupPicks[g] || []).length >= 3)
    .map(g => ({ group: g, code: groupPicks[g][2] }))

  // Only count picks that are actually valid 3rd-place teams from current group picks
  const validThirdPickCodes = new Set(thirdPlaceTeams.map(t => t.code))
  const validThirdPicks = thirdPlacePicks.filter(c => validThirdPickCodes.has(c))

  function toggleThirdPlace(teamCode: string) {
    if (readOnly) return
    setThirdPlacePicks(prev => {
      if (prev.includes(teamCode)) {
        // Removing — cascade: clear knockout picks for this team
        setKnockoutPicks(kp => {
          const next: Record<string, Record<number, string>> = {}
          for (const [round, matches] of Object.entries(kp)) {
            next[round] = {}
            for (const [idx, code] of Object.entries(matches)) {
              if (code !== teamCode) next[round][parseInt(idx)] = code
            }
          }
          return next
        })
        return prev.filter(c => c !== teamCode)
      }
      if (prev.length >= 8) return prev
      return [...prev, teamCode]
    })
  }

  // Official 2026 WC R32 bracket structure
  type SlotDef =
    | { type: 'winner' | 'runner_up'; group: string }
    | { type: 'third'; eligibleGroups: string[] }

  const R32_MATCHES: [SlotDef, SlotDef][] = [
    [{ type: 'runner_up', group: 'A' }, { type: 'runner_up', group: 'B' }],
    [{ type: 'winner', group: 'E' }, { type: 'third', eligibleGroups: ['A','B','C','D','F'] }],
    [{ type: 'winner', group: 'F' }, { type: 'runner_up', group: 'C' }],
    [{ type: 'winner', group: 'C' }, { type: 'runner_up', group: 'F' }],
    [{ type: 'winner', group: 'I' }, { type: 'third', eligibleGroups: ['C','D','F','G','H'] }],
    [{ type: 'runner_up', group: 'E' }, { type: 'runner_up', group: 'I' }],
    [{ type: 'winner', group: 'A' }, { type: 'third', eligibleGroups: ['C','E','F','H','I'] }],
    [{ type: 'winner', group: 'L' }, { type: 'third', eligibleGroups: ['E','H','I','J','K'] }],
    [{ type: 'winner', group: 'D' }, { type: 'third', eligibleGroups: ['B','E','F','I','J'] }],
    [{ type: 'winner', group: 'G' }, { type: 'third', eligibleGroups: ['A','E','H','I','J'] }],
    [{ type: 'runner_up', group: 'K' }, { type: 'runner_up', group: 'L' }],
    [{ type: 'winner', group: 'H' }, { type: 'runner_up', group: 'J' }],
    [{ type: 'winner', group: 'B' }, { type: 'third', eligibleGroups: ['E','F','G','I','J'] }],
    [{ type: 'winner', group: 'J' }, { type: 'runner_up', group: 'H' }],
    [{ type: 'winner', group: 'K' }, { type: 'third', eligibleGroups: ['D','E','I','J','L'] }],
    [{ type: 'runner_up', group: 'D' }, { type: 'runner_up', group: 'G' }],
  ]

  // R16: pairs of R32 match indices
  const R16_PAIRS: [number, number][] = [
    [0, 2], [1, 4], [3, 5], [6, 7],
    [10, 11], [8, 9], [13, 15], [12, 14],
  ]
  // QF: pairs of R16 match indices
  const QF_PAIRS: [number, number][] = [[0, 1], [4, 5], [2, 3], [6, 7]]
  // SF: pairs of QF match indices
  const SF_PAIRS: [number, number][] = [[0, 1], [2, 3]]

  // Downstream cascade maps
  const R32_TO_R16: Record<number, number> = {}
  R16_PAIRS.forEach(([a, b], i) => { R32_TO_R16[a] = i; R32_TO_R16[b] = i })
  const R16_TO_QF: Record<number, number> = {}
  QF_PAIRS.forEach(([a, b], i) => { R16_TO_QF[a] = i; R16_TO_QF[b] = i })
  const QF_TO_SF: Record<number, number> = {}
  SF_PAIRS.forEach(([a, b], i) => { QF_TO_SF[a] = i; QF_TO_SF[b] = i })

  function getDownstream(round: string, matchIndex: number): Array<{ round: string; idx: number }> {
    const result: Array<{ round: string; idx: number }> = []
    if (round === 'R32') {
      const r16 = R32_TO_R16[matchIndex]
      if (r16 === undefined) return result
      result.push({ round: 'R16', idx: r16 })
      const qf = R16_TO_QF[r16]
      if (qf === undefined) return result
      result.push({ round: 'QF', idx: qf })
      const sf = QF_TO_SF[qf]
      if (sf === undefined) return result
      result.push({ round: 'SF', idx: sf })
      result.push({ round: 'FINAL', idx: 0 })
    } else if (round === 'R16') {
      const qf = R16_TO_QF[matchIndex]
      if (qf === undefined) return result
      result.push({ round: 'QF', idx: qf })
      const sf = QF_TO_SF[qf]
      if (sf === undefined) return result
      result.push({ round: 'SF', idx: sf })
      result.push({ round: 'FINAL', idx: 0 })
    } else if (round === 'QF') {
      const sf = QF_TO_SF[matchIndex]
      if (sf === undefined) return result
      result.push({ round: 'SF', idx: sf })
      result.push({ round: 'FINAL', idx: 0 })
    } else if (round === 'SF') {
      result.push({ round: 'FINAL', idx: 0 })
    }
    return result
  }

  function resolveSlot(slot: SlotDef, matchIndex?: number): string | null {
    if (slot.type === 'winner') return groupPicks[slot.group]?.[0] ?? null
    if (slot.type === 'runner_up') return groupPicks[slot.group]?.[1] ?? null
    if (slot.type === 'third' && matchIndex !== undefined) return autoAssignThirdSlots()[matchIndex] ?? null
    return null
  }

  function slotLabel(slot: SlotDef): string {
    if (slot.type === 'winner') return `1st Group ${slot.group}`
    if (slot.type === 'runner_up') return `2nd Group ${slot.group}`
    if (slot.type === 'third') return `3rd (${slot.eligibleGroups.join('/')})`
    return 'TBD'
  }

  function setKnockoutPick(round: string, matchIndex: number, teamCode: string) {
    if (readOnly) return
    setKnockoutPicks(prev => {
      const next: Record<string, Record<number, string>> = {}
      for (const [r, matches] of Object.entries(prev)) {
        next[r] = { ...matches }
      }
      if (!next[round]) next[round] = {}
      next[round][matchIndex] = teamCode
      // Clear downstream picks
      for (const { round: dr, idx } of getDownstream(round, matchIndex)) {
        if (next[dr]?.[idx]) {
          next[dr] = { ...next[dr] }
          delete next[dr][idx]
        }
      }
      return next
    })
  }

  function getMatchParticipants(round: string, matchIndex: number): [string | null, string | null] {
    if (round === 'R32') {
      const [s1, s2] = R32_MATCHES[matchIndex]
      return [resolveSlot(s1, matchIndex), resolveSlot(s2, matchIndex)]
    }
    const pairMap: Record<string, [number, number][]> = {
      R16: R16_PAIRS, QF: QF_PAIRS, SF: SF_PAIRS,
    }
    const pairs = pairMap[round]
    if (round === 'FINAL') {
      return [knockoutPicks['SF']?.[0] ?? null, knockoutPicks['SF']?.[1] ?? null]
    }
    const prevRound = round === 'R16' ? 'R32' : round === 'QF' ? 'R16' : 'QF'
    const [a, b] = pairs[matchIndex]
    return [knockoutPicks[prevRound]?.[a] ?? null, knockoutPicks[prevRound]?.[b] ?? null]
  }

  function getMatchLabel(round: string, matchIndex: number): string {
    if (round === 'R32') {
      const [s1, s2] = R32_MATCHES[matchIndex]
      return `${slotLabel(s1)} vs ${slotLabel(s2)}`
    }
    return `Match ${matchIndex + 1}`
  }

  function getTeamObj(code: string | null): Team | undefined {
    if (!code) return undefined
    return TEAMS.find(t => t.code === code)
  }

  function calculateMaxPotential(): number {
    const ROUND_PTS: Record<string, number> = { R32: 2, R16: 4, QF: 6, SF: 10, FINAL: 15 }
    let max = 0
    for (const g of GROUPS) {
      if (isGroupComplete(g)) max += 4 + 2 // 4 position pts + 2 advancing pts
    }
    max += thirdPlacePicks.length // 1pt per 3rd place advancing pick
    for (const [round, picks] of Object.entries(knockoutPicks)) {
      max += Object.keys(picks).length * (ROUND_PTS[round] || 0)
    }
    return max
  }

  async function saveBracket() {
    const allGroupsFilled = GROUPS.every(g => isGroupComplete(g))
    const totalKnockoutPicks = Object.values(knockoutPicks).reduce((sum, matches) => sum + Object.keys(matches).length, 0)
    const bracketIsComplete = allGroupsFilled && validThirdPicks.length > 0 && totalKnockoutPicks > 0
    if (!bracketIsComplete) {
      const proceed = window.confirm('Your bracket is incomplete. You can save now and finish it later — just make sure to complete it before the tournament starts!')
      if (!proceed) return
    }
    setSaving(true)
    setError('')
    try {
      const maxPotential = calculateMaxPotential()
      let bracketId = bracket?.id
      if (!bracketId) {
        const { data, error: insertError } = await supabase
          .from('brackets')
          .insert({ user_id: userId, name: bracketName, max_potential: maxPotential, is_complete: false })
          .select()
          .single()
        if (insertError) throw insertError
        bracketId = data.id
      } else {
        await supabase.from('brackets').update({ name: bracketName, max_potential: maxPotential }).eq('id', bracketId)
      }

      // Save group picks — delete all first so resets are persisted
      await supabase.from('group_picks').delete().eq('bracket_id', bracketId)
      const groupPickRows = GROUPS
        .filter(g => isGroupComplete(g))
        .map(g => ({
          bracket_id: bracketId,
          group_code: g,
          first_place: groupPicks[g][0],
          second_place: groupPicks[g][1],
          third_place: groupPicks[g][2],
          fourth_place: groupPicks[g][3],
        }))
      if (groupPickRows.length > 0) {
        await supabase.from('group_picks').insert(groupPickRows)
      }

      // Save third place picks
      await supabase.from('third_place_picks').delete().eq('bracket_id', bracketId)
      if (thirdPlacePicks.length > 0) {
        await supabase.from('third_place_picks').insert(
          thirdPlacePicks.map(code => ({ bracket_id: bracketId, team_code: code }))
        )
      }

      // Save knockout picks — delete all first so resets are persisted
      await supabase.from('knockout_picks').delete().eq('bracket_id', bracketId)
      const knockoutRows: { bracket_id: string; round: string; match_index: number; team_code: string }[] = []
      for (const [round, matches] of Object.entries(knockoutPicks)) {
        for (const [matchIndexStr, teamCode] of Object.entries(matches)) {
          knockoutRows.push({
            bracket_id: bracketId!,
            round,
            match_index: parseInt(matchIndexStr),
            team_code: teamCode,
          })
        }
      }
      if (knockoutRows.length > 0) {
        await supabase.from('knockout_picks').insert(knockoutRows)
      }

      // Mark bracket complete if all groups + knockout picks are filled
      const allGroupsFilled2 = GROUPS.every(g => isGroupComplete(g))
      const totalExpectedKnockout = Object.values(ROUND_COUNTS).reduce((a, b) => a + b, 0)
      const isComplete = allGroupsFilled2 && validThirdPicks.length === 8 && knockoutRows.length === totalExpectedKnockout
      await supabase.from('brackets').update({ is_complete: isComplete, last_edited_at: new Date().toISOString() }).eq('id', bracketId)

      if (onDone) {
        onDone()
      } else if (returnToGroup && bracketId) {
        // Auto-enter this bracket into the group, then redirect back
        const { error: entryError } = await supabase.from('group_bracket_entries').insert({
          group_id: returnToGroup,
          bracket_id: bracketId,
          user_id: userId,
        })
        if (entryError && entryError.code !== '23505') throw entryError // ignore duplicate
        router.push(`/groups/${returnToGroup}`)
        router.refresh()
      } else {
        router.push(`/brackets/${bracketId}`)
        router.refresh()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (err as any)?.message || (err as any)?.details || (err as any)?.hint || JSON.stringify(err) || 'An error occurred'
      setError(msg)
    }
    setSaving(false)
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3 mb-2">
          {readOnly ? (
            <h1 className="text-xl sm:text-2xl font-bold">{bracketName}</h1>
          ) : (
            <input
              type="text"
              value={bracketName}
              onChange={e => setBracketName(e.target.value)}
              className="text-xl sm:text-2xl font-bold bg-transparent border-b border-gray-600 focus:border-yellow-400 outline-none min-w-0 flex-1"
            />
          )}
          {readOnly && (
            <span className="text-xs bg-gray-700 text-gray-400 px-2 py-1 rounded shrink-0">Read Only</span>
          )}
          {!readOnly && (
            <button
              onClick={saveBracket}
              disabled={saving}
              className="shrink-0 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 text-black font-bold rounded-lg transition-colors text-sm sm:text-base"
            >
              {saving ? 'Saving...' : 'Save Bracket'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300">
          {error}
        </div>
      )}

      {/* Step tabs */}
      <div className="flex mb-6 border-b border-gray-800 overflow-x-auto">
        {(['group', 'third_place', 'knockout'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
              step === s
                ? 'border-yellow-400 text-yellow-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {s === 'group'
              ? `Group Stage ${allGroupsComplete ? '✓' : `(${completedGroupCount}/12)`}`
              : s === 'third_place'
              ? `3rd Place Wildcards ${validThirdPicks.length === 8 ? '✓' : `(${validThirdPicks.length}/8)`}`
              : 'Knockout Bracket'}
          </button>
        ))}
      </div>

      {/* ── Group Stage ── */}
      {step === 'group' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <p className="text-gray-400 text-sm">
              Click teams in the order you think they will finish (1st → 4th). 1st and 2nd place
              teams advance automatically.
            </p>
            {!readOnly && (
              <button
                onClick={() => {
                  if (window.confirm('Reset all group stage picks?')) {
                    const empty: Record<string, string[]> = {}
                    for (const g of GROUPS) empty[g] = []
                    setGroupPicks(empty)
                  }
                }}
                className="ml-4 shrink-0 text-xs text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 px-3 py-1.5 rounded-lg transition-colors"
              >
                Reset picks
              </button>
            )}
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {GROUPS.map(g => {
              const teams = getTeamsByGroup(g)
              const picks = groupPicks[g] || []
              return (
                <div key={g} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-lg text-yellow-400">Group {g}</h3>
                    {groupResultMap[g] && (() => {
                      const pts = [0,1,2,3].reduce((sum, i) => {
                        return groupPositionResult(g, i) === 'correct' ? sum + positionPoints(i) + advanceBonus(i) : sum
                      }, 0)
                      return <span className="text-sm font-bold text-yellow-400">+{pts}pts</span>
                    })()}
                  </div>
                  {groupResultMap[g] && (
                    <div className="text-xs text-gray-500 mb-3 flex gap-1 flex-wrap">
                      <span>Actual:</span>
                      {[groupResultMap[g].first_place, groupResultMap[g].second_place, groupResultMap[g].third_place, groupResultMap[g].fourth_place].map((code, i) => {
                        const t = TEAMS.find(x => x.code === code)
                        return t ? <span key={i}>{t.flag} {t.name}{i < 3 ? ' ·' : ''}</span> : null
                      })}
                    </div>
                  )}

                  {/* Ranking slots */}
                  <div className="space-y-1 mb-4">
                    {(['1st', '2nd', '3rd', '4th'] as const).map((pos, i) => {
                      const teamCode = picks[i]
                      const team = teamCode ? TEAMS.find(t => t.code === teamCode) : null
                      const resultStatus = groupPositionResult(g, i)
                      const earnedPts = resultStatus === 'correct' ? positionPoints(i) + advanceBonus(i) : 0
                      return (
                        <div
                          key={pos}
                          className={`flex items-center gap-2 p-2 rounded-lg border ${
                            resultStatus === 'correct'
                              ? 'bg-green-900/30 border-green-600/50'
                              : resultStatus === 'wrong'
                              ? 'bg-red-900/20 border-red-800/40'
                              : i < 2
                              ? 'bg-green-900/20 border-green-800/30'
                              : 'bg-gray-700/50 border-transparent'
                          }`}
                        >
                          <span className="text-xs text-gray-400 w-6">{pos}</span>
                          {team ? (
                            <div className="flex items-center gap-2 flex-1">
                              <span>{team.flag}</span>
                              <span className="text-sm font-medium">{team.name}</span>
                              {resultStatus === 'correct' && (
                                <span className="ml-auto text-xs text-green-400 font-bold">✓ +{earnedPts}pts</span>
                              )}
                              {resultStatus === 'wrong' && (
                                <span className="ml-auto text-xs text-red-400">✗</span>
                              )}
                              {resultStatus === 'pending' && !readOnly && (
                                <button
                                  onClick={() => removeFromGroup(g, teamCode)}
                                  className="ml-auto text-gray-500 hover:text-red-400 text-xs"
                                >✕</button>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-500 text-xs italic">Not selected</span>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Team buttons */}
                  {!readOnly && (
                    <div className="space-y-1">
                      {teams.map(team => {
                        const selected = picks.includes(team.code)
                        const rank = picks.indexOf(team.code)
                        return (
                          <button
                            key={team.code}
                            onClick={() => toggleTeamInGroup(g, team.code)}
                            disabled={selected}
                            className={`w-full flex items-center gap-2 p-2 rounded-lg text-sm transition-colors ${
                              selected
                                ? 'bg-gray-700/30 text-gray-500 cursor-default'
                                : 'bg-gray-700 hover:bg-gray-600 text-white'
                            }`}
                          >
                            <span>{team.flag}</span>
                            <span>{team.name}</span>
                            {selected && (
                              <span className="ml-auto text-xs text-gray-500">#{rank + 1}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {!readOnly && allGroupsComplete && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setStep('third_place')}
                className="px-8 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors"
              >
                Next: Pick 3rd Place Wildcards →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Third Place Picks ── */}
      {step === 'third_place' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">
              In 2026, the 8 best 3rd-place teams advance to the Round of 32. Select which 8 of the
              12 third-place teams you think will qualify.
            </p>
            {!readOnly && (
              <button
                onClick={() => {
                  if (window.confirm('Reset all 3rd place wildcard picks?')) setThirdPlacePicks([])
                }}
                className="ml-4 shrink-0 text-xs text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 px-3 py-1.5 rounded-lg transition-colors"
              >
                Reset picks
              </button>
            )}
          </div>
          <p className="text-sm text-yellow-400 mb-6">
            Selected: {validThirdPicks.length} / 8
          </p>

          {thirdPlaceTeams.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              Complete the group stage first to see 3rd place teams.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {thirdPlaceTeams.map(({ group, code }) => {
                const team = TEAMS.find(t => t.code === code)
                if (!team) return null
                const selected = thirdPlacePicks.includes(code)
                const disabled = !readOnly && !selected && thirdPlacePicks.length >= 8
                return (
                  <button
                    key={code}
                    onClick={() => toggleThirdPlace(code)}
                    disabled={disabled || readOnly}
                    className={`flex items-center gap-3 p-4 rounded-xl border transition-colors text-left ${
                      selected
                        ? 'bg-green-900/40 border-green-600 text-white'
                        : disabled
                        ? 'bg-gray-800/30 border-gray-700/50 text-gray-600 cursor-not-allowed'
                        : 'bg-gray-800 border-gray-700 hover:border-gray-500 text-white'
                    }`}
                  >
                    <span className="text-2xl">{team.flag}</span>
                    <div>
                      <div className="font-medium">{team.name}</div>
                      <div className="text-xs text-gray-400">Group {group} · 3rd place</div>
                    </div>
                    {selected && <span className="ml-auto text-green-400">✓</span>}
                  </button>
                )
              })}
            </div>
          )}

          {!readOnly && validThirdPicks.length === 8 && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setStep('knockout')}
                className="px-8 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors"
              >
                Next: Knockout Bracket →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Knockout Bracket ── */}
      {step === 'knockout' && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <p className="text-gray-400 text-sm">
              Pick the winner of each match. Your selections auto-populate the next round.
            </p>
            {!readOnly && (
              <button
                onClick={() => {
                  if (window.confirm('Reset all knockout bracket picks?')) setKnockoutPicks({})
                }}
                className="ml-4 shrink-0 text-xs text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 px-3 py-1.5 rounded-lg transition-colors"
              >
                Reset picks
              </button>
            )}
          </div>

          {ROUNDS.map(round => {
            const count = ROUND_COUNTS[round]
            const prevRoundMap: Record<string, string> = {
              R16: 'R32',
              QF: 'R16',
              SF: 'QF',
              FINAL: 'SF',
            }
            const prevRound = prevRoundMap[round]
            const prevComplete =
              !prevRound ||
              Object.keys(knockoutPicks[prevRound] || {}).length >= ROUND_COUNTS[prevRound]

            return (
              <div key={round} className="mb-8">
                <h3 className="text-lg font-bold mb-4 text-yellow-400">{ROUND_LABELS[round]}</h3>

                {!prevComplete && round !== 'R32' && (
                  <p className="text-gray-500 text-sm italic">
                    Complete the previous round first.
                  </p>
                )}

                <div
                  className={`grid gap-3 ${
                    count > 4
                      ? 'md:grid-cols-2 lg:grid-cols-4'
                      : count > 2
                      ? 'md:grid-cols-2'
                      : 'max-w-sm'
                  }`}
                >
                  {Array.from({ length: count }).map((_, matchIndex) => {
                    const [team1Code, team2Code] = getMatchParticipants(round, matchIndex)
                    const team1 = getTeamObj(team1Code)
                    const team2 = getTeamObj(team2Code)
                    const picked = knockoutPicks[round]?.[matchIndex]

                    return (
                      <div
                        key={matchIndex}
                        className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden"
                      >
                        <div className="text-xs text-gray-500 px-3 pt-2">
                          {getMatchLabel(round, matchIndex)}
                        </div>
                        {[team1, team2].map((team, ti) => {
                          if (!team) {
                            return (
                              <div
                                key={ti}
                                className={`px-3 py-2 text-gray-600 text-sm italic ${
                                  ti === 0 ? 'border-b border-gray-700' : ''
                                }`}
                              >
                                TBD
                              </div>
                            )
                          }
                          const isSelected = picked === team.code
                          const isActualWinner = winnersByRound[round]?.has(team.code) ?? false
                          const roundHasResult = !!winnersByRound[round]
                          const resultStatus = roundHasResult
                            ? (isSelected && isActualWinner ? 'correct' : isSelected && !isActualWinner ? 'wrong' : isActualWinner ? 'actual' : 'none')
                            : 'none'
                          return (
                            <button
                              key={team.code}
                              onClick={() => setKnockoutPick(round, matchIndex, team.code)}
                              disabled={readOnly}
                              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                                resultStatus === 'correct' ? 'bg-green-800/60 text-green-200 font-bold' :
                                resultStatus === 'wrong' ? 'bg-red-900/40 text-red-300 line-through' :
                                resultStatus === 'actual' ? 'bg-gray-700 text-gray-300' :
                                isSelected ? 'bg-yellow-500 text-black font-bold' :
                                'hover:bg-gray-700 text-white'
                              } ${ti === 0 ? 'border-b border-gray-700' : ''}`}
                            >
                              <span>{team.flag}</span>
                              <span>{team.name}</span>
                              <span className="ml-auto text-xs">
                                {resultStatus === 'correct' && `✓ +${ROUND_PTS[round]}pts`}
                                {resultStatus === 'wrong' && '✗'}
                                {resultStatus === 'actual' && '← actual'}
                                {resultStatus === 'none' && isSelected && '✓'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {!readOnly && (
            <div className="text-center mt-8">
              <button
                onClick={saveBracket}
                disabled={saving}
                className="px-8 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 text-black font-bold rounded-lg text-lg transition-colors"
              >
                {saving ? 'Saving...' : '💾 Save Bracket'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
