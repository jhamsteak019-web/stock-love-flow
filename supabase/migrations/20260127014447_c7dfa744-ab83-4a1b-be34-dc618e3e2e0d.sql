-- Allow encoder to create stock releases
CREATE POLICY "Encoder can create releases"
ON public.stock_releases
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'encoder'::app_role) AND released_by = auth.uid()
);

-- Allow encoder to update stock releases (but not delete)
CREATE POLICY "Encoder can update releases"
ON public.stock_releases
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'encoder'::app_role))
WITH CHECK (has_role(auth.uid(), 'encoder'::app_role));