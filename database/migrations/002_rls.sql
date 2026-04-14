alter table public.profiles enable row level security;
alter table public.constraints enable row level security;
alter table public.schedules enable row level security;
alter table public.schedule_shifts enable row level security;
alter table public.shift_requirements enable row level security;

create or replace function public.current_user_role()
returns text language sql security definer stable set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

-- profiles: all authenticated users read active profiles
create policy "profiles_read" on public.profiles
  for select using (id = auth.uid() or is_active = true);
create policy "profiles_manager_all" on public.profiles
  for all using (public.current_user_role() = 'manager');

-- constraints: employee select/insert/update, manager delete
create policy "constraints_employee_select" on public.constraints
  for select using (employee_id = auth.uid() or public.current_user_role() = 'manager');
create policy "constraints_employee_insert" on public.constraints
  for insert with check (employee_id = auth.uid() or public.current_user_role() = 'manager');
create policy "constraints_employee_update" on public.constraints
  for update using (employee_id = auth.uid() or public.current_user_role() = 'manager');
create policy "constraints_manager_delete" on public.constraints
  for delete using (public.current_user_role() = 'manager');

-- schedules: published = everyone; draft = manager only
create policy "schedules_read" on public.schedules
  for select using (status = 'published' or public.current_user_role() = 'manager');
create policy "schedules_manager_write" on public.schedules
  for all using (public.current_user_role() = 'manager');

-- schedule_shifts follow parent schedule visibility
create policy "shifts_read" on public.schedule_shifts
  for select using (
    exists (
      select 1 from public.schedules s
      where s.id = schedule_id
        and (s.status = 'published' or public.current_user_role() = 'manager')
    )
  );
create policy "shifts_manager_write" on public.schedule_shifts
  for all using (public.current_user_role() = 'manager');

-- shift_requirements: all read, manager write
create policy "req_read" on public.shift_requirements for select using (true);
create policy "req_manager_write" on public.shift_requirements
  for all using (public.current_user_role() = 'manager');
