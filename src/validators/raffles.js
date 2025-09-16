// src/validators/raffles.js
import { z } from "zod";
import {
  AdminSortBySchema,
  BooleanFlagSchema,
  IdSchema,
  OptionalDateSchema,
  PaginationSchema,
  PublicSortBySchema,
  RaffleStatusSchema,
  SearchSchema,
} from "./common";

// ===== Crear rifa =====
export const CreateRaffleSchema = z.object({
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().min(1).max(5000),
  prizeValue: z
    .union([z.number().int().positive(), z.string().regex(/^\d+$/)])
    .transform((v) => Number(v)),
  participantGoal: z
    .union([z.number().int().positive(), z.string().regex(/^\d+$/)])
    .transform((v) => (v === undefined ? undefined : Number(v)))
    .optional(),
  startsAt: OptionalDateSchema,
  endsAt: OptionalDateSchema,
  imageUrl: z.string().url().or(z.string().trim().min(1)).optional(),
  isPrivate: z.boolean().optional(),
});

// ===== Actualizar rifa / acciones =====
export const UpdateRaffleSchema = z.object({
  id: IdSchema,
  action: z.enum(["publish", "activate", "finish", "cancel"]).optional(),
  title: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().min(1).max(5000).optional(),
  prizeValue: z
    .union([z.number().int().positive(), z.string().regex(/^\d+$/)])
    .transform((v) => (v === undefined ? undefined : Number(v)))
    .optional(),
  maxParticipants: z
    .union([z.number().int().positive(), z.string().regex(/^\d+$/)])
    .transform((v) => (v === undefined || v === null ? undefined : Number(v)))
    .optional(),
  imageUrl: z.string().url().or(z.string().trim().min(1)).nullable().optional(),
  isPrivate: z.boolean().optional(),
  startsAt: OptionalDateSchema,
  endsAt: OptionalDateSchema,
});

// ===== Listado público (/api/raffles/public) =====
export const PublicListQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional().default(""),
    sortBy: PublicSortBySchema.default("createdAt"),
    order: z.enum(["asc", "desc"]).default("desc"),
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(50).default(12),
  })
  .merge(SearchSchema.partial());

// ===== Listado admin/mixto (/api/raffles GET) =====
export const AdminListQuerySchema = z.object({
  page: PaginationSchema.shape.page,
  limit: PaginationSchema.shape.limit,
  sortBy: AdminSortBySchema.default("createdAt"),
  order: PaginationSchema.shape.order,
  status: RaffleStatusSchema.optional(),
  ownerId: IdSchema.optional(),
  mine: BooleanFlagSchema.optional(),
  asUser: z.string().trim().optional(),
  includePrivate: BooleanFlagSchema.optional(),
  search: SearchSchema.shape.search.optional(),
  q: SearchSchema.shape.q.optional(),
});

// ===== Draw (/api/raffles/[id]/draw) =====
export const DrawScheduleSchema = z.object({
  action: z.literal("schedule"),
  minutesFromNow: z.coerce.number().int().min(1).max(24 * 60).optional().default(3),
});

export const DrawRunSchema = z.object({
  action: z.literal("run"),
});

export const DrawBodySchema = z.union([DrawScheduleSchema, DrawRunSchema]);

// ===== Progress (/api/raffles/[id]/progress) =====
export const ProgressPathSchema = z.object({
  id: IdSchema,
});
