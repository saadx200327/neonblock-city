-- Cardfolio shared market privilege hardening. Applied to production 2026-09-06.
-- RLS is not a substitute for object-level privilege hygiene; clients only need SELECT.

revoke all privileges on table public.canonical_cards from anon,authenticated;
revoke all privileges on table public.card_market_observations from anon,authenticated;
revoke all privileges on table public.canonical_price_history from anon,authenticated;
revoke all privileges on table public.card_variant_catalog from anon,authenticated;
revoke all privileges on table public.card_market_research_runs from anon,authenticated;

grant select on table public.canonical_cards to anon,authenticated;
grant select on table public.card_market_observations to anon,authenticated;
grant select on table public.canonical_price_history to anon,authenticated;
grant select on table public.card_variant_catalog to anon,authenticated;
grant select on table public.card_market_research_runs to anon,authenticated;
