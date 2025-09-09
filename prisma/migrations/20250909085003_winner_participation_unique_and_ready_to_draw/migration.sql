/*
  Warnings:

  - A unique constraint covering the columns `[winner_participation_id]` on the table `raffles` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "public"."RaffleStatus" ADD VALUE 'READY_TO_DRAW';

-- AlterTable
ALTER TABLE "public"."participations" ADD COLUMN     "draw_order" INTEGER;

-- AlterTable
ALTER TABLE "public"."raffles" ADD COLUMN     "draw_at" TIMESTAMP(3),
ADD COLUMN     "draw_seed_hash" TEXT,
ADD COLUMN     "draw_seed_reveal" TEXT,
ADD COLUMN     "winner_participation_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "raffles_winner_participation_id_key" ON "public"."raffles"("winner_participation_id");

-- CreateIndex
CREATE INDEX "raffles_winner_participation_id_idx" ON "public"."raffles"("winner_participation_id");

-- AddForeignKey
ALTER TABLE "public"."raffles" ADD CONSTRAINT "raffles_winner_participation_id_fkey" FOREIGN KEY ("winner_participation_id") REFERENCES "public"."participations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
