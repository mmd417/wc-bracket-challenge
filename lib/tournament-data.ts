export type Team = {
  code: string;
  name: string;
  flag: string;
  group: string;
};

export const TEAMS: Team[] = [
  // Group A
  { code: 'MEX', name: 'Mexico', flag: '🇲🇽', group: 'A' },
  { code: 'RSA', name: 'South Africa', flag: '🇿🇦', group: 'A' },
  { code: 'KOR', name: 'South Korea', flag: '🇰🇷', group: 'A' },
  { code: 'CZE', name: 'Czechia', flag: '🇨🇿', group: 'A' },
  // Group B
  { code: 'CAN', name: 'Canada', flag: '🇨🇦', group: 'B' },
  { code: 'BIH', name: 'Bosnia & Herzegovina', flag: '🇧🇦', group: 'B' },
  { code: 'QAT', name: 'Qatar', flag: '🇶🇦', group: 'B' },
  { code: 'SUI', name: 'Switzerland', flag: '🇨🇭', group: 'B' },
  // Group C
  { code: 'BRA', name: 'Brazil', flag: '🇧🇷', group: 'C' },
  { code: 'MAR', name: 'Morocco', flag: '🇲🇦', group: 'C' },
  { code: 'HAI', name: 'Haiti', flag: '🇭🇹', group: 'C' },
  { code: 'SCO', name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', group: 'C' },
  // Group D
  { code: 'USA', name: 'United States', flag: '🇺🇸', group: 'D' },
  { code: 'PAR', name: 'Paraguay', flag: '🇵🇾', group: 'D' },
  { code: 'AUS', name: 'Australia', flag: '🇦🇺', group: 'D' },
  { code: 'TUR', name: 'Turkey', flag: '🇹🇷', group: 'D' },
  // Group E
  { code: 'GER', name: 'Germany', flag: '🇩🇪', group: 'E' },
  { code: 'CUW', name: 'Curaçao', flag: '🇨🇼', group: 'E' },
  { code: 'CIV', name: 'Ivory Coast', flag: '🇨🇮', group: 'E' },
  { code: 'ECU', name: 'Ecuador', flag: '🇪🇨', group: 'E' },
  // Group F
  { code: 'NED', name: 'Netherlands', flag: '🇳🇱', group: 'F' },
  { code: 'JPN', name: 'Japan', flag: '🇯🇵', group: 'F' },
  { code: 'SWE', name: 'Sweden', flag: '🇸🇪', group: 'F' },
  { code: 'TUN', name: 'Tunisia', flag: '🇹🇳', group: 'F' },
  // Group G
  { code: 'BEL', name: 'Belgium', flag: '🇧🇪', group: 'G' },
  { code: 'EGY', name: 'Egypt', flag: '🇪🇬', group: 'G' },
  { code: 'IRN', name: 'Iran', flag: '🇮🇷', group: 'G' },
  { code: 'NZL', name: 'New Zealand', flag: '🇳🇿', group: 'G' },
  // Group H
  { code: 'ESP', name: 'Spain', flag: '🇪🇸', group: 'H' },
  { code: 'CPV', name: 'Cape Verde', flag: '🇨🇻', group: 'H' },
  { code: 'KSA', name: 'Saudi Arabia', flag: '🇸🇦', group: 'H' },
  { code: 'URU', name: 'Uruguay', flag: '🇺🇾', group: 'H' },
  // Group I
  { code: 'FRA', name: 'France', flag: '🇫🇷', group: 'I' },
  { code: 'SEN', name: 'Senegal', flag: '🇸🇳', group: 'I' },
  { code: 'IRQ', name: 'Iraq', flag: '🇮🇶', group: 'I' },
  { code: 'NOR', name: 'Norway', flag: '🇳🇴', group: 'I' },
  // Group J
  { code: 'ARG', name: 'Argentina', flag: '🇦🇷', group: 'J' },
  { code: 'ALG', name: 'Algeria', flag: '🇩🇿', group: 'J' },
  { code: 'AUT', name: 'Austria', flag: '🇦🇹', group: 'J' },
  { code: 'JOR', name: 'Jordan', flag: '🇯🇴', group: 'J' },
  // Group K
  { code: 'POR', name: 'Portugal', flag: '🇵🇹', group: 'K' },
  { code: 'COD', name: 'DR Congo', flag: '🇨🇩', group: 'K' },
  { code: 'UZB', name: 'Uzbekistan', flag: '🇺🇿', group: 'K' },
  { code: 'COL', name: 'Colombia', flag: '🇨🇴', group: 'K' },
  // Group L
  { code: 'ENG', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', group: 'L' },
  { code: 'CRO', name: 'Croatia', flag: '🇭🇷', group: 'L' },
  { code: 'GHA', name: 'Ghana', flag: '🇬🇭', group: 'L' },
  { code: 'PAN', name: 'Panama', flag: '🇵🇦', group: 'L' },
];

export const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export function getTeamsByGroup(group: string): Team[] {
  return TEAMS.filter(t => t.group === group);
}

export function getTeam(code: string): Team | undefined {
  return TEAMS.find(t => t.code === code);
}

// Tournament locks June 12, 2026 at 2pm ET (18:00 UTC)
export const TOURNAMENT_START = new Date('2026-06-12T18:00:00Z');

export function isTournamentStarted(): boolean {
  return new Date() >= TOURNAMENT_START;
}
