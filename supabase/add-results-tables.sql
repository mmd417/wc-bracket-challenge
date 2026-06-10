-- Stores actual group stage results as they happen
create table if not exists group_results (
  id uuid default gen_random_uuid() primary key,
  group_code text unique not null,
  first_place text not null,
  second_place text not null,
  third_place text not null,
  fourth_place text not null,
  third_advances boolean default false,
  updated_at timestamptz default now()
);
alter table group_results enable row level security;
create policy "Group results viewable by all" on group_results for select using (true);

-- Stores actual knockout match results as they happen
create table if not exists knockout_results (
  id uuid default gen_random_uuid() primary key,
  round text not null,
  match_index int not null,
  winner_code text not null,
  updated_at timestamptz default now(),
  unique(round, match_index)
);
alter table knockout_results enable row level security;
create policy "Knockout results viewable by all" on knockout_results for select using (true);

-- Simulate some results (partial tournament - group stage complete + R32 + R16 done, QF in progress)
insert into group_results (group_code, first_place, second_place, third_place, fourth_place, third_advances) values
  ('A', 'KOR', 'MEX', 'RSA', 'CZE', true),
  ('B', 'SUI', 'CAN', 'QAT', 'BIH', false),
  ('C', 'BRA', 'MAR', 'SCO', 'HAI', true),
  ('D', 'USA', 'TUR', 'AUS', 'PAR', true),
  ('E', 'GER', 'ECU', 'CIV', 'CUW', true),
  ('F', 'NED', 'JPN', 'SWE', 'TUN', true),
  ('G', 'BEL', 'EGY', 'IRN', 'NZL', false),
  ('H', 'ESP', 'URU', 'KSA', 'CPV', true),
  ('I', 'FRA', 'NOR', 'SEN', 'IRQ', true),
  ('J', 'ARG', 'AUT', 'ALG', 'JOR', false),
  ('K', 'POR', 'COL', 'COD', 'UZB', false),
  ('L', 'ENG', 'CRO', 'GHA', 'PAN', false)
on conflict (group_code) do update set
  first_place = excluded.first_place, second_place = excluded.second_place,
  third_place = excluded.third_place, fourth_place = excluded.fourth_place,
  third_advances = excluded.third_advances, updated_at = now();

-- R32 results (all 16 matches)
insert into knockout_results (round, match_index, winner_code) values
  ('R32', 0, 'SUI'),   ('R32', 1, 'GER'),   ('R32', 2, 'NED'),
  ('R32', 3, 'BRA'),   ('R32', 4, 'FRA'),   ('R32', 5, 'GER'),
  ('R32', 6, 'KOR'),   ('R32', 7, 'ENG'),   ('R32', 8, 'USA'),
  ('R32', 9, 'BEL'),   ('R32', 10, 'POR'),  ('R32', 11, 'ESP'),
  ('R32', 12, 'NED'),  ('R32', 13, 'ARG'),  ('R32', 14, 'POR'),
  ('R32', 15, 'USA')
on conflict (round, match_index) do update set winner_code = excluded.winner_code, updated_at = now();

-- R16 results (all 8 matches)
insert into knockout_results (round, match_index, winner_code) values
  ('R16', 0, 'NED'),  ('R16', 1, 'FRA'),  ('R16', 2, 'BRA'),
  ('R16', 3, 'KOR'),  ('R16', 4, 'ESP'),  ('R16', 5, 'USA'),
  ('R16', 6, 'ARG'),  ('R16', 7, 'POR')
on conflict (round, match_index) do update set winner_code = excluded.winner_code, updated_at = now();

-- QF results (2 of 4 played)
insert into knockout_results (round, match_index, winner_code) values
  ('QF', 0, 'FRA'),  ('QF', 1, 'ESP')
on conflict (round, match_index) do update set winner_code = excluded.winner_code, updated_at = now();
