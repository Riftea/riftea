// src/types/index.d.ts

// ===== Enums =====
export type Role = "USER" | "ADMIN" | "SUPERADMIN";

export type RaffleStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "ACTIVE"
  | "READY_TO_DRAW"
  | "FINISHED"
  | "CANCELLED"
  | "COMPLETED";

export type TicketStatus =
  | "PENDING"
  | "ACTIVE"
  | "AVAILABLE"
  | "IN_RAFFLE"
  | "WINNER"
  | "LOST"
  | "DELETED";

export type NotificationType =
  | "PURCHASE_CONFIRMATION"
  | "RAFFLE_WINNER"
  | "RAFFLE_CREATED"
  | "SYSTEM_ALERT"
  | "WINNER_NOTIFICATION";

// ===== Domain (shape aproximado al select usado por tus endpoints) =====
export interface UserLite {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: Role;
}

export interface RaffleCardOwner {
  name?: string | null;
  image?: string | null;
}

export interface RaffleCard {
  id: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  prizeValue: number;
  maxParticipants: number | null;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  status: RaffleStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
  ownerId: string;
  isPrivate: boolean;
  owner?: RaffleCardOwner | null;
  _count?: { participations: number; tickets: number };
  unitPrice?: number; // agregado por el server en /api/raffles/public
}

export interface RaffleWithStats extends RaffleCard {
  stats: {
    totalTickets: number;
    totalParticipations: number;
    ticketsSold: number;
    maxParticipantsReached: boolean;
    daysLeft: number | null;
    isExpired: boolean;
  };
  unitPrice: number; // siempre presente en /api/raffles GET
}

// ===== /api/raffles/public (GET) =====
export interface PublicRafflesResponse {
  success: boolean;
  page: number;
  perPage: number;
  total: number;
  items: RaffleCard[];
  meta: { ticketPrice: number };
}

// ===== /api/raffles (GET) =====
export interface RafflesListResponse {
  success: boolean;
  raffles: RaffleWithStats[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  meta: { ticketPrice: number };
  filters: {
    status?: RaffleStatus;
    ownerId?: string;
    search?: string;
    mine?: "1";
    asUser?: string;
    includePrivate?: "1" | "0";
  };
  code: "RAFFLES_FETCHED";
}

// ===== /api/raffles/[id]/draw (GET) =====
export interface DrawParticipant {
  id: string;
  ticketCode: string | null;
  user: { id?: string; name?: string | null; image?: string | null } | null;
  isWinner: boolean;
  drawOrder: number | null;
  createdAt: string | Date;
}

export interface DrawStatus {
  id: string;
  status: RaffleStatus;
  maxParticipants: number | null;
  drawAt: string | Date | null;
  drawnAt: string | Date | null;
  drawSeedHash: string | null;    // "sha256:<hex>"
  drawSeedReveal: string | null;  // hex
  winnerParticipationId: string | null;
}

export interface DrawStatusResponse {
  ok: boolean;
  raffle?: DrawStatus;
  participants?: DrawParticipant[];
  error?: string;
}

// ===== /api/raffles/[id]/draw (POST run) =====
export interface DrawRunResponse {
  ok: boolean;
  message?: string;
  raffle?: {
    id: string;
    status: RaffleStatus;
    drawnAt: string | Date | null;
    winnerParticipationId: string | null;
  };
  commitment?: string;   // "sha256:<hash>"
  reveal?: string;       // hex
  order?: string[];      // [winner, 2°, 3°, ...]
  eliminatedDesc?: string[]; // [último eliminado → … → ganador]
  error?: string;
}

// ===== /api/raffles/[id]/progress (GET) =====
export interface TimeRemaining {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  formatted: string; // "2d 3h 10m" | "Finalizado"
}

export interface ProgressStats {
  totalTicketsSold: number;
  totalRevenue: number;
  averageTicketsPerDay: number;
  participationRate: number; // %
  isFull: boolean;
}

export interface ProgressResponse {
  currentFunding: number;
  targetFunding: number | null;
  progressPercentage: number; // 0..100
  status: RaffleStatus | "READY_TO_DRAW"; // derivado
  totalParticipants: number;
  timeRemaining: TimeRemaining | null;

  raffleInfo: {
    id: string;
    title: string;
    ticketPrice: number;
    maxParticipants: number | null;
    startsAt: string | Date | null;
    endsAt: string | Date | null;
    drawAt: string | Date | null;
    status: RaffleStatus;       // DB
    actualStatus: RaffleStatus; // derivado
    isReadyToDraw: boolean;
  };

  stats: ProgressStats;

  lastCalculated: string; // ISO
  hasTimeLimit: boolean;
  hasParticipantLimit: boolean;
  hasTicketLimit: false;
}
