import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEspnStandings, getEspnMatches } from '@/lib/football-data'

// Called by Vercel cron (GET) every 30 min, or manually via POST with Bearer token.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return handler()
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return handler()
}

async function handler() {
  try {
    const supabase = await createClient()

    const [espnStandings, espnMatches] = await Promise.all([
      getEspnStandings(),
      getEspnMatches(),
    ])

    if (!espnStandings || !espnMatches) {
      return NextResponse.json({ error: 'Could not fetch ESPN data' }, { status: 503 })
    }

    // ── group_standings: live W/D/L/GD/Pts for display ─────────────────
    const standingsRows = espnStandings.map(r => ({
      group_code: r.groupCode,
      team_code: r.teamCode,
      position: r.position,
      mp: r.mp,
      w: r.w,
      d: r.d,
      l: r.l,
      gd: r.gd,
      pts: r.pts,
    }))
    if (standingsRows.length > 0) {
      await supabase.from('group_standings').upsert(standingsRows, { onConflict: 'group_code,team_code', ignoreDuplicates: false })
    }

    // ── group_results: final positions, only written when group is complete ──
    // Group by code, only write when all 4 teams have played 3 games
    const byGroup: Record<string, typeof espnStandings> = {}
    for (const row of espnStandings) {
      if (!byGroup[row.groupCode]) byGroup[row.groupCode] = []
      byGroup[row.groupCode].push(row)
    }

    const groupResultRows: Array<{ group_code: string; first_place: string; second_place: string; third_place: string; fourth_place: string }> = []
    for (const [groupCode, rows] of Object.entries(byGroup)) {
      if (rows.length < 4 || rows.some(r => r.mp < 3)) continue  // group not complete
      const sorted = [...rows].sort((a, b) => a.position - b.position)
      groupResultRows.push({
        group_code: groupCode,
        first_place: sorted[0].teamCode,
        second_place: sorted[1].teamCode,
        third_place: sorted[2].teamCode,
        fourth_place: sorted[3].teamCode,
        // third_advances intentionally omitted — never reset it, only ever set true below
      })
    }

    if (groupResultRows.length > 0) {
      await supabase.from('group_results').upsert(groupResultRows, { onConflict: 'group_code', ignoreDuplicates: false })
    }

    // ── third_advances: set true for 3rd-place teams that won their R32 match ─
    const r32Winners = new Set(
      espnMatches.filter(m => m.stage === 'R32' && m.winner).map(m => m.winner!)
    )
    if (r32Winners.size > 0) {
      // Fetch existing group_results to check which 3rd-place teams advanced
      const { data: existingResults } = await supabase.from('group_results').select('group_code, third_place')
      for (const row of existingResults ?? []) {
        if (r32Winners.has(row.third_place)) {
          await supabase.from('group_results').update({ third_advances: true }).eq('group_code', row.group_code)
        }
      }
    }

    // ── knockout_results: all knockout matches (scheduled + completed), ordered by match date ──
    const knockoutMatches = espnMatches.filter(m => m.stage !== 'GROUP')
    const roundIndices: Record<string, number> = {}
    const knockoutRows: Array<{ round: string; match_index: number; home_code: string; away_code: string; winner_code: string | null }> = []
    for (const m of knockoutMatches) {
      if (roundIndices[m.stage] === undefined) roundIndices[m.stage] = 0
      knockoutRows.push({
        round: m.stage,
        match_index: roundIndices[m.stage]++,
        home_code: m.homeTeam,
        away_code: m.awayTeam,
        winner_code: m.winner ?? null,
      })
    }
    if (knockoutRows.length > 0) {
      await supabase.from('knockout_results').upsert(knockoutRows, { onConflict: 'round,match_index', ignoreDuplicates: false })
    }

    // ── Score all brackets via SQL function ───────────────────────────────
    const { data: result, error: rpcError } = await supabase.rpc('score_all_brackets')
    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })

    return NextResponse.json({ ...result, message: 'Scores updated successfully' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
