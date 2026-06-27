-- Replace daily_rate/total_days with itemised remuneration columns
ALTER TABLE public.staff_app_jobs
  ADD COLUMN IF NOT EXISTS work_days integer NULL,
  ADD COLUMN IF NOT EXISTS work_rate numeric(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS travel_days integer NULL,
  ADD COLUMN IF NOT EXISTS travel_rate numeric(10, 2) NULL,
  ADD COLUMN IF NOT EXISTS flat_total numeric(10, 2) NULL;

ALTER TABLE public.staff_app_jobs
  DROP COLUMN IF EXISTS daily_rate,
  DROP COLUMN IF EXISTS total_days;
