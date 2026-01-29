-- RLS Policies for 'assistant' role - can view and edit but NOT delete

-- stock_releases
CREATE POLICY "Assistant can create releases"
ON public.stock_releases FOR INSERT
WITH CHECK (has_role(auth.uid(), 'assistant'::app_role) AND released_by = auth.uid());

CREATE POLICY "Assistant can update releases"
ON public.stock_releases FOR UPDATE
USING (has_role(auth.uid(), 'assistant'::app_role))
WITH CHECK (has_role(auth.uid(), 'assistant'::app_role));

-- attendance_records
CREATE POLICY "Assistant can insert attendance records"
ON public.attendance_records FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'assistant'::app_role));

CREATE POLICY "Assistant can update attendance records"
ON public.attendance_records FOR UPDATE
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'assistant'::app_role))
WITH CHECK (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'assistant'::app_role));

-- employees
CREATE POLICY "Assistant can insert employees"
ON public.employees FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'assistant'::app_role));

CREATE POLICY "Assistant can update employees"
ON public.employees FOR UPDATE
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'assistant'::app_role))
WITH CHECK (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'assistant'::app_role));

-- repeat_orders
CREATE POLICY "Assistant can insert repeat orders"
ON public.repeat_orders FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'assistant'::app_role));

CREATE POLICY "Assistant can update repeat orders"
ON public.repeat_orders FOR UPDATE
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'assistant'::app_role))
WITH CHECK (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'assistant'::app_role));

-- containers
CREATE POLICY "Assistant can insert containers"
ON public.containers FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'assistant'::app_role));

CREATE POLICY "Assistant can update containers"
ON public.containers FOR UPDATE
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'assistant'::app_role))
WITH CHECK (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'assistant'::app_role));

-- tasks
CREATE POLICY "Assistant can create tasks"
ON public.tasks FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'assistant'::app_role));

CREATE POLICY "Assistant can update tasks"
ON public.tasks FOR UPDATE
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'assistant'::app_role));

-- notes
CREATE POLICY "Assistant can create notes"
ON public.notes FOR INSERT
WITH CHECK (auth.uid() = user_id AND has_role(auth.uid(), 'assistant'::app_role));

CREATE POLICY "Assistant can update notes"
ON public.notes FOR UPDATE
USING (has_role(auth.uid(), 'assistant'::app_role));