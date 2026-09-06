-- Keep provider/integration operational state outside the exposed public schema.
create schema if not exists private;
revoke all on schema private from anon, authenticated;

alter table public.provider_status set schema private;
revoke all on table private.provider_status from anon, authenticated;
comment on table private.provider_status is 'Server/admin-only integration health state. Not exposed to browser clients.';
