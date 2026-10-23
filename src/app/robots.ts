import type { MetadataRoute } from "next";

/** Internal areas are never crawled; published public forms and the privacy page may be. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: ["/forms/", "/privacy"], disallow: ["/crm", "/portal", "/procurement", "/api/", "/login"] }] };
}
