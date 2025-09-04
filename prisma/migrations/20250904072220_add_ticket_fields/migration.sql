/*
  Warnings:

  - You are about to alter the column `amount` on the `purchases` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to alter the column `ticket_price` on the `raffles` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - A unique constraint covering the columns `[uuid]` on the table `tickets` will be added. If there are existing duplicate values, this will fail.
  - The required column `uuid` was added to the `tickets` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- CreateEnum
CREATE TYPE "public"."TicketStatus" AS ENUM ('PENDING', 'ACTIVE', 'AVAILABLE', 'IN_RAFFLE', 'WINNER', 'LOST', 'DELETED');

-- AlterEnum
ALTER TYPE "public"."NotificationType" ADD VALUE 'WINNER_NOTIFICATION';

-- AlterEnum
ALTER TYPE "public"."RaffleStatus" ADD VALUE 'COMPLETED';

-- DropForeignKey
ALTER TABLE "public"."raffles" DROP CONSTRAINT "raffles_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tickets" DROP CONSTRAINT "tickets_purchase_id_fkey";

-- AlterTable
ALTER TABLE "public"."participations" ADD COLUMN     "is_winner" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."purchases" ALTER COLUMN "amount" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "public"."raffles" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "max_participants" INTEGER,
ADD COLUMN     "owner_image" TEXT,
ADD COLUMN     "prize_category" TEXT,
ADD COLUMN     "prize_description" TEXT,
ADD COLUMN     "prize_image" TEXT,
ADD COLUMN     "prize_title" TEXT,
ADD COLUMN     "prize_value" INTEGER,
ALTER COLUMN "ticket_price" SET DATA TYPE INTEGER,
ALTER COLUMN "ends_at" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."tickets" ADD COLUMN     "display_code" TEXT,
ADD COLUMN     "generated_at" TIMESTAMP(3),
ADD COLUMN     "hash" TEXT,
ADD COLUMN     "metodo_pago" TEXT,
ADD COLUMN     "status" "public"."TicketStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "uuid" TEXT NOT NULL,
ALTER COLUMN "raffle_id" DROP NOT NULL,
ALTER COLUMN "purchase_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "public"."Setting" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "public"."Setting"("key");

-- CreateIndex
CREATE INDEX "raffles_owner_id_idx" ON "public"."raffles"("owner_id");

-- CreateIndex
CREATE INDEX "raffles_winner_id_idx" ON "public"."raffles"("winner_id");

-- CreateIndex
CREATE INDEX "raffles_status_idx" ON "public"."raffles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_uuid_key" ON "public"."tickets"("uuid");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "public"."tickets"("status");

-- CreateIndex
CREATE INDEX "tickets_uuid_idx" ON "public"."tickets"("uuid");

-- AddForeignKey
ALTER TABLE "public"."raffles" ADD CONSTRAINT "raffles_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tickets" ADD CONSTRAINT "tickets_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
