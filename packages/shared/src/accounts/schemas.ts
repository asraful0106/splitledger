import { z } from "zod";
import { CURRENCY_CODES, DEFAULT_CURRENCY } from "../money/currencies";

export const PARTS_TOTAL_BP = 10000;

export const partInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required").max(40, "Keep it under 40 characters"),
  percentageBp: z.number().int().min(0).max(PARTS_TOTAL_BP),
  sortOrder: z.number().int().min(0).optional(),
  lowBalanceThresholdMinor: z
    .string()
    .trim()
    .regex(/^\d+$/, "Enter an amount")
    .refine((value) => /^\d+$/.test(value) && BigInt(value) > 0n, "Amount must be more than zero")
    .nullable()
    .optional(),
});

export const partsSchema = z
  .array(partInputSchema)
  .min(1, "Add at least one part")
  .max(20, "Too many parts");

export const createAccountSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  bankName: z.string().min(1, "Bank name is required").max(80),
  last4: z
    .string()
    .regex(/^\d{4}$/, "Use the last 4 digits")
    .optional(),
  currency: z.enum(CURRENCY_CODES).default(DEFAULT_CURRENCY),
  parts: partsSchema.optional(),
});

export const updateAccountSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(80).optional(),
    bankName: z.string().min(1, "Bank name is required").max(80).optional(),
    last4: z
      .string()
      .regex(/^\d{4}$/, "Use the last 4 digits")
      .nullable()
      .optional(),
    currency: z.enum(CURRENCY_CODES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

export const replacePartsSchema = z.object({
  parts: partsSchema,
});

export function sumPercentageBp(parts: readonly { percentageBp: number }[]): number {
  return parts.reduce((total, part) => total + part.percentageBp, 0);
}

export type AccountPartInput = z.infer<typeof partInputSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type ReplacePartsInput = z.infer<typeof replacePartsSchema>;
