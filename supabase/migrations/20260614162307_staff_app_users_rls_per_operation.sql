-- Drop existing policy and recreate explicitly per operation
DROP POLICY IF EXISTS "staff_app_users_own" ON public.staff_app_users;
DROP POLICY IF EXISTS "staff_app_users_insert" ON public.staff_app_users;

CREATE POLICY "staff_app_users_select" ON public.staff_app_users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "staff_app_users_insert" ON public.staff_app_users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "staff_app_users_update" ON public.staff_app_users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "staff_app_users_delete" ON public.staff_app_users
  FOR DELETE USING (auth.uid() = id);
