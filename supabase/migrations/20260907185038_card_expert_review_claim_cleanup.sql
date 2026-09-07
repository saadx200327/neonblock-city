create or replace function private.release_stale_card_expert_reviews()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer;
begin
  update private.card_expert_review_queue
     set status='pending', claimed_at=null, last_error=coalesce(last_error,'stale claim released'), updated_at=now()
   where status='claimed' and claimed_at < now() - interval '20 minutes';
  get diagnostics v_count = row_count;
  delete from private.card_expert_review_tokens where expires_at < now() - interval '1 hour' or used_at < now() - interval '1 hour';
  return v_count;
end;
$$;
revoke all on function private.release_stale_card_expert_reviews() from public, anon, authenticated;
