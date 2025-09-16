-- AlterTable
ALTER TABLE "public"."raffles" ADD COLUMN     "is_locked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "is_verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."favorites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "raffle_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "favorites_user_id_idx" ON "public"."favorites"("user_id");

-- CreateIndex
CREATE INDEX "favorites_raffle_id_idx" ON "public"."favorites"("raffle_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_raffle_id_key" ON "public"."favorites"("user_id", "raffle_id");

-- CreateIndex
CREATE INDEX "raffles_is_locked_idx" ON "public"."raffles"("is_locked");

-- AddForeignKey
ALTER TABLE "public"."favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."favorites" ADD CONSTRAINT "favorites_raffle_id_fkey" FOREIGN KEY ("raffle_id") REFERENCES "public"."raffles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
