/** Company branding applied to every outgoing email (edited in the console under Mail → Branding). */
export type MailBrand = {
  companyName: string;
  /** https URL, or a path on this site such as /brand/velocity-logo-white.png. */
  logoUrl: string;
  accentColor: string;
  addressLine: string;
  website: string;
  supportEmail: string;
  supportPhone: string;
  footerNote: string;
};

export const DEFAULT_BRAND: MailBrand = {
  companyName: "Velocity",
  logoUrl: "/brand/velocity-logo-white.png",
  accentColor: "#d6307a",
  addressLine: "",
  website: "",
  supportEmail: "",
  supportPhone: "",
  footerNote: "",
};

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const safeColor = (c: string, fallback = DEFAULT_BRAND.accentColor) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback);

/** Only https (or this site's own path) is allowed in an email: never javascript:/data: URLs. */
export function safeUrl(u: string, base: string): string {
  const t = u.trim();
  if (!t) return "";
  if (t.startsWith("/") && !t.startsWith("//")) return base + t;
  return /^https?:\/\/[^\s"'<>]+$/i.test(t) ? t : "";
}

export type MailContent = { heading: string; paragraphs: string[]; cta?: { label: string; url: string }; footer?: string };

/** One branded, accessible layout for every system email, with a plain-text alternative. */
export function layoutMail(brand: MailBrand, base: string, c: MailContent): { html: string; text: string } {
  const accent = safeColor(brand.accentColor);
  const logo = safeUrl(brand.logoUrl, base);
  const site = safeUrl(brand.website, base);
  const contact = [brand.supportEmail && `<a href="mailto:${esc(brand.supportEmail)}" style="color:#6f645c">${esc(brand.supportEmail)}</a>`, brand.supportPhone && esc(brand.supportPhone)].filter(Boolean).join(" · ");
  const header = logo ? `<img src="${esc(logo)}" alt="${esc(brand.companyName)}" height="34" style="display:block;height:34px;width:auto;border:0" />` : esc(brand.companyName);
  const ctaUrl = c.cta ? safeUrl(c.cta.url, base) : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4f1;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1a1411">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e8e1da">
<tr><td style="padding:18px 28px;background:#150f0d;color:#fff;font-weight:700;font-size:18px">${header}</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:20px">${esc(c.heading)}</h1>
${c.paragraphs.map((p) => `<p style="margin:0 0 12px;line-height:1.55;font-size:15px;white-space:pre-line">${esc(p)}</p>`).join("")}
${c.cta && ctaUrl ? `<p style="margin:22px 0"><a href="${esc(ctaUrl)}" style="background:${accent};color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;display:inline-block">${esc(c.cta.label)}</a></p><p style="margin:0 0 8px;font-size:12px;color:#6f645c">If the button does not work, paste this link into your browser:<br>${esc(ctaUrl)}</p>` : ""}
${c.footer ? `<p style="margin:18px 0 0;font-size:12px;color:#6f645c">${esc(c.footer)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;background:#faf8f6;border-top:1px solid #e8e1da;font-size:12px;line-height:1.5;color:#6f645c">
<strong>${esc(brand.companyName)}</strong>${brand.addressLine ? `<br>${esc(brand.addressLine)}` : ""}${site ? `<br><a href="${esc(site)}" style="color:#6f645c">${esc(site.replace(/^https?:\/\//, ""))}</a>` : ""}${contact ? `<br>Need help? ${contact}` : ""}${brand.footerNote ? `<br>${esc(brand.footerNote)}` : ""}
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    c.heading, "", ...c.paragraphs, ...(c.cta && ctaUrl ? ["", `${c.cta.label}: ${ctaUrl}`] : []), ...(c.footer ? ["", c.footer] : []),
    "", "—", brand.companyName, ...(brand.addressLine ? [brand.addressLine] : []), ...(site ? [site] : []),
    ...(brand.supportEmail || brand.supportPhone ? [`Need help? ${[brand.supportEmail, brand.supportPhone].filter(Boolean).join(" · ")}`] : []), ...(brand.footerNote ? [brand.footerNote] : []),
  ].join("\n");
  return { html, text };
}
