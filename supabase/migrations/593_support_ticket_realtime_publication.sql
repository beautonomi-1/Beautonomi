-- Enable Supabase realtime for support_tickets and support_ticket_messages so
-- the admin-web can receive live updates when ticket status or messages change.
-- REPLICA IDENTITY FULL is set so UPDATE payloads include the old row values.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_tickets'
  ) then
    alter publication supabase_realtime add table public.support_tickets;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_ticket_messages'
  ) then
    alter publication supabase_realtime add table public.support_ticket_messages;
  end if;
end $$;

alter table public.support_tickets replica identity full;
alter table public.support_ticket_messages replica identity full;
