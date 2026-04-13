-- profiles (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('employee', 'manager')),
  job_role text check (job_role in ('waiter', 'cook')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- shift_requirements (target_date overrides day_of_week for special events)
create table public.shift_requirements (
  id uuid primary key default gen_random_uuid(),
  day_of_week int check (day_of_week between 0 and 5),
  shift_type text not null check (shift_type in ('morning', 'evening')),
  required_waiters int not null default 2,
  required_cooks int not null default 3,
  target_date date,
  unique nulls not distinct (day_of_week, shift_type, target_date)
);

-- constraints (one per employee per week)
create table public.constraints (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  raw_text text not null,
  parsed_json jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (employee_id, week_start)
);

-- schedules (one per week)
create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now()
);

-- schedule_shifts
create table public.schedule_shifts (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  employee_id uuid references public.profiles(id),  -- nullable for UNFILLED slots
  day_of_week int not null check (day_of_week between 0 and 5),
  shift_type text not null check (shift_type in ('morning', 'evening')),
  is_conflict boolean not null default false,
  conflict_reason text
);

-- auto-create profile on new auth user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), 'employee');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
