// Client-safe activity metadata (the activity *service* is server-only).
export const ACTIVITY_LABELS = {
  LEAD_CREATED: "Lead created",
  FORM_SUBMITTED: "Form submitted",
  LEAD_ASSIGNED: "Lead assigned",
  LEAD_REASSIGNED: "Lead reassigned",
  CALL_LOGGED: "Phone call",
  EMAIL_LOGGED: "Email",
  WHATSAPP_LOGGED: "WhatsApp",
  SMS_LOGGED: "SMS",
  MEETING_LOGGED: "Meeting",
  NOTE_ADDED: "Note added",
  TASK_CREATED: "Task created",
  TASK_COMPLETED: "Task completed",
  TEST_DRIVE_SCHEDULED: "Test drive scheduled",
  TEST_DRIVE_RESCHEDULED: "Test drive rescheduled",
  TEST_DRIVE_COMPLETED: "Test drive completed",
  TEST_DRIVE_UPDATED: "Test drive updated",
  STAGE_CHANGED: "Stage changed",
  DOCUMENT_UPLOADED: "Document uploaded",
  PAYMENT_RECORDED: "Payment recorded",
  LEAD_CONVERTED: "Lead converted",
  LEAD_LOST: "Lead lost",
  CONTACT_UPDATED: "Contact updated",
  SOURCE_CHANGED: "Source changed",
  ORDER_CONFIRMED: "Order confirmed",
  ORDER_CANCELLED: "Order cancelled",
} as const;
export type ActivityTypeKey = keyof typeof ACTIVITY_LABELS;

/** Filter groups for the activity timeline dropdown. */
export const ACTIVITY_GROUPS: { key: string; label: string; types: ActivityTypeKey[] }[] = [
  { key: "interactions", label: "Calls, messages & meetings", types: ["CALL_LOGGED", "EMAIL_LOGGED", "WHATSAPP_LOGGED", "SMS_LOGGED", "MEETING_LOGGED"] },
  { key: "pipeline", label: "Stage & outcome", types: ["STAGE_CHANGED", "LEAD_CONVERTED", "LEAD_LOST"] },
  { key: "assignment", label: "Assignments", types: ["LEAD_ASSIGNED", "LEAD_REASSIGNED", "SOURCE_CHANGED"] },
  { key: "testdrives", label: "Test drives", types: ["TEST_DRIVE_SCHEDULED", "TEST_DRIVE_RESCHEDULED", "TEST_DRIVE_COMPLETED", "TEST_DRIVE_UPDATED"] },
  { key: "work", label: "Notes & tasks", types: ["NOTE_ADDED", "TASK_CREATED", "TASK_COMPLETED"] },
  { key: "records", label: "Documents, payments & orders", types: ["DOCUMENT_UPLOADED", "PAYMENT_RECORDED", "ORDER_CONFIRMED", "ORDER_CANCELLED"] },
  { key: "system", label: "Created, forms & edits", types: ["LEAD_CREATED", "FORM_SUBMITTED", "CONTACT_UPDATED"] },
];
