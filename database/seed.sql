-- Default shift requirements: Sun(0)–Fri(5), morning + evening, 2 waiters + 3 cooks
insert into public.shift_requirements (day_of_week, shift_type, required_waiters, required_cooks)
values
  (0,'morning',2,3),(0,'evening',2,3),
  (1,'morning',2,3),(1,'evening',2,3),
  (2,'morning',2,3),(2,'evening',2,3),
  (3,'morning',2,3),(3,'evening',2,3),
  (4,'morning',2,3),(4,'evening',2,3),
  (5,'morning',2,3),(5,'evening',2,3);

-- NOTE: Manager user must be created first via Supabase Auth dashboard or API.
-- After creation, update the auto-created profile:
-- UPDATE public.profiles SET role='manager', name='מנהל' WHERE id='<auth-uuid>';
