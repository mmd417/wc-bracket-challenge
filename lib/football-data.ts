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

export async function getMatches() {
  try {
    const data = await fetchFD(`/competitions/${WC_CODE}/matches`);
    return data.matches;
  } catch {
    return null;
  }
}

export async function getCurrentMatchday() {
  try {
    const data = await fetchFD(`/competitions/${WC_CODE}`);
    return data.currentSeason?.currentMatchday;
  } catch {
    return null;
  }
}
