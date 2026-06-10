-- Enable RLS
alter default privileges revoke execute on functions from public;

-- Profiles
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null,
  email text not null,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "Public profiles are viewable by everyone" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);

-- Brackets
create table brackets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null default 'My Bracket',
  is_locked boolean default false,
  group_stage_score int default 0,
  r32_score int default 0,
  r16_score int default 0,
  qf_score int default 0,
  sf_score int default 0,
  final_score int default 0,
  total_score int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table brackets enable row level security;
create policy "Brackets viewable by group members" on brackets for select using (true);
create policy "Users can insert own brackets" on brackets for insert with check (auth.uid() = user_id);
create policy "Users can update own unlocked brackets" on brackets for update using (auth.uid() = user_id);
create policy "Users can delete own brackets" on brackets for delete using (auth.uid() = user_id);

-- Group stage picks (1 row per group per bracket)
create table group_picks (
  id uuid default gen_random_uuid() primary key,
  bracket_id uuid references brackets(id) on delete cascade not null,
  group_code text not null, -- 'A' through 'L'
  first_place text not null,  -- team code
  second_place text not null,
  third_place text not null,
  fourth_place text not null,
  unique(bracket_id, group_code)
);
alter table group_picks enable row level security;
create policy "Group picks viewable by all" on group_picks for select using (true);
create policy "Users can manage own group picks" on group_picks for all using (
  auth.uid() = (select user_id from brackets where id = bracket_id)
);

-- Third place advancing picks (which 8 of 12 third-place teams advance)
create table third_place_picks (
  id uuid default gen_random_uuid() primary key,
  bracket_id uuid references brackets(id) on delete cascade not null,
  team_code text not null,
  unique(bracket_id, team_code)
);
alter table third_place_picks enable row level security;
create policy "Third place picks viewable by all" on third_place_picks for select using (true);
create policy "Users can manage own third place picks" on third_place_picks for all using (
  auth.uid() = (select user_id from brackets where id = bracket_id)
);

-- Knockout picks
create table knockout_picks (
  id uuid default gen_random_uuid() primary key,
  bracket_id uuid references brackets(id) on delete cascade not null,
  round text not null, -- 'R32', 'R16', 'QF', 'SF', 'FINAL'
  match_index int not null, -- 0-based index within the round
  team_code text not null,
  unique(bracket_id, round, match_index)
);
alter table knockout_picks enable row level security;
create policy "Knockout picks viewable by all" on knockout_picks for select using (true);
create policy "Users can manage own knockout picks" on knockout_picks for all using (
  auth.uid() = (select user_id from brackets where id = bracket_id)
);

-- Groups (social groups)
create table groups (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  invite_code text unique not null default substr(md5(random()::text), 1, 8),
  created_by uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now()
);
alter table groups enable row level security;
create policy "Users can create groups" on groups for insert with check (auth.uid() = created_by);
create policy "Group creator can update" on groups for update using (auth.uid() = created_by);

-- Group members
create table group_members (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references groups(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  joined_at timestamptz default now(),
  unique(group_id, user_id)
);
alter table group_members enable row level security;
create policy "Members viewable by group members" on group_members for select using (
  exists (select 1 from group_members gm where gm.group_id = group_id and gm.user_id = auth.uid())
);
create policy "Users can join groups" on group_members for insert with check (auth.uid() = user_id);
create policy "Users can leave groups" on group_members for delete using (auth.uid() = user_id);

-- Now add the groups select policy (needs group_members to exist first)
create policy "Groups viewable by members" on groups for select using (
  exists (select 1 from group_members where group_id = id and user_id = auth.uid())
);

-- Group bracket entries (which brackets are in which groups)
create table group_bracket_entries (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references groups(id) on delete cascade not null,
  bracket_id uuid references brackets(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  entered_at timestamptz default now(),
  unique(group_id, bracket_id)
);
alter table group_bracket_entries enable row level security;
create policy "Entries viewable by group members" on group_bracket_entries for select using (
  exists (select 1 from group_members where group_id = group_id and user_id = auth.uid())
);
create policy "Users can enter own brackets" on group_bracket_entries for insert with check (auth.uid() = user_id);
create policy "Users can remove own entries" on group_bracket_entries for delete using (auth.uid() = user_id);
