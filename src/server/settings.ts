import "server-only";
import { db } from "@/lib/db";

export type SystemSettings = {
  companyName: string;
  privacyPolicyUrl: string;
  consentText: string;
  defaultCountryCode: string;
  duplicateMatching: { byPhone: boolean; byEmail: boolean };
  gamification: {
    enabled: boolean;
    points: Record<string, number>;
    responseWindowHours: number;
  };
  notifications: { emailEnabled: boolean; upcomingTestDriveHours: number };
  testDrive: { minLeadHours: number; maxDaysAhead: number };
  applicationOptions: { salutations: string[]; propertyOwnership: string[]; businessStructure: string[] };
};

export const DEFAULT_SETTINGS: SystemSettings = {
  companyName: "YADEA",
  privacyPolicyUrl: "/privacy",
  consentText:
    "I have read the Privacy Policy and accept the processing of my personal data for the purposes indicated.",
  defaultCountryCode: "92",
  duplicateMatching: { byPhone: true, byEmail: true },
  gamification: {
    enabled: true,
    points: {
      FIRST_CONTACT: 10,
      FAST_RESPONSE_BONUS: 10,
      FOLLOW_UP_COMPLETED: 5,
      STAGE_ADVANCED: 3,
      TEST_DRIVE_COMPLETED: 15,
      LEAD_CONVERTED: 50,
      TASK_ON_TIME: 5,
    },
    responseWindowHours: 2,
  },
  notifications: { emailEnabled: true, upcomingTestDriveHours: 24 },
  testDrive: { minLeadHours: 2, maxDaysAhead: 60 },
  applicationOptions: {
    salutations: ["Mr.", "Mrs.", "Ms.", "Dr.", "Other"],
    propertyOwnership: ["Owned", "Rented / Leased", "To be acquired"],
    businessStructure: ["Sole Proprietorship", "Partnership", "Private Limited Company", "Other"],
  },
};

const KEY = "system";

export async function getSettings(): Promise<SystemSettings> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  const stored = (row?.value ?? {}) as Partial<SystemSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    duplicateMatching: { ...DEFAULT_SETTINGS.duplicateMatching, ...stored.duplicateMatching },
    gamification: {
      ...DEFAULT_SETTINGS.gamification,
      ...stored.gamification,
      points: { ...DEFAULT_SETTINGS.gamification.points, ...stored.gamification?.points },
    },
    notifications: { ...DEFAULT_SETTINGS.notifications, ...stored.notifications },
    testDrive: { ...DEFAULT_SETTINGS.testDrive, ...stored.testDrive },
    applicationOptions: { ...DEFAULT_SETTINGS.applicationOptions, ...stored.applicationOptions },
  };
}

export async function saveSettings(patch: Partial<SystemSettings>) {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: next }, update: { value: next } });
  return next;
}
