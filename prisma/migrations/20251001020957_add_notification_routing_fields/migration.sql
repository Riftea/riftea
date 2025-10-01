-- AlterTable
ALTER TABLE "public"."notifications" ADD COLUMN     "action_url" TEXT,
ADD COLUMN     "is_actionable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "meta" JSONB,
ADD COLUMN     "subtype" TEXT,
ADD COLUMN     "targets" JSONB;
