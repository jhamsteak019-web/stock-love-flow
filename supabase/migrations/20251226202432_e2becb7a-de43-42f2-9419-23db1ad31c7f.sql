-- Enable realtime for notes table so status updates sync across users
ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;