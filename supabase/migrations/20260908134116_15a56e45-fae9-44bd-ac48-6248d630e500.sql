CREATE OR REPLACE FUNCTION public.save_subtile_approval_changes(
  _model_id uuid,
  _changes jsonb,
  _performer_name text,
  _notes text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin permission required';
  END IF;

  IF NULLIF(btrim(_performer_name), '') IS NULL THEN
    RAISE EXCEPTION 'Performer name is required';
  END IF;

  IF jsonb_typeof(_changes) <> 'array' OR jsonb_array_length(_changes) = 0 THEN
    RAISE EXCEPTION 'At least one change is required';
  END IF;

  WITH requested AS (
    SELECT
      (item->>'subtile_id')::uuid AS subtile_id,
      (item->>'approved')::boolean AS approved
    FROM jsonb_array_elements(_changes) AS item
  ), updated AS (
    UPDATE public.model_subtiles AS tile
    SET
      is_approved_for_coordinates = requested.approved,
      approved_by = CASE WHEN requested.approved THEN auth.uid() ELSE NULL END,
      approved_at = CASE WHEN requested.approved THEN now() ELSE NULL END
    FROM requested
    WHERE tile.id = requested.subtile_id
      AND tile.model_id = _model_id
      AND tile.is_approved_for_coordinates IS DISTINCT FROM requested.approved
    RETURNING tile.id, tile.model_id, tile.is_approved_for_coordinates
  )
  INSERT INTO public.subtile_approval_logs (
    subtile_id,
    model_id,
    action,
    performer_name,
    performed_by,
    notes
  )
  SELECT
    id,
    model_id,
    CASE WHEN is_approved_for_coordinates THEN 'approve' ELSE 'revoke' END,
    btrim(_performer_name),
    auth.uid(),
    NULLIF(btrim(_notes), '')
  FROM updated;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.save_subtile_approval_changes(uuid, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_subtile_approval_changes(uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_subtile_approval_changes(uuid, jsonb, text, text) TO service_role;