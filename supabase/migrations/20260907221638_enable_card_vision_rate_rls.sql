alter table private.card_vision_rate_events enable row level security;
revoke all on table private.card_vision_rate_events from public, anon, authenticated;
