import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/server/platform/mail";

/** Public marketing pages and published forms may be crawled; every working area is off limits. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/pricing", "/signup", "/legal/", "/forms/", "/privacy"], disallow: ["/crm", "/portal", "/procurement", "/platform", "/w/", "/api/", "/login", "/invite/", "/reset-password/", "/confirm-email/"] }],
    sitemap: `${appBaseUrl()}/sitemap.xml`,
  };
}
