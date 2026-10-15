import fs from "node:fs";
const src =
  "c:/Users/NoloSehlolo/Documents/Beautonomi/supabase/migrations/815_compliance_reset_tenant_paycloud_yoco_memberships.sql";
const out =
  "c:/Users/NoloSehlolo/Documents/Beautonomi/supabase/migrations/1001_compliance_reset_zoho_support.sql";
let c = fs.readFileSync(src, "utf8");
c = c.replace(
  "-- 815:",
  "-- 1001: Zoho support mail rows in compliance_reset (after 1000)",
);
const ins = `    {"t": "support_mail_messages", "where": "mailbox_id IN (SELECT id FROM public.support_mailboxes WHERE tenant_id = $1)", "via": "support_mailbox"},
    {"t": "support_mail_ack_log", "where": "mailbox_id IN (SELECT id FROM public.support_mailboxes WHERE tenant_id = $1)", "via": "support_mailbox"},
    {"t": "support_tickets", "where": "tenant_id = $1", "via": "tenant_id"},
    {"t": "support_mailboxes", "where": "tenant_id = $1", "via": "tenant_id"},
`;
c = c.replace(
  '    {"t": "support_tickets",             "where": "provider_id IN',
  ins + '    {"t": "support_tickets",             "where": "provider_id IN',
);
fs.writeFileSync(out, c);
