-- Fix RLS: add explicit INSERT policy for staff_app_users
CREATE POLICY "staff_app_users_insert" ON public.staff_app_users
  FOR INSERT WITH CHECK (auth.uid() = id);
