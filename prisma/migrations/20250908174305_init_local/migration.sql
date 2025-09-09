/*
  Warnings:

  - You are about to drop the column `display_code` on the `tickets` table. All the data in the column will be lost.
  - Made the column `generated_at` on table `tickets` required. This step will fail if there are existing NULL values in that column.
  - Made the column `hash` on table `tickets` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."tickets" DROP COLUMN "display_code",
ALTER COLUMN "generated_at" SET NOT NULL,
ALTER COLUMN "generated_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "hash" SET NOT NULL;
