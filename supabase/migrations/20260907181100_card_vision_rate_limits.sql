create table if not exists private.card_vision_rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  mode text not null check (mode in ('identify','compare')),
  created_at timestamptz not null default now()
);

create index if not exists card_vision_rate_events_user_created_idx
  on private.card_vision_rate_events(user_id, created_at desc);

revoke all on table private.card_vision_rate_events from anon, authenticated;
revoke all on sequence private.card_vision_rate_events_id_seq from anon, authenticated;
