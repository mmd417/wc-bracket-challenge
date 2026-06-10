-- Creates a group and adds the creator as a member in one atomic operation.
-- Uses security definer to bypass RLS on insert, but validates auth.uid() internally.
create or replace function public.create_group(group_name text)
returns uuid
language plpgsql
security definer
as $$
declare
  new_group_id uuid;
  current_user_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into groups (name, created_by)
  values (group_name, current_user_id)
  returning id into new_group_id;

  insert into group_members (group_id, user_id)
  values (new_group_id, current_user_id);

  return new_group_id;
end;
$$;
