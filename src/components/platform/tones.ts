export const SUB_TONE = { TRIALING: "blue", ACTIVE: "green", PAST_DUE: "amber", CANCELED: "gray", EXPIRED: "red", PENDING: "amber", SUSPENDED: "red" } as const;
export const INBOX_TONE = { NEW: "blue", OPEN: "amber", RESOLVED: "green", SPAM: "gray" } as const;
export const DELIVERY_TONE = { QUEUED: "gray", SENT: "blue", DELIVERED: "green", DELAYED: "amber", BOUNCED: "red", COMPLAINED: "red", FAILED: "red", NOT_SENT: "gray" } as const;
