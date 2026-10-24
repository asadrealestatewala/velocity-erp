import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/server/platform/mail";

/** Only the public marketing pages. Workspaces, forms and the platform console are never listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = appBaseUrl();
  return ["/", "/pricing", "/signup", "/legal/terms", "/legal/privacy"].map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly", priority: p === "/" ? 1 : 0.6 }));
}
