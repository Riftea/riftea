-- AlterTable
ALTER TABLE "public"."raffles" ADD COLUMN     "min_tickets_is_mandatory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "min_tickets_per_participant" INTEGER;
