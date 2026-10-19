-- Renaming a case updates its title. The live cases table allowed updates to the
-- transcript, results and notes columns but not the title, so Rename was denied.
-- Row-level security still limits every update to the case owner.
grant update (title) on public.cases to authenticated;
