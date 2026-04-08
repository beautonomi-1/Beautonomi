-- Support ticket uploads share the existing Storage bucket `message-attachments` with chat,
-- using object path prefix `support-tickets/{ticket_id}/{user_id}/...`.
-- See apps/web/src/lib/support/support-ticket-attachment-upload.ts
SELECT 1;
