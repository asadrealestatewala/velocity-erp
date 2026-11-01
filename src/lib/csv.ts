/** Escapes one CSV value and neutralises spreadsheet formula injection (a leading = + - @ tab or CR is prefixed with an apostrophe). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/** Parses CSV text (RFC 4180 quoting, CRLF/LF, optional BOM) into rows of cells. Blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endRow = () => {
    row.push(cell);
    cell = "";
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && src[i + 1] === "\n") i++; endRow(); }
    else cell += ch;
  }
  if (cell !== "" || row.length) endRow();
  return rows;
}

/** Turns parsed rows into header-keyed records (headers lower-cased, spaces/underscores removed). */
export function csvRecords(rows: string[][]): { line: number; values: Record<string, string> }[] {
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase().replace(/[\s_-]+/g, ""));
  return body.map((r, i) => ({ line: i + 2, values: Object.fromEntries(keys.map((k, j) => [k, (r[j] ?? "").trim()])) }));
}
