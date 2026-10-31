"use client";
export type Theme = "light" | "dark";
const KEY = "pf-theme";

/** Runs before first paint (inlined by the layout) so there is no light flash for dark-mode users. */
export const THEME_BOOT = `try{var t=localStorage.getItem("${KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var h=document.documentElement;h.setAttribute("data-pf","");h.setAttribute("data-pf-theme",t)}catch(e){}`;

export function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-pf-theme") === "dark" ? "dark" : "light";
}
export function setTheme(t: Theme) {
  document.documentElement.setAttribute("data-pf-theme", t);
  try { localStorage.setItem(KEY, t); } catch { /* storage can be blocked; the choice then lasts for this visit only */ }
}
