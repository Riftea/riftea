/*
  Warnings:

  - You are about to drop the column `meta` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `targetId` on the `audit_logs` table. All the data in the column will be lost.
  - You are about to drop the column `is_finished` on the `raffles` table. All the data in the column will be lost.
  - You are about to drop the column `published` on the `raffles` table. All the data in the column will be lost.
  - Added the required column `title` to the `notifications` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."RaffleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ACTIVE', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('PURCHASE_CONFIRMATION', 'RAFFLE_WINNER', 'RAFFLE_CREATED', 'SYSTEM_ALERT');

-- DropForeignKey
ALTER TABLE "public"."notifications" DROP CONSTRAINT "notifications_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."participations" DROP CONSTRAINT "participations_raffle_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tickets" DROP CONSTRAINT "tickets_raffle_id_fkey";

-- AlterTable
ALTER TABLE "public"."audit_logs" DROP COLUMN "meta",
DROP COLUMN "targetId",
ADD COLUMN     "ip_address" TEXT,
ADD COLUMN     "new_values" JSONB,
ADD COLUMN     "old_values" JSONB,
ADD COLUMN     "target_id" TEXT,
ADD COLUMN     "target_type" TEXT,
ADD COLUMN     "user_agent" TEXT;

-- AlterTable
ALTER TABLE "public"."notifications" ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "raffle_id" TEXT,
ADD COLUMN     "read_at" TIMESTAMP(3),
ADD COLUMN     "ticket_id" TEXT,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "type" "public"."NotificationType" NOT NULL DEFAULT 'SYSTEM_ALERT';

-- AlterTable
ALTER TABLE "public"."participations" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."purchases" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'ARS',
ADD COLUMN     "payment_id" TEXT,
ADD COLUMN     "payment_method" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."raffles" DROP COLUMN "is_finished",
DROP COLUMN "published",
ADD COLUMN     "drawn_at" TIMESTAMP(3),
ADD COLUMN     "image_url" TEXT,
ADD COLUMN     "max_tickets" INTEGER,
ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "starts_at" TIMESTAMP(3),
ADD COLUMN     "status" "public"."RaffleStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "winner_id" TEXT,
ADD COLUMN     "winning_ticket" TEXT;

-- AlterTable
ALTER TABLE "public"."tickets" ADD COLUMN     "is_winner" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "public"."audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "public"."audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "public"."audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_idx" ON "public"."notifications"("user_id", "read");

-- CreateIndex
CREATE INDEX "participations_raffle_id_idx" ON "public"."participations"("raffle_id");

-- CreateIndex
CREATE INDEX "tickets_raffle_id_idx" ON "public"."tickets"("raffle_id");

-- CreateIndex
CREATE INDEX "tickets_user_id_idx" ON "public"."tickets"("user_id");

-- AddForeignKey
ALTER TABLE "public"."raffles" ADD CONSTRAINT "raffles_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tickets" ADD CONSTRAINT "tickets_raffle_id_fkey" FOREIGN KEY ("raffle_id") REFERENCES "public"."raffles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."participations" ADD CONSTRAINT "participations_raffle_id_fkey" FOREIGN KEY ("raffle_id") REFERENCES "public"."raffles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
