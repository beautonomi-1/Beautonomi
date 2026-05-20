-- Atomic click accounting for public express booking links.
-- Prevents concurrent opens from exceeding max_uses.

create or replace function public.increment_express_booking_link_use(
  p_link_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.express_booking_links
  set
    use_count = coalesce(use_count, 0) + 1,
    updated_at = now()
  where id = p_link_id
    and is_active is distinct from false
    and (expires_at is null or expires_at > now())
    and (max_uses is null or coalesce(use_count, 0) < max_uses);

  return found;
end;
$$;

grant execute on function public.increment_express_booking_link_use(uuid) to anon;
grant execute on function public.increment_express_booking_link_use(uuid) to authenticated;
grant execute on function public.increment_express_booking_link_use(uuid) to service_role;
