export const POINTS = {
  GROUP_POSITION: 1,
  GROUP_ADVANCING: 1,
  R32: 2,
  R16: 4,
  QF: 6,
  SF: 10,
  FINAL: 15,
} as const;

export type GroupResult = {
  group_code: string;
  first_place: string;
  second_place: string;
  third_place: string;
  fourth_place: string;
  third_advances: boolean;
};

export type KnockoutResult = {
  round: 'R32' | 'R16' | 'QF' | 'SF' | 'FINAL';
  match_index: number;
  winner: string;
};

export type BracketPicks = {
  group_picks: Record<string, { first_place: string; second_place: string; third_place: string; fourth_place: string }>;
  third_place_picks: string[];
  knockout_picks: Record<string, Record<number, string>>;
};

export function calculateGroupScore(picks: BracketPicks, results: GroupResult[]): number {
  let score = 0;
  for (const result of results) {
    const pick = picks.group_picks[result.group_code];
    if (!pick) continue;
    if (pick.first_place === result.first_place) {
      score += POINTS.GROUP_POSITION + POINTS.GROUP_ADVANCING;
    }
    if (pick.second_place === result.second_place) {
      score += POINTS.GROUP_POSITION + POINTS.GROUP_ADVANCING;
    }
    if (pick.third_place === result.third_place) {
      score += POINTS.GROUP_POSITION;
    }
    if (pick.fourth_place === result.fourth_place) {
      score += POINTS.GROUP_POSITION;
    }
    // Bonus for correctly picking 3rd place advances
    if (
      result.third_advances &&
      picks.third_place_picks.includes(result.third_place) &&
      pick.third_place === result.third_place
    ) {
      score += POINTS.GROUP_ADVANCING;
    }
  }
  return score;
}

/**
 * Compute the current earned score for a bracket given live results.
 * Returns total points earned so far.
 */
export function calculateCurrentScore(params: {
  groupPicks: { group_code: string; first_place: string; second_place: string; third_place: string; fourth_place: string }[]
  thirdPlacePicks: string[]
  knockoutPicks: { round: string; match_index: number; team_code: string }[]
  groupResults: GroupResult[]
  knockoutResults: { round: string; match_index: number; winner_code: string }[]
}): number {
  const { groupPicks, thirdPlacePicks, knockoutPicks, groupResults, knockoutResults } = params
  const groupResultMap = Object.fromEntries(groupResults.map(r => [r.group_code, r]))
  const winnersByRound: Record<string, Set<string>> = {}
  for (const r of knockoutResults) {
    if (!winnersByRound[r.round]) winnersByRound[r.round] = new Set()
    winnersByRound[r.round].add(r.winner_code)
  }

  let total = 0

  for (const pick of groupPicks) {
    const r = groupResultMap[pick.group_code]
    if (!r) continue
    // Placement points (exact position)
    if (pick.first_place  === r.first_place)  total += 1
    if (pick.second_place === r.second_place) total += 1
    if (pick.third_place  === r.third_place)  total += 1
    if (pick.fourth_place === r.fourth_place) total += 1
    // Advance points: team advanced via any route (1st, 2nd, or 3rd-place wildcard)
    for (const pos of ['first_place', 'second_place'] as const) {
      const code = pick[pos]
      if (r.first_place === code || r.second_place === code || (r.third_place === code && r.third_advances)) {
        total += 1
      }
    }
  }

  for (const code of thirdPlacePicks) {
    const groupCode = groupPicks.find(p =>
      [p.first_place, p.second_place, p.third_place, p.fourth_place].includes(code)
    )?.group_code
    const r = groupCode ? groupResultMap[groupCode] : undefined
    // Wildcard: award point if team advanced via any route
    if (r && (r.first_place === code || r.second_place === code || (r.third_place === code && r.third_advances))) {
      total += 1
    }
  }

  const pointMap: Record<string, number> = {
    R32: POINTS.R32, R16: POINTS.R16, QF: POINTS.QF, SF: POINTS.SF, FINAL: POINTS.FINAL,
  }
  for (const pick of knockoutPicks) {
    if (winnersByRound[pick.round]?.has(pick.team_code)) {
      total += pointMap[pick.round] || 0
    }
  }

  return total
}

// Total matches expected per round — used to detect partially-completed rounds
const ROUND_MATCH_COUNTS: Record<string, number> = { R32: 16, R16: 8, QF: 4, SF: 2, FINAL: 1 }

/**
 * Dynamic max potential = points already earned + points still winnable.
 * As results come in, pending picks stay eligible; wrong/missing picks drop off.
 *
 * A knockout pick is still winnable when:
 *  - The team already won that round (earned), OR
 *  - The round is not yet fully complete (some matches not played — team may still be in)
 * A pick is definitively lost only when the round is 100% complete and the team didn't win.
 */
export function calculateDynamicMax(params: {
  groupPicks: { group_code: string; first_place: string; second_place: string; third_place: string; fourth_place: string }[]
  thirdPlacePicks: string[]
  knockoutPicks: { round: string; match_index: number; team_code: string }[]
  groupResults: GroupResult[]
  knockoutResults: { round: string; match_index: number; winner_code: string }[]
}): number {
  const { groupPicks, thirdPlacePicks, knockoutPicks, groupResults, knockoutResults } = params
  const groupResultMap = Object.fromEntries(groupResults.map(r => [r.group_code, r]))

  const winnersByRound: Record<string, Set<string>> = {}
  const resultsCountByRound: Record<string, number> = {}
  for (const r of knockoutResults) {
    if (!winnersByRound[r.round]) winnersByRound[r.round] = new Set()
    winnersByRound[r.round].add(r.winner_code)
    resultsCountByRound[r.round] = (resultsCountByRound[r.round] || 0) + 1
  }

  let total = 0

  // Group stage: earned pts for correct picks; pending groups get full potential
  for (const pick of groupPicks) {
    const result = groupResultMap[pick.group_code]
    if (!result) {
      total += 6 // 4 position pts + 2 advance pts (1st+2nd) all still possible
    } else {
      if (pick.first_place  === result.first_place)  total += 2 // 1pt position + 1pt advance
      if (pick.second_place === result.second_place) total += 2
      if (pick.third_place  === result.third_place)  total += 1
      if (pick.fourth_place === result.fourth_place) total += 1
    }
  }

  // 3rd place wildcards: pending if group has no result or R32 hasn't started yet
  const r32Started = knockoutResults.some(r => r.round === 'R32')
  for (const code of thirdPlacePicks) {
    const groupCode = groupPicks.find(p =>
      [p.first_place, p.second_place, p.third_place, p.fourth_place].includes(code)
    )?.group_code
    const result = groupCode ? groupResultMap[groupCode] : undefined
    if (!result) {
      total += 1 // group not done — still possible
    } else if (result.first_place === code || result.second_place === code || (result.third_place === code && result.third_advances)) {
      total += 1 // earned (advanced via any route)
    } else if (result.third_place === code && !r32Started) {
      total += 1 // finished 3rd, wildcard decision not yet made
    }
    // else: definitively lost (not 3rd, or 3rd but R32 confirmed no advance)
  }

  // Knockout picks — check per match_index whether that specific match has been played
  const pointMap: Record<string, number> = {
    R32: POINTS.R32, R16: POINTS.R16, QF: POINTS.QF, SF: POINTS.SF, FINAL: POINTS.FINAL,
  }
  const PREV_ROUND: Record<string, string | null> = {
    R32: null, R16: 'R32', QF: 'R16', SF: 'QF', FINAL: 'SF',
  }
  // Track which specific matches (round + match_index) have a result
  const decidedMatches = new Set(knockoutResults.map(r => `${r.round}-${r.match_index}`))

  for (const pick of knockoutPicks) {
    const pts = pointMap[pick.round] || 0
    const won = winnersByRound[pick.round]?.has(pick.team_code)
    const thisMatchDecided = decidedMatches.has(`${pick.round}-${pick.match_index}`)

    // Eligibility: check if the team survived the previous round
    const prev = PREV_ROUND[pick.round]
    let eligible = true
    if (prev) {
      const won = winnersByRound[prev]?.has(pick.team_code)
      if (won) {
        eligible = true // definitely advanced
      } else {
        // Find this team's pick in the previous round to see if that specific match is decided
        const prevPick = knockoutPicks.find(p => p.round === prev && p.team_code === pick.team_code)
        if (prevPick) {
          const prevMatchDecided = decidedMatches.has(`${prev}-${prevPick.match_index}`)
          if (prevMatchDecided) eligible = false // their match was played and they lost
          // else: their specific prev match hasn't been played yet — still possible
        } else {
          // No prev pick for this team; fall back to round-complete check
          const prevComplete = (resultsCountByRound[prev] || 0) >= (ROUND_MATCH_COUNTS[prev] || Infinity)
          if (prevComplete) eligible = false
        }
      }
    }
    // R32 eligibility: team must have advanced from groups (when all groups are done)
    if (pick.round === 'R32' && groupResults.length > 0) {
      const allGroupsDone = groupPicks.every(p => groupResultMap[p.group_code])
      if (allGroupsDone) {
        const advanced = groupResults.some(r =>
          r.first_place === pick.team_code || r.second_place === pick.team_code ||
          (r.third_place === pick.team_code && r.third_advances)
        )
        if (!advanced) eligible = false
      }
    }

    if (!eligible) continue

    if (won) {
      total += pts // earned
    } else if (!thisMatchDecided) {
      total += pts // this specific match hasn't been played yet — still winnable
    }
    // else: this match was played and team didn't win → 0
  }

  return total
}

export function calculateKnockoutScore(
  picks: BracketPicks,
  results: KnockoutResult[]
): Record<string, number> {
  const scores: Record<string, number> = { R32: 0, R16: 0, QF: 0, SF: 0, FINAL: 0 };
  const pointMap = {
    R32: POINTS.R32,
    R16: POINTS.R16,
    QF: POINTS.QF,
    SF: POINTS.SF,
    FINAL: POINTS.FINAL,
  };

  for (const result of results) {
    const roundPicks = picks.knockout_picks[result.round];
    if (!roundPicks) continue;
    if (roundPicks[result.match_index] === result.winner) {
      scores[result.round] += pointMap[result.round];
    }
  }
  return scores;
}
