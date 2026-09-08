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

  -- A plaintext token is intentionally never persisted. Reissuing therefore
  -- invalidates any prior unused token for this review before creating a new
  -- one. This also satisfies the one-live-token unique index deterministically.
  delete from private.card_expert_review_tokens
   where review_id = p_review_id
      or expires_at < now()
      or (used_at is not null and used_at < now() - interval '1 hour');

  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into private.card_expert_review_tokens(review_id, token_hash, expires_at)
  values (
    p_review_id,
    encode(extensions.digest(v_token,'sha256'),'hex'),
    now() + make_interval(secs => v_ttl)
  );

  -- Issuance alone is not a review attempt and does not claim the queue row.
  -- card-expert-review advances status/attempts only when this token is
  -- actually redeemed by an image-capable reviewer transport.
  return v_token;
end;
$$;

revoke all on function private.issue_card_expert_review_token(uuid,integer) from public, anon, authenticated;
