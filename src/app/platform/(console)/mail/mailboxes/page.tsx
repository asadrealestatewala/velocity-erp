import { Badge, Card, CardHeader } from "@/components/ui/misc";
import { ActionForm } from "@/components/platform/console";
import { saveMailboxAction, saveRoutingAction, saveWebhookSecretAction } from "@/server/actions/platform-mail";
import { requireAdminPage } from "@/server/platform/admin-auth";
import { loadMailConfig, mailDomain } from "@/server/platform/mail-config";
import { webhookEndpoint, webhookSecret } from "@/server/platform/mail-inbox";
import { mailConfigured } from "@/server/platform/mail";
import { MAIL_CATEGORIES } from "@/server/platform/mail-templates";

export const metadata = { title: "Mailboxes · Mail" };

export default async function MailboxesPage() {
  await requireAdminPage("mail.settings");
  const cfg = await loadMailConfig();
  const secretSet = Boolean(await webhookSecret());
  const options = cfg.mailboxes.filter((m) => m.isActive).map((m) => ({ value: m.key, label: `${m.address} (${m.displayName})` }));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        {cfg.mailboxes.map((m) => (
          <Card key={m.key}>
            <CardHeader title={m.address} description={m.key === "no-reply" ? "Automatic emails. Replies go to the reply-to address." : m.receives ? "Sends and receives. Received mail appears in the inbox." : "Sends only."} action={<Badge tone={m.isActive ? "green" : "gray"}>{m.isActive ? "active" : "off"}</Badge>} />
            <div className="p-5">
              <ActionForm
                action={saveMailboxAction.bind(null, m.key)}
                fields={[
                  { name: "address", label: "Address", defaultValue: m.address },
                  { name: "displayName", label: "Sender name", defaultValue: m.displayName },
                  { name: "replyTo", label: "Reply-to (optional)", optional: true, defaultValue: m.replyTo ?? "" },
                  { name: "signature", label: "Signature for replies", type: "textarea", optional: true, defaultValue: m.signature },
                  ...(m.key === "no-reply" ? [] : [{ name: "receives", label: "Show received mail in the inbox", type: "checkbox" as const, defaultValue: m.receives }, { name: "isActive", label: "Use this mailbox", type: "checkbox" as const, defaultValue: m.isActive }]),
                ]}
              />
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Which mailbox sends what" description="Each kind of email is sent from one mailbox. Staff replies always go out from the mailbox the message arrived at." />
        <div className="p-5">
          <ActionForm
            action={saveRoutingAction}
            fields={MAIL_CATEGORIES.map((c) => ({ name: c.key, label: c.label, hint: c.description, type: "select" as const, options, defaultValue: cfg.routing[c.key] }))}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Receiving mail (inbound setup)" description="Do this once so support@ and billing@ deliver into the inbox, and so the sent log learns whether mail was delivered or bounced." />
        <div className="space-y-4 p-5 text-sm text-ink-700">
          <ul className="space-y-1">
            <li>Sending: <strong>{mailConfigured() ? "RESEND_API_KEY is set" : "not configured — set RESEND_API_KEY on the server"}</strong> (domain <code>{mailDomain()}</code>)</li>
            <li>Webhook signing secret: <strong>{secretSet ? "saved" : "not set — incoming mail is rejected until it is"}</strong></li>
          </ul>
          <ol className="list-decimal space-y-2 pl-5">
            <li>In Resend → <strong>Domains → {mailDomain()}</strong>, turn on <strong>Receiving</strong> and add the <strong>MX record</strong> it shows at your DNS host (usually for the root <code>{mailDomain()}</code>, priority 10). Wait until Resend marks it verified.
              <span className="block text-amber-800">Warning: an MX record at the root sends <em>all</em> mail for {mailDomain()} to Resend. If you already read email on this domain (Google Workspace, Zoho …), do not add it — use a subdomain such as <code>support@mail.{mailDomain()}</code> instead and set the mailbox address above.</span>
            </li>
            <li>In Resend → <strong>Webhooks → Add endpoint</strong>, use this URL and tick the events <code>email.received</code>, <code>email.sent</code>, <code>email.delivered</code>, <code>email.delivery_delayed</code>, <code>email.bounced</code>, <code>email.complained</code>, <code>email.failed</code>:
              <code className="mt-1 block break-all rounded bg-ink-50 px-2 py-1 font-mono text-xs">{webhookEndpoint()}</code>
            </li>
            <li>Copy the endpoint&apos;s <strong>Signing secret</strong> (<code>whsec_…</code>) and save it below (or set <code>RESEND_WEBHOOK_SECRET</code> on the server). It is stored encrypted and never shown again.</li>
            <li>Send a test email to the address from outside. It should show in the Inbox within a minute. Reading the message body also needs <code>RESEND_API_KEY</code> on the server.</li>
          </ol>
          <ActionForm submitLabel="Save signing secret" reset action={saveWebhookSecretAction} fields={[{ name: "secret", label: "Webhook signing secret", type: "password" }]} />
        </div>
      </Card>
    </div>
  );
}
