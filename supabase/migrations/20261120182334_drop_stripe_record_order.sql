-- Stripe was replaced by PayMongo; its order function is no longer called.
drop function if exists public.record_order(text, jsonb);
