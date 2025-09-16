// src/validators/common.js
import { z } from "zod";

export const SortOrderSchema = z.enum(["asc", "desc"]);
export const PublicSortBySchema = z.enum(["createdAt", "participants", "participations"]);
export const AdminSortBySchema = z.enum(["createdAt", "participants", "participations"]);

export const RaffleStatusSchema = z.enum([
  "DRAFT",
  "PUBLISHED",
  "ACTIVE",
  "READY_TO_DRAW",
  "FINISHED",
  "CANCELLED",
  "COMPLETED",
]);

// Dates: aceptan Date o string datey
export const OptionalDateSchema = z
  .union([z.date(), z.string().datetime().or(z.string().min(1))])
  .optional()
  .transform((v) => (v ? new Date(v) : undefined));

export const IdSchema = z.string().min(8, "id inválido");

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(12),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  order: SortOrderSchema.default("desc"),
});

export const SearchSchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  search: z.string().trim().max(200).optional(),
});

export const BooleanFlagSchema = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "string" ? v === "1" || v.toLowerCase() === "true" : !!v));

/** Helper seguro para parsear y lanzar 400 si falla */
export function safeParseOrThrow(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues?.[0]?.message || "Parámetros inválidos";
    const err = new Error(msg);
    err.status = 400;
    throw err;
  }
  return r.data;
}
