-- Make support tickets measurable by requester type, marketplace context, and customer CSAT submission time.

alter table public.support_tickets
  add column if not exists requester_type text,
  add column if not exists support_context_type text,
  add column if not exists support_context_id uuid,
  add column if not exists support_context_label text,
  add column if not exists csat_submitted_at timestamptz,
  add column if not exists csat_agent_id uuid references public.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_tickets_requester_type_check'
      and conrelid = 'public.support_tickets'::regclass
  ) then
    alter table public.support_tickets
      add constraint support_tickets_requester_type_check
      check (requester_type is null or requester_type in ('customer', 'provider', 'admin'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'support_tickets_context_type_check'
      and conrelid = 'public.support_tickets'::regclass
  ) then
    alter table public.support_tickets
      add constraint support_tickets_context_type_check
      check (
        support_context_type is null or support_context_type in (
          'booking',
          'product_order',
          'gift_card',
          'payment',
          'provider_onboarding',
          'account',
          'technical',
          'other'
        )
      );
  end if;
end $$;

update public.support_tickets
set requester_type = case
  when provider_id is not null then 'provider'
  else 'customer'
end
where requester_type is null;

update public.support_tickets
set csat_agent_id = assigned_to
where csat_score is not null
  and csat_agent_id is null
  and assigned_to is not null;

create index if not exists idx_support_tickets_requester_type
  on public.support_tickets (requester_type);

create index if not exists idx_support_tickets_context_type
  on public.support_tickets (support_context_type);

create index if not exists idx_support_tickets_csat_agent
  on public.support_tickets (csat_agent_id, csat_submitted_at desc)
  where csat_score is not null;
