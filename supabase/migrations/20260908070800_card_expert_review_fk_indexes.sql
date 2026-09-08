create index if not exists card_expert_review_queue_user_id_idx
  on private.card_expert_review_queue (user_id);

create index if not exists card_expert_visual_memory_canonical_card_id_idx
  on private.card_expert_visual_memory (canonical_card_id);

create index if not exists card_expert_visual_memory_source_review_id_idx
  on private.card_expert_visual_memory (source_review_id);
