-- Order emails are not reminders: no "stop these emails" footer and no List-Unsubscribe header.
create or replace function public._send_email(p_to text, p_subject text, p_html text, p_unsub_url text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare k text; f text; h jsonb := '{}'::jsonb;
begin
  select value into k from public.app_secrets where name = 'resend_api_key';
  select value into f from public.app_secrets where name = 'reminder_from';
  if k is null or k = '' or f is null or f = '' or p_to is null then return null; end if;
  if p_unsub_url is not null then h := jsonb_build_object('List-Unsubscribe', '<' || p_unsub_url || '>'); end if;
  return net.http_post(
    url := 'https://api.resend.com/emails',
    body := jsonb_build_object('from', f, 'to', jsonb_build_array(p_to), 'subject', p_subject, 'html', p_html, 'headers', h),
    headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'),
    timeout_milliseconds := 10000);
end $$;

create or replace function public._order_email(p_body text) returns text
language sql immutable set search_path = '' as $$
  select '<div style="background:#E7ECE3;padding:24px 12px;font-family:Georgia,serif;color:#14302A">'
    || '<div style="max-width:520px;margin:0 auto;background:#F8FAF5;border:1.5px solid #14302A;border-radius:14px;padding:28px">'
    || '<p style="margin:0 0 18px;font-family:Arial,sans-serif;font-weight:800;font-size:20px">Homeday</p>'
    || p_body
    || '<p style="margin:28px 0 0;font-family:Arial,sans-serif;font-size:13px;color:#4A665B">Questions? Reply to this email.</p>'
    || '</div></div>';
$$;
revoke execute on function public._order_email(text), public._send_email(text, text, text, text) from public, anon, authenticated;

create or replace function public.submit_manual_payment(p_id text, p_item text, p_name text, p_email text, p_ref text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.timelines; nm text := trim(coalesce(p_name, '')); em text := lower(trim(coalesce(p_email, '')));
        rf text := upper(regexp_replace(coalesce(p_ref, ''), '[\s-]', '', 'g')); refno text; site text; owner text;
begin
  select * into t from public.timelines where id = p_id;
  if not found then raise exception 'no timeline'; end if;
  if p_item not in ('digital', 'gift') then raise exception 'bad item'; end if;
  if char_length(nm) not between 2 and 80 then raise exception 'bad name'; end if;
  if em !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(em) > 254 then raise exception 'bad email'; end if;
  if rf !~ '^[A-Z0-9]{8,30}$' then raise exception 'bad reference'; end if;
  if exists (select 1 from public.orders where provider = 'manual' and status <> 'rejected' and upper(payer_ref) = rf) then
    raise exception 'reference used';
  end if;
  if (select count(*) from public.orders where provider = 'manual' and timeline_id = p_id and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.orders where provider = 'manual' and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'too many';
  end if;
  refno := 'HD-' || p_id || '-' || p_item || '-' || public._rand_id(8);
  insert into public.orders (reference, timeline_id, item, expected_amount, currency, provider, status, email, payer_name, payer_ref)
  values (refno, p_id, p_item, 69900, 'PHP', 'manual', 'pending', em, nm, rf);

  select value into site from public.app_secrets where name = 'site_url';
  select value into owner from public.app_secrets where name = 'owner_email';
  perform public._send_email(owner, 'Check a ₱699 payment: ' || rf,
    public._order_email('<h1 style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:22px">Check a payment of ₱699</h1>'
      || '<p style="font-size:17px;line-height:1.5;margin:0 0 16px">' || public._esc(nm) || ' (' || public._esc(em) || ') says they paid for '
      || public._esc(t.name) || '''s keepsake. Reference number: <b>' || rf || '</b>.</p>'
      || '<p style="margin:0"><a href="' || site || '/admin" style="color:#14302A">Confirm or reject it</a></p>'), null);
  return jsonb_build_object('reference', refno);
end $$;

create or replace function public.admin_review(p_key text, p_order bigint, p_ok boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare o public.orders; t public.timelines; site text; link text;
begin
  if not public._admin_ok(p_key) then raise exception 'denied'; end if;
  select * into o from public.orders where id = p_order and provider = 'manual' for update;
  if not found then return 'unknown'; end if;
  if o.status <> 'pending' then return o.status; end if;
  update public.orders set status = case when p_ok then 'paid' else 'rejected' end,
    amount_total = case when p_ok then o.expected_amount end, paid_at = case when p_ok then now() end,
    livemode = true, reviewed_at = now()
  where id = o.id;
  if p_ok then
    select * into t from public.timelines where id = o.timeline_id;
    select value into site from public.app_secrets where name = 'site_url';
    link := site || '/keepsake/' || o.timeline_id;
    perform public._send_email(o.email, 'Your Homeday keepsake for ' || public._plain(t.name) || ' is ready',
      public._order_email('<h1 style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:24px">Payment received. Your keepsake is ready.</h1>'
        || '<p style="font-size:17px;line-height:1.5;margin:0 0 20px">Thank you. The poster and certificate for ' || public._esc(t.name)
        || ' are unlocked. Print them at home or save them as a PDF.</p>'
        || '<p style="margin:0"><a href="' || link || '" style="display:inline-block;background:#D3E24A;color:#14302A;border:1.5px solid #14302A;border-radius:999px;padding:11px 20px;font-family:Arial,sans-serif;font-weight:700;text-decoration:none">Open the keepsake</a></p>'), null);
  end if;
  return case when p_ok then 'paid' else 'rejected' end;
end $$;

revoke execute on function public.submit_manual_payment(text, text, text, text, text), public.admin_review(text, bigint, boolean) from public;
grant execute on function public.submit_manual_payment(text, text, text, text, text), public.admin_review(text, bigint, boolean) to anon, authenticated;
