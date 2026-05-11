-- Track support thread recency and customer unread state for customer-facing UX.

alter table public.support_tickets
  add column if not exists last_message_at timestamptz,
  add column if not exists last_message_from text,
  add column if not exists last_customer_view_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'support_tickets_last_message_from_check'
      and conrelid = 'public.support_tickets'::regclass
  ) then
    alter table public.support_tickets
      add constraint support_tickets_last_message_from_check
      check (last_message_from is null or last_message_from in ('customer', 'staff'));
  end if;
end $$;

with latest_public_message as (
  select distinct on (m.ticket_id)
    m.ticket_id,
    m.created_at,
    case
      when m.user_id = t.user_id then 'customer'
      else 'staff'
    end as message_from
  from public.support_ticket_messages m
  join public.support_tickets t on t.id = m.ticket_id
  where coalesce(m.is_internal, false) = false
  order by m.ticket_id, m.created_at desc
)
update public.support_tickets t
set
  last_message_at = l.created_at,
  last_message_from = l.message_from,
  -- Avoid retroactively marking every historical staff reply as unread.
  last_customer_view_at = coalesce(t.last_customer_view_at, t.updated_at, l.created_at)
from latest_public_message l
where t.id = l.ticket_id;

create index if not exists idx_support_tickets_last_message_at
  on public.support_tickets (last_message_at desc);

create index if not exists idx_support_tickets_unread_customer
  on public.support_tickets (user_id, last_message_from, last_message_at, last_customer_view_at);
