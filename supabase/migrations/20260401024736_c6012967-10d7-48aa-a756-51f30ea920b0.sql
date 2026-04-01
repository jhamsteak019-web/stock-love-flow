
CREATE TABLE public.damage_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_name TEXT NOT NULL,
  sspoa_no TEXT,
  sspoa_mhb TEXT,
  sspoa_mlp TEXT,
  sspoa_msh TEXT,
  sspoa_mum TEXT,
  cat_mhb NUMERIC DEFAULT 0,
  cat_mlp NUMERIC DEFAULT 0,
  cat_msh NUMERIC DEFAULT 0,
  cat_mum NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  damage TEXT,
  date_sent TEXT,
  status TEXT,
  remarks TEXT,
  box_qty NUMERIC DEFAULT 0,
  date_of_backload TEXT,
  date_of_received TEXT,
  remarks2 TEXT,
  branch_id UUID REFERENCES public.branches(id),
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.damage_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view damage claims"
ON public.damage_claims FOR SELECT TO authenticated
USING (deleted_at IS NULL);

CREATE POLICY "Admin and staff can insert damage claims"
ON public.damage_claims FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'staff') OR
  public.has_role(auth.uid(), 'encoder') OR
  public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Admin can update damage claims"
ON public.damage_claims FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Admin can delete damage claims"
ON public.damage_claims FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
