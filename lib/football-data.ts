const BASE_URL = 'https://api.football-data.org/v4';
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;

async function fetchFD(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': API_KEY! },
    next: { revalidate: 300 }, // cache 5 min
  });
  if (!res.ok) throw new Error(`Football API error: ${res.status}`);
  return res.json();
}

// Competition code for 2026 World Cup (update when available)
const WC_CODE = 'WC';

export async function getStandings() {
  try {
    const data = await fetchFD(`/competitions/${WC_CODE}/standings`);
    return data.standings;
  } catch {
    return null;
  }
}

// ── ESPN public API — free, no key, covers WC 2026 ──────────────────────────
export type EspnGroupStanding = {
  groupCode: string    // e.g. "A"
  teamCode: string     // e.g. "MEX"
  position: number
  mp: number
  w: number
  d: number
  l: number
  gd: number
  pts: number
}

export async function getEspnStandings(): Promise<EspnGroupStanding[] | null> {
  try {
    const res = await fetch('https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings', {
      next: { revalidate: 0 },
    })
    if (!res.ok) return null
    const data = await res.json()

    const rows: EspnGroupStanding[] = []
    for (const group of data.children ?? []) {
      const groupCode = (group.name as string).replace('Group ', '').trim()
      const entries: any[] = group.standings?.entries ?? []
      entries.forEach((entry, idx) => {
        const stat = (name: string) => {
          const s = entry.stats?.find((s: any) => s.name === name)
          return Math.round(s?.value ?? 0)
        }
        rows.push({
          groupCode,
          teamCode: entry.team.abbreviation.toUpperCase(),
          position: stat('rank') || idx + 1,
          mp: stat('gamesPlayed'),
          w: stat('wins'),
          d: stat('ties'),
          l: stat('losses'),
          gd: stat('pointDifferential'),
          pts: stat('points'),
        })
      })
    }
    return rows
  } catch {
    return null
  }
}

export type EspnMatch = {
  stage: 'GROUP' | 'R32' | 'R16' | 'QF' | 'SF' | 'FINAL'
  groupCode: string | null   // e.g. "A", null for knockout
  homeTeam: string
  awayTeam: string
  winner: string | null      // team code of winner, null if not finished
  date: string               // ISO date string
}

// ESPN scoreboard covers all 104 WC matches in one call
export async function getEspnMatches(): Promise<EspnMatch[] | null> {
  try {
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260715&limit=200',
      { next: { revalidate: 0 } }
    )
    if (!res.ok) return null
    const data = await res.json()

    // ESPN abbreviation → our app code
    const ESPN_TLA_MAP: Record<string, string> = {
      URY: 'URU', KOR: 'KOR', RSA: 'RSA', BIH: 'BIH',
      CUW: 'CUW', CPV: 'CPV', CIV: 'CIV',
    }
    const normalize = (code: string) => ESPN_TLA_MAP[code] || code

    // Knockout note labels ESPN uses (populated once matches are announced)
    const STAGE_MAP: Record<string, EspnMatch['stage']> = {
      'Round of 32': 'R32',
      'Round of 16': 'R16',
      'Quarterfinal': 'QF',
      'Semifinal': 'SF',
      'Final': 'FINAL',
    }

    const matches: EspnMatch[] = []
    for (const event of data.events ?? []) {
      const comp = event.competitions?.[0]
      if (!comp) continue
      const note: string = comp.altGameNote ?? ''
      const completed: boolean = comp.status?.type?.completed ?? false

      // Determine stage from altGameNote
      let stage: EspnMatch['stage'] = 'GROUP'
      let groupCode: string | null = null

      const groupMatch = note.match(/Group ([A-L])$/)
      if (groupMatch) {
        groupCode = groupMatch[1]
        stage = 'GROUP'
      } else {
        for (const [label, s] of Object.entries(STAGE_MAP)) {
          if (note.includes(label)) { stage = s; break }
        }
      }

      const competitors: any[] = comp.competitors ?? []
      const home = competitors.find((c: any) => c.homeAway === 'home')
      const away = competitors.find((c: any) => c.homeAway === 'away')
      if (!home || !away) continue

      const winner = completed
        ? home.winner ? normalize(home.team.abbreviation) : away.winner ? normalize(away.team.abbreviation) : null
        : null

      matches.push({
        stage,
        groupCode,
        homeTeam: normalize(home.team.abbreviation),
        awayTeam: normalize(away.team.abbreviation),
        winner,
        date: event.date,
      })
    }

    return matches.sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return null
  }
}
