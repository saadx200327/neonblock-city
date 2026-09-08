create or replace function private.issue_card_expert_review_token(p_review_id uuid, p_ttl_seconds integer default 300)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_ttl integer := greatest(60, least(coalesce(p_ttl_seconds,300),600));
begin
  if not exists (
    select 1
      from private.card_expert_review_queue q
     where q.id = p_review_id
       and q.status in ('pending','claimed')
  ) then
    raise exception 'review_not_available';
  end if;

  delete from private.card_expert_review_tokens
   where expires_at < now()
      or (used_at is not null and used_at < now() - interval '1 hour');

  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into private.card_expert_review_tokens(review_id, token_hash, expires_at)
  values (
    p_review_id,
    encode(extensions.digest(v_token,'sha256'),'hex'),
    now() + make_interval(secs => v_ttl)
  );

  -- Issuing a token is not a review attempt. The queue is claimed and the
  -- attempt counter advances only when card-expert-review actually redeems
  -- the one-use token. This prevents unavailable reviewer transports from
  -- creating false attempts or stale claims.
  return v_token;
end;
$$;

revoke all on function private.issue_card_expert_review_token(uuid,integer) from public, anon, authenticated;
