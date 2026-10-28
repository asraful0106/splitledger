import { z } from "zod";

export const GRANULARITIES = ["day", "week", "month"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

const rangeFields = {
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  accountId: z.string().uuid().optional(),
};

function rangeIsOrdered(value: { from: string; to: string }): boolean {
  return new Date(value.from).getTime() < new Date(value.to).getTime();
}

export const insightsQuerySchema = z
  .object({
    ...rangeFields,
    granularity: z.enum(GRANULARITIES).default("month"),
  })
  .refine(rangeIsOrdered, { message: "The range must end after it starts", path: ["to"] });

export const exportQuerySchema = z
  .object({
    ...rangeFields,
    type: z.enum(["deposit", "withdrawal"]).optional(),
  })
  .refine(rangeIsOrdered, { message: "The range must end after it starts", path: ["to"] });

export type InsightsQueryInput = z.infer<typeof insightsQuerySchema>;
export type ExportQueryInput = z.infer<typeof exportQuerySchema>;
