import { db } from "@/lib/db";
import type { SiteEntry } from "@/server/website";

export type CoverModel = { id: string; name: string; imageFileId: string | null };

/** Active models that have a real photo; their photos stand in as cover images for posts without one. */
export async function coverModels(): Promise<CoverModel[]> {
  return db.bikeModel.findMany({
    where: { isActive: true, availability: { not: "DISCONTINUED" }, imageFileId: { not: null } },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true, imageFileId: true },
  });
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const keyOf = (name: string) => squash(name.replace(/yadea/i, "").replace(/-\s*\d{3,4}\b.*$/, ""));

/**
 * Cover for a post: its own cover when set, otherwise the photo of the model the post is about (matched on the model
 * name in the title or slug), otherwise a model photo picked by the slug so the same post always shows the same bike.
 */
export function postCover(e: Pick<SiteEntry, "slug" | "title" | "cover">, models: CoverModel[]): { src: string; own: boolean } | null {
  if (e.cover && /^(https:\/\/|\/)[^\s"'()]+$/.test(e.cover)) return { src: e.cover, own: true };
  const withPhoto = models.filter((m) => m.imageFileId);
  if (withPhoto.length === 0) return null;
  const hay = squash(`${e.title} ${e.slug}`);
  const hit = withPhoto.find((m) => { const k = keyOf(m.name); return k.length >= 3 && hay.includes(k); });
  const pick = hit ?? withPhoto[[...e.slug].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % withPhoto.length];
  return { src: `/api/files/${pick.imageFileId}`, own: false };
}
