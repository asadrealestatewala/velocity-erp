import "server-only";
import type { CurrentUser } from "@/server/auth/session";
import { can } from "@/server/authz";
import type { AssistantConfig } from "@/components/assistant/assistant-widget";
import { aiConfigured, audienceFor } from "./engine";
import { SUGGESTIONS } from "./guide";
import { toolsFor } from "./tools";

/** What the assistant widget needs to render for this user (null = the user's role has no assistant). */
export function assistantConfigFor(user: CurrentUser): AssistantConfig | null {
  if (!can(user, "assistant.use")) return null;
  return {
    userKey: user.id,
    aiConnected: aiConfigured(),
    canWrite: aiConfigured() && toolsFor(user).some((t) => t.kind === "write"),
    suggestions: SUGGESTIONS[audienceFor(user)],
  };
}
