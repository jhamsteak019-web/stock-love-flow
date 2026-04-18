
Goal: Ayusin ang delete sa Damage Claims.

What I found
- Hindi frontend click problem ang sira.
- Ang actual request ay `PATCH /damage_claims ... { deleted_at: ... }` at bumabalik ng `403` with:
  `new row violates row-level security policy for table "damage_claims"`.
- Ibig sabihin: soft-delete ang ginagawa ng UI, pero binablock ng backend policy ang update na nagse-set ng `deleted_at`.

Plan
1. Fix the backend policy for `damage_claims`
- Gumawa ng migration para i-drop at i-recreate ang `UPDATE` policy ng `damage_claims`.
- Siguraduhin na pareho ang `USING` at `WITH CHECK` logic para pumayag sa soft-delete update.
- I-keep ang access rules na naka-pattern na sa app:
  - Admin: puwedeng mag-delete
  - Assistant: puwedeng mag-edit
- Kung needed, i-recreate rin ang `DELETE` policy para consistent ang permissions.

2. Keep the UI on soft-delete
- Hindi ko papalitan sa hard delete.
- Mananatili ang current flow sa `src/pages/DamageClaims.tsx` na nagse-set ng `deleted_at`.
- Ito ang tama base sa project memory: universal soft-delete dapat.

3. Improve the error handling in Damage Claims
- Palitan ang generic toast na “Failed to delete”.
- Ipakita ang tunay na backend error message para mas madaling ma-debug kung may issue ulit.
- Optional small polish: disable the delete confirm button habang pending para iwas double click.

4. Verify related consistency
- Since same soft-delete pattern exists across the app, iche-check ko rin kung may kaparehong policy mismatch sa ibang bagong modules na ginawa recently, lalo na yung gumagamit din ng `deleted_at`.
- Hindi ko gagalawin ang unrelated pages unless may clear mismatch.

Files/touchpoints
- `supabase/migrations/...sql` — policy fix for `damage_claims`
- `src/pages/DamageClaims.tsx` — better delete error handling / minor UX polish

Expected result
- Kapag pinindot ang trash icon at kinonfirm ang delete, mawawala na ang row sa table.
- Wala nang red toast na “Failed to delete”.
- Record will be soft-deleted, not permanently removed.

Technical details
- Root cause is RLS, not button wiring.
- The failing network response already shows `42501` policy violation on update.
- Because the UI deletes via `UPDATE deleted_at = now()`, the table needs an `UPDATE` policy whose `WITH CHECK` still allows the updated row after `deleted_at` changes.
