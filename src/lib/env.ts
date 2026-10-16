import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  get appUrl() {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
  get appSecret() {
    const s = required("APP_SECRET");
    if (process.env.NODE_ENV === "production" && s.length < 32) {
      throw new Error("APP_SECRET must be at least 32 characters in production");
    }
    return s;
  },
  get sessionTtlDays() {
    return Number(process.env.SESSION_TTL_DAYS ?? 7);
  },
  get cronSecret() {
    return process.env.CRON_SECRET ?? "";
  },
  get maxUploadBytes() {
    return Number(process.env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024;
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
};
