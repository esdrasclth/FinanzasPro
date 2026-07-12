-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "protegida" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "archivada" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "debts" ADD COLUMN     "category_id" UUID;

-- CreateIndex
CREATE INDEX "debts_category_id_idx" ON "debts"("category_id");

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
