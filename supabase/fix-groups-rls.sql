-- Fix groups INSERT policy
drop policy if exists "Users can create groups" on groups;
create policy "Users can create groups" on groups
  for insert with check (auth.role() = 'authenticated' and auth.uid() = created_by);

-- Also ensure group_members INSERT works
drop policy if exists "Users can join groups" on group_members;
create policy "Users can join groups" on group_members
  for insert with check (auth.role() = 'authenticated' and auth.uid() = user_id);

-- Ensure brackets INSERT works
drop policy if exists "Users can insert own brackets" on brackets;
create policy "Users can insert own brackets" on brackets
  for insert with check (auth.role() = 'authenticated' and auth.uid() = user_id);
