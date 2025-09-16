// src/validators/tickets.js
import { z } from "zod";
import { IdSchema } from "./common";

export const IssueTicketsSchema = z.object({
  userId: IdSchema,
  raffleId: IdSchema.optional(),
  purchaseId: IdSchema.optional(),
  quantity: z.coerce.number().int().min(1).max(100),
});

export const VerifyTicketSchema = z.object({
  code: z.string().trim().min(4),
});

export const UseTicketSchema = z.object({
  ticketId: IdSchema.or(z.string().cuid().optional()),
  raffleId: IdSchema,
});

export const TicketQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
