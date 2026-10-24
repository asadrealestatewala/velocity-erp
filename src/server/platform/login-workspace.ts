import "server-only";
import { rememberedWorkspace } from "./runtime";
import { DEFAULT_SLUG } from "./tenants";

/** Pre-fills the sign-in form's workspace field with the company this browser last used (never the default). */
export async function loginWorkspace(): Promise<string> {
  const slug = await rememberedWorkspace();
  return slug && slug !== DEFAULT_SLUG ? slug : "";
}
