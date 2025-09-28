-- AlterTable
ALTER TABLE "public"."products" ADD COLUMN     "seller_id" TEXT;

-- CreateIndex
CREATE INDEX "products_seller_id_idx" ON "public"."products"("seller_id");

-- CreateIndex
CREATE INDEX "products_isActive_created_at_idx" ON "public"."products"("isActive", "created_at");

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
