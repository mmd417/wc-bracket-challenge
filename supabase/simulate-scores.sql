-- Simulate mid-tournament scores on all brackets
-- Mimics a scenario partway through the knockout stage

update brackets set
  group_stage_score = 52,   -- ~65% accuracy across 12 groups
  r32_score = 18,           -- 9 of 16 correct × 2pts
  r16_score = 9,            -- 3 of 8 correct × 3pts
  qf_score = 10,            -- 2 of 4 correct × 5pts
  sf_score = 0,             -- not played yet
  final_score = 0,          -- not played yet
  total_score = 89;
