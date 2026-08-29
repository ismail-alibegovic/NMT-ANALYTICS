DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'scheduled_at') THEN
    ALTER TABLE public.campaigns ADD COLUMN scheduled_at timestamptz;
  END IF;
END $$;
