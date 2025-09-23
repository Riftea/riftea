-- CreateEnum
CREATE TYPE "public"."ListingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "public"."raffles" ADD COLUMN     "listing_reason" TEXT,
ADD COLUMN     "listing_reviewed_at" TIMESTAMP(3),
ADD COLUMN     "listing_reviewed_by" TEXT,
ADD COLUMN     "listing_status" "public"."ListingStatus" NOT NULL DEFAULT 'APPROVED';

-- CreateIndex
CREATE INDEX "raffles_listing_status_idx" ON "public"."raffles"("listing_status");
