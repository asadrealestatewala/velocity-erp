# Mail in the platform console

`/platform/mail` is where operators manage everything the platform sends and receives.

| Tab | What it does | Who |
| --- | --- | --- |
| Inbox | Mail received at `support@` / `billing@`; read, reply (threaded), mark open / resolved / spam | Owner (all mailboxes), Support (`support@`), Billing (`billing@`) |
| Sent log | Every email sent, with sender, type and delivery status (sent, delivered, delayed, bounced, complained, failed, not sent) | same |
| Templates | Edit the wording of the onboarding and billing emails, preview with sample data, send a test | Owner |
| Mailboxes & setup | Sender identities (address, name, reply-to, signature), which mailbox sends which kind of email, inbound setup | Owner |
| Branding | Company name, logo, colour, address, website, support contact and footer used on **every** email | Owner |

## Sender identities

Three mailboxes are created on first use (domain = `MAIL_DOMAIN`, else the domain of `MAIL_FROM`, else `velocityerp.co`):

* `no-reply@` — onboarding, sign-in/security and system email (the address in `MAIL_FROM`)
* `billing@` — receipts, payment problems, renewal and trial reminders, plan changes
* `support@` — staff replies

Mail Routing in *Mailboxes & setup* decides which mailbox each category is sent from. Replies written in the inbox always go out
from the mailbox the message arrived at. If a mailbox is switched off or missing, mail falls back to `no-reply@`, then to `MAIL_FROM`.

## Templates

`welcome`, `confirm-email`, `trial-started`, `trial-ending`, `invite`, `payment-receipt`, `payment-failed`, `password-reset`.
Wording is edited with `{{variables}}` (listed beside each editor; unknown variables are rejected on save). Account-critical templates
(`confirm-email`, `invite`, `password-reset`, `payment-failed`, `payment-receipt`) can be re-worded but not switched off.
"Restore built-in wording" deletes the override. Messages that carry a one-time link are logged **without** their body.

## Receiving mail and delivery status (Resend)

Sending needs only `RESEND_API_KEY` and a verified domain (already done for `velocityerp.co`). To receive mail and track delivery:

1. **Resend → Domains → your domain → Receiving**: enable it and add the **MX record** Resend shows at your DNS host. Wait for *verified*.
   * An MX record on the root domain routes **all** mail for that domain to Resend. If staff already read email on this domain
     (Google Workspace, Zoho, …) do not do this; use a subdomain (for example `support@mail.velocityerp.co`) and change the mailbox
     address in the console.
2. **Resend → Webhooks → Add endpoint**: URL `https://<APP_URL>/api/platform/mail/webhook/resend`; events `email.received`,
   `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`.
3. Copy the endpoint's **signing secret** (`whsec_…`) and either set `RESEND_WEBHOOK_SECRET` on the server or paste it under
   *Mail → Mailboxes & setup* (stored encrypted, never shown again).
4. Send a message to `support@<domain>` from an outside address; it appears in the Inbox. The server also needs `RESEND_API_KEY`
   because Resend's webhook carries only the envelope; the body is fetched from the Resend API.

The endpoint verifies the Svix signature (HMAC-SHA256, 5-minute window), is idempotent per Resend email id, ignores out-of-order
status events, and answers `500` when the body cannot be fetched so Resend retries. Received mail is stored and shown as **plain text only**.

## Database

Migration `20261031120000_platform_mail` adds `MailMailbox`, `MailTemplate` and `MailMessage` to the platform database
(`npm run platform:deploy`). Branding and routing live in the existing `SiteSetting` row `mail`.
