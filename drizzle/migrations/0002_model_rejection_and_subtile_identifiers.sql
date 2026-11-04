ALTER TABLE public.models ADD COLUMN is_rejected boolean NOT NULL DEFAULT false;
CREATE SEQUENCE public.subtile_display_id_seq MINVALUE 1 MAXVALUE 99999999 NO CYCLE;
ALTER TABLE public.model_subtiles ADD COLUMN display_id text DEFAULT lpad(nextval('public.subtile_display_id_seq')::text,8,'0');
UPDATE public.model_subtiles SET display_id=lpad(nextval('public.subtile_display_id_seq')::text,8,'0') WHERE display_id IS NULL;
ALTER TABLE public.model_subtiles ADD CONSTRAINT subtile_display_id_format CHECK (display_id ~ '^[0-9]{8}$'), ADD CONSTRAINT subtile_display_id_unique UNIQUE(display_id);
GRANT USAGE ON SEQUENCE public.subtile_display_id_seq TO authenticated, service_role;
CREATE TABLE public.model_status_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), model_id uuid NOT NULL REFERENCES public.models(id), action text NOT NULL, performer_name text NOT NULL, performed_by uuid NOT NULL, notes text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.model_status_logs TO authenticated;
GRANT ALL ON public.model_status_logs TO service_role;
ALTER TABLE public.model_status_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated status history" ON public.model_status_logs FOR SELECT TO authenticated USING (true);
CREATE OR REPLACE FUNCTION public.guard_model_rejection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; a public.approval_sessions; l public.model_edit_locks; t public.model_subtiles;
BEGIN
 IF NEW.is_rejected IS NOT DISTINCT FROM OLD.is_rejected THEN RETURN NEW; END IF;
 sid:=NULLIF(auth.jwt()->>'session_id','')::uuid;
 IF auth.uid() IS NULL OR sid IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin verification required'; END IF;
 SELECT * INTO a FROM public.approval_sessions WHERE session_id=sid AND user_id=auth.uid();
 IF NOT FOUND OR now()>=a.last_activity_at+interval '30 minutes' OR now()>=a.verified_at+interval '12 hours' THEN RAISE EXCEPTION 'Approval verification required'; END IF;
 SELECT * INTO l FROM public.model_edit_locks WHERE model_id=OLD.id;
 IF NOT FOUND OR l.user_id<>auth.uid() OR l.session_id<>sid OR l.expires_at<=now() THEN RAISE EXCEPTION 'Edit lock required'; END IF;
 IF NEW.is_rejected THEN
  FOR t IN SELECT * FROM public.model_subtiles WHERE model_id=OLD.id AND is_approved_for_coordinates FOR UPDATE LOOP
   UPDATE public.model_subtiles SET is_approved_for_coordinates=false,approved_by=NULL,approved_at=NULL WHERE id=t.id;
   INSERT INTO public.subtile_approval_logs(subtile_id,model_id,action,performer_name,performed_by,notes) VALUES(t.id,OLD.id,'revoke',a.performer_name,auth.uid(),'Model rejected');
  END LOOP;
 END IF;
 INSERT INTO public.model_status_logs(model_id,action,performer_name,performed_by) VALUES(OLD.id,CASE WHEN NEW.is_rejected THEN 'reject' ELSE 'restore' END,a.performer_name,auth.uid());
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_rejection BEFORE UPDATE OF is_rejected ON public.models FOR EACH ROW EXECUTE FUNCTION public.guard_model_rejection();
CREATE OR REPLACE FUNCTION public.guard_subtile_identity_and_rejection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.display_id IS DISTINCT FROM OLD.display_id THEN RAISE EXCEPTION 'Subtile identifier is immutable'; END IF;
 IF NEW.display_id IS NULL THEN RAISE EXCEPTION 'Subtile identifier required'; END IF;
 IF NEW.is_approved_for_coordinates AND EXISTS(SELECT 1 FROM public.models WHERE id=NEW.model_id AND is_rejected) THEN RAISE EXCEPTION 'Rejected models cannot be approved or used'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_subtile_identity_rejection BEFORE INSERT OR UPDATE ON public.model_subtiles FOR EACH ROW EXECUTE FUNCTION public.guard_subtile_identity_and_rejection();
CREATE OR REPLACE FUNCTION public.save_model_workspace(_model_id uuid,_changes jsonb,_performer_name text,_rejected boolean,_expected_rejected boolean,_notes text DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.models; a public.approval_sessions; l public.model_edit_locks; sid uuid; n integer:=0;
BEGIN
 sid:=NULLIF(auth.jwt()->>'session_id','')::uuid;
 IF auth.uid() IS NULL OR sid IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin permission required'; END IF;
 SELECT * INTO m FROM public.models WHERE id=_model_id FOR UPDATE;
 IF NOT FOUND OR m.is_rejected IS DISTINCT FROM _expected_rejected THEN RAISE EXCEPTION 'Model changed: refresh and retry'; END IF;
 SELECT * INTO a FROM public.approval_sessions WHERE session_id=sid AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR now()>=a.last_activity_at+interval '30 minutes' OR now()>=a.verified_at+interval '12 hours' OR NULLIF(btrim(_performer_name),'') IS NULL OR btrim(_performer_name)<>a.performer_name THEN RAISE EXCEPTION 'Fresh approval verification required'; END IF;
 SELECT * INTO l FROM public.model_edit_locks WHERE model_id=_model_id FOR UPDATE;
 IF NOT FOUND OR l.user_id<>auth.uid() OR l.session_id<>sid OR l.expires_at<=now() THEN RAISE EXCEPTION 'Edit lock required'; END IF;
 IF _changes IS NULL OR jsonb_typeof(_changes)<>'array' THEN RAISE EXCEPTION 'Changes must be an array'; END IF;
 IF _rejected AND jsonb_array_length(_changes)>0 THEN RAISE EXCEPTION 'Cannot approve rejected model'; END IF;
 IF m.is_rejected IS DISTINCT FROM _rejected THEN
  UPDATE public.models SET is_rejected=_rejected WHERE id=_model_id;
 END IF;
 IF jsonb_array_length(_changes)>0 THEN n:=public.save_subtile_approval_changes(_model_id,_changes,_performer_name,_notes); END IF;
 UPDATE public.approval_sessions SET last_activity_at=now() WHERE session_id=sid;
 RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.save_model_workspace(uuid,jsonb,text,boolean,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_model_workspace(uuid,jsonb,text,boolean,boolean,text) TO authenticated;