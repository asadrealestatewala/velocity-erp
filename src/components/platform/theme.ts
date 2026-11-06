"use client";
export type Theme = "light" | "dark";
const KEY = "pf-theme";

/** Runs before first paint (inlined by the layout) so there is no light flash for dark-mode users. */
export const THEME_BOOT = `try{var t=localStorage.getItem("${KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var h=document.documentElement;h.setAttribute("data-pf","");h.setAttribute("data-pf-theme",t)}catch(e){}`;

/** Re-asserts the console attributes. The inline boot script only runs on a full page load, so a client-side navigation into the console
 *  (or the cleanup below firing during a remount) would otherwise leave the tokens undefined and the page unstyled. */
export function ensureConsoleTheme(): Theme {
  const h = document.documentElement;
  let t: Theme | null = null;
  try { const v = localStorage.getItem(KEY); if (v === "light" || v === "dark") t = v; } catch { /* ignore */ }
  const attr = h.getAttribute("data-pf-theme");
  if (!t) t = attr === "dark" || attr === "light" ? attr : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  h.setAttribute("data-pf", "");
  h.setAttribute("data-pf-theme", t);
  return t;
}
export function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-pf-theme") === "dark" ? "dark" : "light";
}
export function setTheme(t: Theme) {
  document.documentElement.setAttribute("data-pf-theme", t);
  try { localStorage.setItem(KEY, t); } catch { /* storage can be blocked; the choice then lasts for this visit only */ }
}
