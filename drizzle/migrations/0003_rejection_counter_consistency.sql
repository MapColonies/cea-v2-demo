DROP TRIGGER guard_rejection ON public.models;
CREATE TRIGGER guard_rejection AFTER UPDATE OF is_rejected ON public.models FOR EACH ROW EXECUTE FUNCTION public.guard_model_rejection();