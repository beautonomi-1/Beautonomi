# Support And Leads Mobile QA — 2026-05-11

## Support Threads

| Surface | Scenario | Expected |
| --- | --- | --- |
| Admin Vite SPA | Reply publicly with attachment | Customer sees support bubble, attachment, and unread/list indicator. |
| Admin Vite SPA | Save internal note | Message is amber, marked internal, and does not appear on customer/provider surfaces. |
| Customer web | Leave ticket open while staff replies | Thread refreshes within 30 seconds while tab is visible. |
| Customer mobile | Pull to refresh ticket detail | New staff reply appears and the list badge clears after opening. |
| Provider mobile | Attach image and reply | Image uploads, appears as a pending attachment, then renders in the sent bubble. |

## Lead Inbox

| Device | Scenario | Expected |
| --- | --- | --- |
| Phone width | Open Lead Inbox | Card view is selected by default unless URL `view` overrides it. |
| Phone width | Open filters | Bottom sheet appears over the inbox; list position is preserved. |
| Phone width | Select multiple leads | Bulk action bar stays usable without squeezing the toolbar. |
| Tablet width | Toggle compact density | Lead rows/cards tighten and setting persists after reload. |

## Lead Detail

| Device | Scenario | Expected |
| --- | --- | --- |
| Phone width | Edit lead fields | Inputs are full-width, 16px text, and do not trigger iOS zoom. |
| Phone width | Header actions wrap | Edit, call, email, WhatsApp, delete remain 44px+ touch targets. |
| Phone width | Add activity note | Input and button stack cleanly and timeline remains readable. |
