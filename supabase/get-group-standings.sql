-- get_group_standings(p_group_id)
-- Returns best total_score per user for a group, bypassing RLS.
-- Used by the dashboard to show accurate group placement.

CREATE OR REPLACE FUNCTION get_group_standings(p_group_id uuid)
RETURNS TABLE(user_id uuid, best_score int, display_name text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    b.user_id,
    MAX(b.total_score) AS best_score,
    p.display_name
  FROM group_bracket_entries gbe
  JOIN brackets b ON b.id = gbe.bracket_id
  LEFT JOIN profiles p ON p.id = b.user_id
  WHERE gbe.group_id = p_group_id
    AND b.is_complete = true
  GROUP BY b.user_id, p.display_name
  ORDER BY best_score DESC;
$$;
