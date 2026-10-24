import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// The console and every API that serves billing data must never be cached or indexed.
const privateHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "private, no-store" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  // Separate build dir lets the E2E server run alongside `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer", "pdfkit", "exceljs", "pg", "@yadea/platform-client"],
  // Workspace provisioning applies the CRM migrations at run time; they are embedded at build (scripts/embed-migrations.mjs).
  experimental: {
    serverActions: {
      // Uploads go through server actions; the per-file limit is enforced in the storage layer.
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    const hsts = process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : [];
    return [
      { source: "/:path*", headers: [...securityHeaders, ...hsts] },
      { source: "/platform/:path*", headers: privateHeaders },
      { source: "/api/platform/:path*", headers: privateHeaders },
      { source: "/api/billing/:path*", headers: privateHeaders },
    ];
  },
};

export default nextConfig;
