-- Extend models
ALTER TABLE public.models
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS upload_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS is_locked_in_catalog boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_subtile_count integer NOT NULL DEFAULT 0;

-- Sub-tiles
CREATE TABLE IF NOT EXISTS public.model_subtiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id uuid NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text,
  bbox_north numeric NOT NULL,
  bbox_south numeric NOT NULL,
  bbox_east numeric NOT NULL,
  bbox_west numeric NOT NULL,
  accuracy numeric,
  vertical_accuracy numeric,
  capture_date date,
  quality_rating integer,
  is_approved_for_coordinates boolean NOT NULL DEFAULT false,
  approved_by uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (model_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_subtiles TO authenticated;
GRANT ALL ON public.model_subtiles TO service_role;
ALTER TABLE public.model_subtiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view subtiles"
  ON public.model_subtiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert subtiles"
  ON public.model_subtiles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update subtiles"
  ON public.model_subtiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete subtiles"
  ON public.model_subtiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_model_subtiles_updated_at
  BEFORE UPDATE ON public.model_subtiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sub-tile approval logs (append only)
CREATE TABLE IF NOT EXISTS public.subtile_approval_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subtile_id uuid NOT NULL REFERENCES public.model_subtiles(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
  action text NOT NULL,
  performer_name text NOT NULL,
  performed_by uuid NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.subtile_approval_logs TO authenticated;
GRANT ALL ON public.subtile_approval_logs TO service_role;
ALTER TABLE public.subtile_approval_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view subtile logs"
  ON public.subtile_approval_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can create subtile logs"
  ON public.subtile_approval_logs FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Keep model counters in sync
CREATE OR REPLACE FUNCTION public.sync_model_subtile_counters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_model uuid;
  cnt integer;
BEGIN
  target_model := COALESCE(NEW.model_id, OLD.model_id);
  SELECT count(*) INTO cnt FROM public.model_subtiles
    WHERE model_id = target_model AND is_approved_for_coordinates = true;
  UPDATE public.models
    SET approved_subtile_count = cnt,
        is_locked_in_catalog = (cnt > 0)
    WHERE id = target_model;
  RETURN NULL;
END;
$$;

CREATE TRIGGER sync_counters_on_subtile_change
  AFTER INSERT OR UPDATE OR DELETE ON public.model_subtiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_model_subtile_counters();