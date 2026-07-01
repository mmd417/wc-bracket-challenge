// Betting odds for each team to WIN their group (American odds format)
// Update these as odds change. Positive = underdog, Negative = favorite.
// impliedProb is used for sorting only — derived from odds.
export type TeamOdds = { odds: string; impliedProb: number }

function pos(american: number): number { return 100 / (american + 100) }
function neg(american: number): number { return Math.abs(american) / (Math.abs(american) + 100) }

// Source: DraftKings Sportsbook, June 11 2026
export const GROUP_ODDS: Record<string, TeamOdds> = {
  // Group A
  MEX: { odds: '-140', impliedProb: neg(140) },
  KOR: { odds: '+400', impliedProb: pos(400) },
  CZE: { odds: '+400', impliedProb: pos(400) },
  RSA: { odds: '+4000', impliedProb: pos(4000) },
  // Group B
  SUI: { odds: '-135', impliedProb: neg(135) },
  CAN: { odds: '+180', impliedProb: pos(180) },
  BIH: { odds: '+650', impliedProb: pos(650) },
  QAT: { odds: '+3000', impliedProb: pos(3000) },
  // Group C
  BRA: { odds: '-310', impliedProb: neg(310) },
  MAR: { odds: '+350', impliedProb: pos(350) },
  SCO: { odds: '+1000', impliedProb: pos(1000) },
  HAI: { odds: '+12000', impliedProb: pos(12000) },
  // Group D
  USA: { odds: '+140', impliedProb: pos(140) },
  TUR: { odds: '+175', impliedProb: pos(175) },
  PAR: { odds: '+400', impliedProb: pos(400) },
  AUS: { odds: '+800', impliedProb: pos(800) },
  // Group E
  GER: { odds: '-230', impliedProb: neg(230) },
  ECU: { odds: '+350', impliedProb: pos(350) },
  CIV: { odds: '+600', impliedProb: pos(600) },
  CUW: { odds: '+12000', impliedProb: pos(12000) },
  // Group F
  NED: { odds: '-125', impliedProb: neg(125) },
  JPN: { odds: '+250', impliedProb: pos(250) },
  SWE: { odds: '+450', impliedProb: pos(450) },
  TUN: { odds: '+1200', impliedProb: pos(1200) },
  // Group G
  BEL: { odds: '-245', impliedProb: neg(245) },
  EGY: { odds: '+400', impliedProb: pos(400) },
  IRN: { odds: '+650', impliedProb: pos(650) },
  NZL: { odds: '+2000', impliedProb: pos(2000) },
  // Group H
  ESP: { odds: '-475', impliedProb: neg(475) },
  URU: { odds: '+400', impliedProb: pos(400) },
  KSA: { odds: '+3000', impliedProb: pos(3000) },
  CPV: { odds: '+6000', impliedProb: pos(6000) },
  // Group I
  FRA: { odds: '-215', impliedProb: neg(215) },
  NOR: { odds: '+275', impliedProb: pos(275) },
  SEN: { odds: '+750', impliedProb: pos(750) },
  IRQ: { odds: '+8000', impliedProb: pos(8000) },
  // Group J
  ARG: { odds: '-265', impliedProb: neg(265) },
  AUT: { odds: '+370', impliedProb: pos(370) },
  ALG: { odds: '+800', impliedProb: pos(800) },
  JOR: { odds: '+5000', impliedProb: pos(5000) },
  // Group K
  POR: { odds: '-190', impliedProb: neg(190) },
  COL: { odds: '+190', impliedProb: pos(190) },
  COD: { odds: '+1400', impliedProb: pos(1400) },
  UZB: { odds: '+3500', impliedProb: pos(3500) },
  // Group L
  ENG: { odds: '-280', impliedProb: neg(280) },
  CRO: { odds: '+320', impliedProb: pos(320) },
  GHA: { odds: '+1100', impliedProb: pos(1100) },
  PAN: { odds: '+4000', impliedProb: pos(4000) },
}
