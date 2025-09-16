// src/validators/purchases.js
import { z } from "zod";
import { IdSchema } from "./common";

export const CreatePurchaseSchema = z.object({
  userId: IdSchema,
  amount: z.coerce.number().int().min(1),
  currency: z.string().trim().min(2).max(6).default("ARS"),
  paymentMethod: z.string().trim().optional(),
  providerRef: z.string().trim().optional(),
});

export const PurchaseQuerySchema = z.object({
  userId: IdSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
