truncate table group_bracket_entries cascade;
truncate table group_members cascade;
truncate table groups cascade;
truncate table knockout_picks cascade;
truncate table third_place_picks cascade;
truncate table group_picks cascade;
truncate table brackets cascade;

create or replace function public.get_my_group_ids()
returns setof uuid language sql security definer stable as $$
  select group_id from group_members where user_id = auth.uid()
$$;

drop policy if exists "Members viewable by group members" on group_members;
drop policy if exists "Groups viewable by members" on groups;
drop policy if exists "Entries viewable by group members" on group_bracket_entries;

create policy "Members viewable by group members" on group_members for select using (
  user_id = auth.uid() or group_id in (select public.get_my_group_ids())
);
create policy "Groups viewable by members" on groups for select using (
  id in (select public.get_my_group_ids())
);
create policy "Entries viewable by group members" on group_bracket_entries for select using (
  group_id in (select public.get_my_group_ids())
);
