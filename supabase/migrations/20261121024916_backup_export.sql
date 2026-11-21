-- Weekly backup: the GitHub "Weekly backup" job calls backup_export with the backup key, saves the
-- result and every photo, encrypts them and keeps them for 90 days. Only the key's hash is stored here.
-- Secrets (app_secrets) and the song chart (rebuilt from supabase/seed) are left out on purpose.
create or replace function public.backup_export(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(p_key, '') = '' or not exists (select 1 from public.app_secrets
     where name = 'backup_key_hash' and value = encode(extensions.digest(p_key, 'sha256'), 'hex')) then
    raise exception 'denied';
  end if;
  return jsonb_build_object(
    'format', 1,
    'taken_at', now(),
    'tables', jsonb_build_object(
      'timelines', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.timelines t), '[]'::jsonb),
      'guestbook', coalesce((select jsonb_agg(to_jsonb(g) order by g.id) from public.guestbook g), '[]'::jsonb),
      'orders',    coalesce((select jsonb_agg(to_jsonb(o) order by o.id) from public.orders o), '[]'::jsonb),
      'reminders', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.reminders r), '[]'::jsonb)),
    'photos', coalesce((select jsonb_agg(o.name order by o.name) from storage.objects o where o.bucket_id = 'photos'), '[]'::jsonb));
end $$;
revoke execute on function public.backup_export(text) from public, anon, authenticated;
grant execute on function public.backup_export(text) to anon;
