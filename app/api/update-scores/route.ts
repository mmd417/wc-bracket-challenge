import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStandings, getMatches } from '@/lib/football-data'

// Called by cron job every 30 min once tournament starts.
// Secured via Bearer token matching CRON_SECRET env var.
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = await createClient()
    const standings = await getStandings()
    const matches = await getMatches()

    if (!standings || !matches) {
      return NextResponse.json({ error: 'Could not fetch tournament data' }, { status: 503 })
    }

    // Build actual results from standings
    const groupResults: Record<string, {
      first: string; second: string; third: string; fourth: string; thirdAdvances: boolean
    }> = {}

    for (const standing of standings) {
      if (standing.type !== 'TOTAL') continue
      const groupCode = standing.group?.replace('GROUP_', '')
      if (!groupCode) continue

      const table = standing.table
      if (table.length < 4) continue

      groupResults[groupCode] = {
        first: table[0].team.tla,
        second: table[1].team.tla,
        third: table[2].team.tla,
        fourth: table[3].team.tla,
        thirdAdvances: false,
      }
    }

    // Determine which 3rd-place teams advanced from R32 matches.
    // Only set third_advances = true — never overwrite a confirmed true back to false
    // (cron may run before all R32 matches are finished).
    const r32Matches = matches.filter(
      (m: { stage: string; status: string }) => m.stage === 'ROUND_OF_32' && m.status === 'FINISHED'
    )
    const allAdvancingTeams = new Set<string>()
    for (const match of r32Matches) {
      if (match.score?.winner === 'HOME_TEAM') allAdvancingTeams.add(match.homeTeam.tla)
      else if (match.score?.winner === 'AWAY_TEAM') allAdvancingTeams.add(match.awayTeam.tla)
    }

    for (const result of Object.values(groupResults)) {
      if (allAdvancingTeams.has(result.third)) result.thirdAdvances = true
      // If not yet in allAdvancingTeams, leave thirdAdvances as-is (don't reset to false)
    }

    // Build knockout results
    const stageMap: Record<string, string> = {
      ROUND_OF_32: 'R32',
      ROUND_OF_16: 'R16',
      QUARTER_FINALS: 'QF',
      SEMI_FINALS: 'SF',
      FINAL: 'FINAL',
    }

    const knockoutResults: Array<{ round: string; match_index: number; winner: string }> = []
    const stageMatchIndices: Record<string, number> = {}

    for (const match of matches) {
      if (match.status !== 'FINISHED') continue
      const round = stageMap[match.stage]
      if (!round) continue

      if (stageMatchIndices[round] === undefined) stageMatchIndices[round] = 0
      const matchIndex = stageMatchIndices[round]++

      const winner =
        match.score?.winner === 'HOME_TEAM' ? match.homeTeam.tla :
        match.score?.winner === 'AWAY_TEAM' ? match.awayTeam.tla : null

      if (winner) knockoutResults.push({ round, match_index: matchIndex, winner })
    }

    // ── Persist group_results to DB so display pages show real results ──
    const groupResultRows = Object.entries(groupResults).map(([code, r]) => ({
      group_code: code,
      first_place: r.first,
      second_place: r.second,
      third_place: r.third,
      fourth_place: r.fourth,
      third_advances: r.thirdAdvances,
    }))
    if (groupResultRows.length > 0) {
      await supabase.from('group_results').upsert(groupResultRows, {
        onConflict: 'group_code',
        ignoreDuplicates: false,
      })
      // Never downgrade third_advances from true → false mid-tournament
      for (const row of groupResultRows) {
        if (!row.third_advances) {
          await supabase.from('group_results')
            .update({ third_advances: false })
            .eq('group_code', row.group_code)
            .eq('third_advances', false) // only update if it was already false
        }
      }
    }

    // ── Persist knockout_results to DB ──────────────────────────────────
    if (knockoutResults.length > 0) {
      await supabase.from('knockout_results').upsert(
        knockoutResults.map(r => ({ round: r.round, match_index: r.match_index, winner_code: r.winner })),
        { onConflict: 'round,match_index', ignoreDuplicates: true } // never overwrite a decided match
      )
    }

    // Score all brackets
    const { data: brackets } = await supabase.from('brackets').select('id')
    if (!brackets) return NextResponse.json({ updated: 0 })

    const POINTS = { GROUP_POSITION: 1, GROUP_ADVANCING: 1, R32: 2, R16: 4, QF: 6, SF: 10, FINAL: 15 }
    const pointMap: Record<string, number> = {
      R32: POINTS.R32,
      R16: POINTS.R16,
      QF: POINTS.QF,
      SF: POINTS.SF,
      FINAL: POINTS.FINAL,
    }

    let updatedCount = 0
    for (const bracket of brackets) {
      const { data: groupPicks } = await supabase
        .from('group_picks').select('*').eq('bracket_id', bracket.id)
      const { data: thirdPicks } = await supabase
        .from('third_place_picks').select('*').eq('bracket_id', bracket.id)
      const { data: knockoutPicks } = await supabase
        .from('knockout_picks').select('*').eq('bracket_id', bracket.id)

      let groupScore = 0
      let r32Score = 0, r16Score = 0, qfScore = 0, sfScore = 0, finalScore = 0

      // Score group stage
      // 1pt per correct position + 1pt advance bonus for correct 1st/2nd picks
      for (const pick of groupPicks || []) {
        const result = groupResults[pick.group_code]
        if (!result) continue
        if (pick.first_place === result.first) groupScore += POINTS.GROUP_POSITION + POINTS.GROUP_ADVANCING
        if (pick.second_place === result.second) groupScore += POINTS.GROUP_POSITION + POINTS.GROUP_ADVANCING
        if (pick.third_place === result.third) groupScore += POINTS.GROUP_POSITION
        if (pick.fourth_place === result.fourth) groupScore += POINTS.GROUP_POSITION
      }

      // Score 3rd-place wildcard picks (+1 for each that advances to knockout)
      const thirdCodes = (thirdPicks || []).map((t: { team_code: string }) => t.team_code)
      for (const result of Object.values(groupResults)) {
        if (result.thirdAdvances && thirdCodes.includes(result.third)) {
          groupScore += POINTS.GROUP_ADVANCING
        }
      }

      // Score knockout picks — team-based, not slot-based.
      // If you picked a team to win in a round and they won in that round
      // (regardless of which slot they ended up in), you get the points.
      const winnersByRound: Record<string, Set<string>> = {}
      for (const result of knockoutResults) {
        if (!winnersByRound[result.round]) winnersByRound[result.round] = new Set()
        winnersByRound[result.round].add(result.winner)
      }

      for (const pick of (knockoutPicks || []) as { round: string; match_index: number; team_code: string }[]) {
        if (!winnersByRound[pick.round]?.has(pick.team_code)) continue
        const pts = pointMap[pick.round] || 0
        if (pick.round === 'R32') r32Score += pts
        else if (pick.round === 'R16') r16Score += pts
        else if (pick.round === 'QF') qfScore += pts
        else if (pick.round === 'SF') sfScore += pts
        else if (pick.round === 'FINAL') finalScore += pts
      }

      const totalScore = groupScore + r32Score + r16Score + qfScore + sfScore + finalScore

      await supabase.from('brackets').update({
        group_stage_score: groupScore,
        r32_score: r32Score,
        r16_score: r16Score,
        qf_score: qfScore,
        sf_score: sfScore,
        final_score: finalScore,
        total_score: totalScore,
        // Only lock brackets once the tournament has actually started
        ...(new Date() >= new Date('2026-06-12T18:00:00Z') ? { is_locked: true } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', bracket.id)

      updatedCount++
    }

    return NextResponse.json({ updated: updatedCount, message: 'Scores updated successfully' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
