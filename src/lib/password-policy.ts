import { z } from "zod";

/** One password rule for every account in the product (signup, invitations, resets, changes). */
export const passwordSchema = z
  .string()
  .min(10, "At least 10 characters")
  .max(200, "Too long")
  .regex(/[A-Za-z]/, "Include a letter")
  .regex(/\d/, "Include a number");
