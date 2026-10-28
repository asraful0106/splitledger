import { z } from "zod";

export const moneyStringSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Enter an amount")
  .refine((value) => /^\d+$/.test(value) && BigInt(value) > 0n, "Amount must be more than zero");

export const depositSchema = z
  .object({
    amountMinor: moneyStringSchema,
    mode: z.enum(["split", "single_part"]).default("split"),
    partId: z.string().uuid().optional(),
    acknowledgedWarning: z.boolean().optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    note: z.string().max(200).optional(),
    category: z.string().max(50).optional(),
  })
  .refine((value) => value.mode === "split" || value.partId !== undefined, {
    message: "Choose a part",
    path: ["partId"],
  });

export const withdrawalEntrySchema = z.object({
  partId: z.string().uuid(),
  amountMinor: moneyStringSchema,
});

export const withdrawalSchema = z
  .object({
    entries: z.array(withdrawalEntrySchema).min(1, "Add at least one part").max(20),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    note: z.string().max(200).optional(),
    category: z.string().max(50).optional(),
  })
  .refine((value) => new Set(value.entries.map((entry) => entry.partId)).size === value.entries.length, {
    message: "Each part can appear only once",
    path: ["entries"],
  });

export const historyQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(["deposit", "withdrawal"]).optional(),
  partId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export type DepositInput = z.infer<typeof depositSchema>;
export type WithdrawalInput = z.infer<typeof withdrawalSchema>;
export type WithdrawalEntryInput = z.infer<typeof withdrawalEntrySchema>;
export type HistoryQueryInput = z.infer<typeof historyQuerySchema>;
