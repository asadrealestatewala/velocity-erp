export const SUB_TONE = { TRIALING: "blue", ACTIVE: "green", PAST_DUE: "amber", CANCELED: "gray", EXPIRED: "red", PENDING: "amber", SUSPENDED: "red" } as const;
export const INBOX_TONE = { NEW: "blue", OPEN: "amber", RESOLVED: "green", SPAM: "gray" } as const;
export const DELIVERY_TONE = { QUEUED: "gray", SENT: "blue", DELIVERED: "green", DELAYED: "amber", BOUNCED: "red", COMPLAINED: "red", FAILED: "red", NOT_SENT: "gray" } as const;
export const STATUS_TONE = { OPEN: "blue", WAITING_CUSTOMER: "amber", RESOLVED: "green", CLOSED: "gray" } as const;
export const STATUS_LABEL = { OPEN: "Open", WAITING_CUSTOMER: "Waiting on customer", RESOLVED: "Resolved", CLOSED: "Closed" } as const;
export const PRIORITY_TONE = { LOW: "gray", NORMAL: "blue", HIGH: "amber", URGENT: "red" } as const;
export const SLA_TONE = { met: "green", ok: "gray", due_soon: "amber", overdue: "red", paused: "gray" } as const;
export const SLA_LABEL = { met: "replied", ok: "on track", due_soon: "due soon", overdue: "overdue", paused: "n/a" } as const;
