DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='template_id') THEN
    ALTER TABLE public.campaigns ADD COLUMN template_id uuid NULL REFERENCES public.message_templates(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='audience_type') THEN
    ALTER TABLE public.campaigns ADD COLUMN audience_type text NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='audience_data') THEN
    ALTER TABLE public.campaigns ADD COLUMN audience_data jsonb NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='recipient_count') THEN
    ALTER TABLE public.campaigns ADD COLUMN recipient_count integer NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='updated_at') THEN
    ALTER TABLE public.campaigns ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;
