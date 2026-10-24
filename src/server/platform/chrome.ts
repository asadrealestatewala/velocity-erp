import "server-only";
import { billingState } from "./billing-state";
import { entitlementsCached } from "./plans";
import { currentTenant } from "./runtime";

export type WorkspaceBanner = { tone: "info" | "warn" | "danger"; text: string; href?: string };

/** What every layout needs to know about the workspace around the page: billing banner, name and which add-ons the plan has. */
export async function workspaceChrome(canManageBilling: boolean) {
  const t = await currentTenant();
  const state = billingState(t);
  const ent = t.isLegacy ? null : await entitlementsCached(t);
  const banner: WorkspaceBanner | null = state.banner ? { ...state.banner, href: canManageBilling ? "/crm/billing" : undefined } : null;
  return { banner, workspaceName: t.isLegacy ? null : t.name, assistantAllowed: !ent || ent.assistant, locked: state.locked };
}
