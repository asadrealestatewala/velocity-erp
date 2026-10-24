import "server-only";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { promises as fs } from "node:fs";
import { db, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/server/errors";
import { currentTenant } from "@/server/platform/runtime";

export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalDriver implements StorageDriver {
  private root = path.resolve(process.env.LOCAL_STORAGE_DIR ?? "./storage");
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.resolve(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, data);
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

class S3Driver implements StorageDriver {
  private clientPromise = (async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  })();
  private bucket = process.env.S3_BUCKET ?? "";
  async put(key: string, data: Buffer, contentType: string) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.clientPromise).send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }),
    );
  }
  async get(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await (await this.clientPromise).send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }
  async delete(key: string) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.clientPromise).send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (!driver) driver = process.env.STORAGE_DRIVER === "s3" ? new S3Driver() : new LocalDriver();
  return driver;
}

// ───────── Validation ─────────

export type FileKind = "image" | "document";

const SIGNATURES: { mime: string; ext: string[]; kind: FileKind; test: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", ext: ["jpg", "jpeg"], kind: "image", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: ["png"], kind: "image", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", ext: ["webp"], kind: "image", test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
  { mime: "application/pdf", ext: ["pdf"], kind: "document", test: (b) => b.subarray(0, 5).toString() === "%PDF-" },
  // DOCX / XLSX are ZIP containers
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ["docx"], kind: "document", test: (b) => b[0] === 0x50 && b[1] === 0x4b },
  { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ["xlsx"], kind: "document", test: (b) => b[0] === 0x50 && b[1] === 0x4b },
];

/**
 * Validates by extension AND content signature (never trusts the browser-provided MIME type).
 * Documents accept images too (scans / photos of documents).
 */
export function detectFile(name: string, data: Buffer, allowed: FileKind) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const sig = SIGNATURES.find((s) => s.ext.includes(ext));
  if (!sig) throw new AppError(`File type .${ext || "?"} is not allowed.`);
  if (allowed === "image" && sig.kind !== "image") throw new AppError("Only JPG, PNG or WEBP images are allowed.");
  if (!sig.test(data)) throw new AppError("The file content does not match its extension.");
  return sig.mime;
}

export function safeFileName(name: string) {
  const base = path.basename(name).replace(/[^\w.\- ()]/g, "_").slice(-120);
  return base || "file";
}

/** Validates and stores an uploaded File, creating its StoredFile row. */
export async function saveUpload(
  file: File,
  opts: { kind: FileKind; uploadedById?: string | null; isPublic?: boolean; folder: string },
  tx: Tx = db,
) {
  return tx.storedFile.create({ data: await putUpload(file, opts) });
}

/**
 * Validates and writes the bytes to storage, returning the StoredFile create payload.
 * Lets callers write the DB row inside their own transaction (storage itself is not transactional).
 */
export async function putUpload(
  file: File,
  opts: { kind: FileKind; uploadedById?: string | null; isPublic?: boolean; folder: string },
) {
  if (!file || file.size === 0) throw new AppError("The file is empty.");
  if (file.size > env.maxUploadBytes) {
    throw new AppError(`The file exceeds the ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB limit.`);
  }
  const data = Buffer.from(await file.arrayBuffer());
  const originalName = safeFileName(file.name);
  const mimeType = detectFile(originalName, data, opts.kind);
  const ext = originalName.split(".").pop()!.toLowerCase();
  const ws = await currentTenant();
  const prefix = ws.isLegacy ? "" : `tenants/${ws.slug}/`; // the original install keeps its existing keys
  const storageKey = `${prefix}${opts.folder}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  await storage().put(storageKey, data, mimeType);
  return {
    storageKey,
    originalName,
    mimeType,
    size: data.length,
    checksum: createHash("sha256").update(data).digest("hex"),
    uploadedById: opts.uploadedById ?? null,
    isPublic: opts.isPublic ?? false,
  };
}
