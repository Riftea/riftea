/*
  Warnings:

  - You are about to drop the column `max_tickets` on the `raffles` table. All the data in the column will be lost.
  - You are about to drop the column `ticket_price` on the `raffles` table. All the data in the column will be lost.
  - Made the column `max_participants` on table `raffles` required. This step will fail if there are existing NULL values in that column.
  - Made the column `prize_value` on table `raffles` required. This step will fail if there are existing NULL values in that column.

*/

-- 🔥 Backfill previo: asegurar que no haya NULLs
UPDATE "public"."raffles"
SET "max_participants" = 100
WHERE "max_participants" IS NULL;

UPDATE "public"."raffles"
SET "prize_value" = 0
WHERE "prize_value" IS NULL;

-- AlterTable
ALTER TABLE "public"."raffles" 
  DROP COLUMN "max_tickets",
  DROP COLUMN "ticket_price",
  ADD COLUMN "is_private" BOOLEAN NOT NULL DEFAULT false,
  ALTER COLUMN "max_participants" SET NOT NULL,
  ALTER COLUMN "prize_value" SET NOT NULL;

-- CreateIndex
CREATE INDEX "raffles_is_private_idx" ON "public"."raffles"("is_private");
