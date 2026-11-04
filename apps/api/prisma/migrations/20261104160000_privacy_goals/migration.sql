-- AlterTable
ALTER TABLE "ProgressPhoto" DROP COLUMN "storageKey",
ADD COLUMN     "bytes" INTEGER NOT NULL,
ADD COLUMN     "data" BYTEA NOT NULL,
ADD COLUMN     "mime" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "PantryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "norm" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PantryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PantryItem_userId_norm_key" ON "PantryItem"("userId", "norm");

-- CreateIndex
CREATE UNIQUE INDEX "Goal_userId_kind_key" ON "Goal"("userId", "kind");

-- AddForeignKey
ALTER TABLE "PantryItem" ADD CONSTRAINT "PantryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
