-- AlterTable: new User columns (SQLite)
ALTER TABLE "User" ADD COLUMN "facebookId" TEXT;
CREATE UNIQUE INDEX "User_facebookId_key" ON "User"("facebookId");
ALTER TABLE "User" ADD COLUMN "passwordResetToken" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordResetExpires" DATETIME;
