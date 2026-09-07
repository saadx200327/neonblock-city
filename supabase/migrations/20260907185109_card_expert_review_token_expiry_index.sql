create index if not exists card_expert_review_tokens_expiry_idx on private.card_expert_review_tokens (expires_at) where used_at is null;
