CREATE TABLE public.approval_sessions (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  performer_name text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.approval_sessions TO authenticated;
GRANT ALL ON public.approval_sessions TO service_role;
ALTER TABLE public.approval_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own approval session" ON public.approval_sessions FOR SELECT TO authenticated USING (user_id = auth.uid() AND session_id::text = auth.jwt()->>'session_id');

CREATE TABLE public.model_edit_locks (
  model_id uuid PRIMARY KEY REFERENCES public.models(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  owner_name text NOT NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);
GRANT SELECT ON public.model_edit_locks TO authenticated;
GRANT ALL ON public.model_edit_locks TO service_role;
ALTER TABLE public.model_edit_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read edit locks" ON public.model_edit_locks FOR SELECT TO authenticated USING (true);
ALTER TABLE public.models ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.assign_default_role() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.user_roles(user_id,role) VALUES (NEW.id,'viewer') ON CONFLICT(user_id,role) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.acquire_model_edit_lock(_model_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; owner text; lease public.model_edit_locks;
BEGIN
  sid := NULLIF(auth.jwt()->>'session_id','')::uuid;
  IF auth.uid() IS NULL OR sid IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin sign-in required'; END IF;
  PERFORM 1 FROM public.models WHERE id=_model_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Model not found'; END IF;
  SELECT COALESCE(NULLIF(display_name,''),NULLIF(username,''),'מנהל') INTO owner FROM public.profiles WHERE user_id=auth.uid() LIMIT 1;
  INSERT INTO public.model_edit_locks(model_id,user_id,session_id,owner_name)
  VALUES (_model_id,auth.uid(),sid,COALESCE(owner,'מנהל'))
  ON CONFLICT(model_id) DO UPDATE SET user_id=EXCLUDED.user_id, session_id=EXCLUDED.session_id, owner_name=EXCLUDED.owner_name, last_activity_at=now(), expires_at=now()+interval '10 minutes'
  WHERE model_edit_locks.expires_at <= now() OR (model_edit_locks.user_id=auth.uid() AND model_edit_locks.session_id=sid);
  SELECT * INTO lease FROM public.model_edit_locks WHERE model_id=_model_id;
  RETURN jsonb_build_object('owned',lease.user_id=auth.uid() AND lease.session_id=sid,'owner_name',lease.owner_name,'expires_at',lease.expires_at);
END; $$;
REVOKE ALL ON FUNCTION public.acquire_model_edit_lock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_model_edit_lock(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.release_model_edit_lock(_model_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  DELETE FROM public.model_edit_locks WHERE model_id=_model_id AND user_id=auth.uid() AND session_id::text=auth.jwt()->>'session_id';
END; $$;
REVOKE ALL ON FUNCTION public.release_model_edit_lock(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.release_model_edit_lock(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.approval_session_status(_touch boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE approval public.approval_sessions;
BEGIN
  SELECT * INTO approval FROM public.approval_sessions WHERE user_id=auth.uid() AND session_id::text=auth.jwt()->>'session_id' FOR UPDATE;
  IF NOT FOUND OR NOT public.has_role(auth.uid(),'admin') OR now() >= approval.last_activity_at + interval '30 minutes' OR now() >= approval.verified_at + interval '12 hours' THEN RETURN jsonb_build_object('valid',false); END IF;
  IF _touch THEN UPDATE public.approval_sessions SET last_activity_at=now() WHERE session_id=approval.session_id; END IF;
  RETURN jsonb_build_object('valid',true,'performer_name',approval.performer_name,'verified_at',approval.verified_at,'last_activity_at',CASE WHEN _touch THEN now() ELSE approval.last_activity_at END);
END; $$;
REVOKE ALL ON FUNCTION public.approval_session_status(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approval_session_status(boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.end_approval_session() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  DELETE FROM public.model_edit_locks WHERE user_id=auth.uid() AND session_id::text=auth.jwt()->>'session_id';
  DELETE FROM public.approval_sessions WHERE user_id=auth.uid() AND session_id::text=auth.jwt()->>'session_id';
END; $$;
REVOKE ALL ON FUNCTION public.end_approval_session() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.end_approval_session() TO authenticated,service_role;

REVOKE UPDATE,DELETE ON public.model_subtiles FROM authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.subtile_approval_logs FROM authenticated;

CREATE OR REPLACE FUNCTION public.protect_subtile_geometry() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF ROW(NEW.model_id,NEW.bbox_north,NEW.bbox_south,NEW.bbox_east,NEW.bbox_west) IS DISTINCT FROM ROW(OLD.model_id,OLD.bbox_north,OLD.bbox_south,OLD.bbox_east,OLD.bbox_west) THEN RAISE EXCEPTION 'Geometry is immutable'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER protect_subtile_geometry BEFORE UPDATE ON public.model_subtiles FOR EACH ROW EXECUTE FUNCTION public.protect_subtile_geometry();

CREATE OR REPLACE FUNCTION public.protect_model_catalog() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF EXISTS(SELECT 1 FROM public.model_subtiles WHERE model_id=OLD.id AND is_approved_for_coordinates) THEN RAISE EXCEPTION 'Approved model cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.is_published AND NOT NEW.is_published AND EXISTS(SELECT 1 FROM public.model_subtiles WHERE model_id=OLD.id AND is_approved_for_coordinates) THEN RAISE EXCEPTION 'Approved model cannot be unpublished'; END IF;
  IF ROW(NEW.bbox_north,NEW.bbox_south,NEW.bbox_east,NEW.bbox_west,NEW.center_lat,NEW.center_lng) IS DISTINCT FROM ROW(OLD.bbox_north,OLD.bbox_south,OLD.bbox_east,OLD.bbox_west,OLD.center_lat,OLD.center_lng) THEN RAISE EXCEPTION 'Geometry is immutable'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER protect_model_catalog BEFORE UPDATE OR DELETE ON public.models FOR EACH ROW EXECUTE FUNCTION public.protect_model_catalog();

CREATE OR REPLACE FUNCTION public.save_subtile_approval_changes(_model_id uuid,_changes jsonb,_performer_name text,_notes text DEFAULT NULL) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; approval public.approval_sessions; lease public.model_edit_locks; item jsonb; tile public.model_subtiles; changed_count integer:=0; requested boolean; amount integer;
BEGIN
  sid:=NULLIF(auth.jwt()->>'session_id','')::uuid;
  IF auth.uid() IS NULL OR sid IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin permission required'; END IF;
  PERFORM 1 FROM public.models WHERE id=_model_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Model not found'; END IF;
  SELECT * INTO lease FROM public.model_edit_locks WHERE model_id=_model_id FOR UPDATE;
  IF NOT FOUND OR lease.user_id<>auth.uid() OR lease.session_id<>sid OR lease.expires_at<=now() THEN RAISE EXCEPTION 'Edit lock expired or owned by another user'; END IF;
  SELECT * INTO approval FROM public.approval_sessions WHERE session_id=sid AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR now()>=approval.last_activity_at+interval '30 minutes' OR now()>=approval.verified_at+interval '12 hours' THEN RAISE EXCEPTION 'Approval verification required'; END IF;
  IF NULLIF(btrim(_performer_name),'') IS NULL OR btrim(_performer_name)<>approval.performer_name THEN RAISE EXCEPTION 'Verified performer name required'; END IF;
  IF jsonb_typeof(_changes) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Changes must be an array'; END IF;
  amount:=jsonb_array_length(_changes);
  IF amount=0 OR amount>10000 THEN RAISE EXCEPTION 'Invalid change count'; END IF;
  IF (SELECT count(DISTINCT value->>'subtile_id') FROM jsonb_array_elements(_changes))<>amount THEN RAISE EXCEPTION 'Duplicate sub-tile'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(_changes) LOOP
    IF jsonb_typeof(item->'approved') IS DISTINCT FROM 'boolean' OR jsonb_typeof(item->'expected_approved') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Approval flags required'; END IF;
    SELECT * INTO tile FROM public.model_subtiles WHERE id=(item->>'subtile_id')::uuid AND model_id=_model_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sub-tile does not belong to model'; END IF;
    IF tile.is_approved_for_coordinates IS DISTINCT FROM (item->>'expected_approved')::boolean THEN RAISE EXCEPTION 'Concurrent change: refresh and retry'; END IF;
    requested:=(item->>'approved')::boolean;
    IF tile.is_approved_for_coordinates IS NOT DISTINCT FROM requested THEN RAISE EXCEPTION 'Change contains no delta'; END IF;
    UPDATE public.model_subtiles SET is_approved_for_coordinates=requested,approved_by=CASE WHEN requested THEN auth.uid() ELSE NULL END,approved_at=CASE WHEN requested THEN now() ELSE NULL END WHERE id=tile.id;
    INSERT INTO public.subtile_approval_logs(subtile_id,model_id,action,performer_name,performed_by,notes) VALUES(tile.id,_model_id,CASE WHEN requested THEN 'approve' ELSE 'revoke' END,approval.performer_name,auth.uid(),NULLIF(btrim(_notes),''));
    changed_count:=changed_count+1;
  END LOOP;
  UPDATE public.approval_sessions SET last_activity_at=now() WHERE session_id=sid;
  UPDATE public.model_edit_locks SET last_activity_at=now(),expires_at=now()+interval '10 minutes' WHERE model_id=_model_id;
  RETURN changed_count;
END; $$;
REVOKE ALL ON FUNCTION public.save_subtile_approval_changes(uuid,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_subtile_approval_changes(uuid,jsonb,text,text) TO authenticated,service_role;
