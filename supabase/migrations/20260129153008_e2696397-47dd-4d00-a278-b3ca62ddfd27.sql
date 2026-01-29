-- Add Assistant policies for store_visit_schedules
CREATE POLICY "Assistant can insert store visit schedules"
ON public.store_visit_schedules
FOR INSERT
WITH CHECK ((auth.uid() IS NOT NULL) AND has_role(auth.uid(), 'assistant'::app_role));

CREATE POLICY "Assistant can update store visit schedules"
ON public.store_visit_schedules
FOR UPDATE
USING ((auth.uid() IS NOT NULL) AND has_role(auth.uid(), 'assistant'::app_role))
WITH CHECK ((auth.uid() IS NOT NULL) AND has_role(auth.uid(), 'assistant'::app_role));

-- Add HR UPDATE policy for employees (was missing)
CREATE POLICY "HR can update employees"
ON public.employees
FOR UPDATE
USING ((auth.uid() IS NOT NULL) AND has_role(auth.uid(), 'hr'::app_role))
WITH CHECK ((auth.uid() IS NOT NULL) AND has_role(auth.uid(), 'hr'::app_role));