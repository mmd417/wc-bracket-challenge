-- score_all_brackets
-- Scoring rules:
--   Group placement:  +1pt for each exact position correct (1st/2nd/3rd/4th)
--   Group advance:    +1pt for each of the user's 1st/2nd picks that actually advanced
--                     (team finished 1st OR 2nd OR finished 3rd AND third_advances=true)
--   Wildcard advance: +1pt per wildcard pick that advanced via any route
--   Knockout rounds:  R32=+2, R16=+4, QF=+6, SF=+10, FINAL=+15 per correct pick

CREATE OR REPLACE FUNCTION score_all_brackets()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec RECORD;
  grp RECORD;
  grp_result RECORD;
  ko_result RECORD;
  tp_code TEXT;
  tp_group_code TEXT;

  group_stage_pts INT;
  r32_pts INT;
  r16_pts INT;
  qf_pts INT;
  sf_pts INT;
  final_pts INT;
  total_pts INT;

  updated_count INT := 0;
BEGIN
  FOR rec IN SELECT id FROM brackets WHERE is_complete = true LOOP

    group_stage_pts := 0;
    r32_pts := 0;
    r16_pts := 0;
    qf_pts := 0;
    sf_pts := 0;
    final_pts := 0;

    -- ── Group stage picks ─────────────────────────────────────────────
    FOR grp IN
      SELECT gp.group_code, gp.first_place, gp.second_place, gp.third_place, gp.fourth_place
      FROM group_picks gp
      WHERE gp.bracket_id = rec.id
    LOOP
      SELECT * INTO grp_result FROM group_results gr WHERE gr.group_code = grp.group_code;
      IF NOT FOUND THEN CONTINUE; END IF;

      -- Placement points (exact position)
      IF grp.first_place  = grp_result.first_place  THEN group_stage_pts := group_stage_pts + 1; END IF;
      IF grp.second_place = grp_result.second_place THEN group_stage_pts := group_stage_pts + 1; END IF;
      IF grp.third_place  = grp_result.third_place  THEN group_stage_pts := group_stage_pts + 1; END IF;
      IF grp.fourth_place = grp_result.fourth_place THEN group_stage_pts := group_stage_pts + 1; END IF;

      -- Advance points for 1st pick (team advanced via any route)
      IF grp.first_place = grp_result.first_place
      OR grp.first_place = grp_result.second_place
      OR (grp.first_place = grp_result.third_place AND grp_result.third_advances = true)
      THEN group_stage_pts := group_stage_pts + 1; END IF;

      -- Advance points for 2nd pick (team advanced via any route)
      IF grp.second_place = grp_result.first_place
      OR grp.second_place = grp_result.second_place
      OR (grp.second_place = grp_result.third_place AND grp_result.third_advances = true)
      THEN group_stage_pts := group_stage_pts + 1; END IF;

    END LOOP;

    -- ── Wildcard (third_place_picks) ─────────────────────────────────
    FOR tp_code IN
      SELECT tpp.team_code FROM third_place_picks tpp WHERE tpp.bracket_id = rec.id
    LOOP
      -- Find which group the picked team was in (from user's group picks)
      SELECT gp.group_code INTO tp_group_code
      FROM group_picks gp
      WHERE gp.bracket_id = rec.id
        AND (gp.first_place = tp_code OR gp.second_place = tp_code
          OR gp.third_place = tp_code OR gp.fourth_place = tp_code)
      LIMIT 1;

      IF tp_group_code IS NOT NULL THEN
        SELECT * INTO grp_result FROM group_results gr WHERE gr.group_code = tp_group_code;
        IF FOUND THEN
          IF grp_result.first_place  = tp_code
          OR grp_result.second_place = tp_code
          OR (grp_result.third_place = tp_code AND grp_result.third_advances = true)
          THEN group_stage_pts := group_stage_pts + 1; END IF;
        END IF;
      END IF;
    END LOOP;

    -- ── Knockout picks ────────────────────────────────────────────────
    FOR ko_result IN
      SELECT kr.round, kr.winner_code FROM knockout_results kr WHERE kr.winner_code IS NOT NULL
    LOOP
      IF EXISTS (
        SELECT 1 FROM knockout_picks kp
        WHERE kp.bracket_id = rec.id
          AND kp.round = ko_result.round
          AND kp.team_code = ko_result.winner_code
      ) THEN
        CASE ko_result.round
          WHEN 'R32'   THEN r32_pts   := r32_pts   + 2;
          WHEN 'R16'   THEN r16_pts   := r16_pts   + 4;
          WHEN 'QF'    THEN qf_pts    := qf_pts    + 6;
          WHEN 'SF'    THEN sf_pts    := sf_pts    + 10;
          WHEN 'FINAL' THEN final_pts := final_pts + 15;
          ELSE NULL;
        END CASE;
      END IF;
    END LOOP;

    total_pts := group_stage_pts + r32_pts + r16_pts + qf_pts + sf_pts + final_pts;

    UPDATE brackets SET
      group_stage_score = group_stage_pts,
      r32_score         = r32_pts,
      r16_score         = r16_pts,
      qf_score          = qf_pts,
      sf_score          = sf_pts,
      final_score       = final_pts,
      total_score       = total_pts,
      updated_at        = now()
    WHERE id = rec.id;

    updated_count := updated_count + 1;
  END LOOP;

  RETURN json_build_object('updated', updated_count);
END;
$$;
