-- AlterTable: agency profile fields on User (SQLite)
ALTER TABLE "User" ADD COLUMN "isAgency" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "agencyName" TEXT;
ALTER TABLE "User" ADD COLUMN "agencySlug" TEXT;
ALTER TABLE "User" ADD COLUMN "agencyLogo" TEXT;
ALTER TABLE "User" ADD COLUMN "agencyDescription" TEXT;
ALTER TABLE "User" ADD COLUMN "agencyCity" TEXT;

CREATE UNIQUE INDEX "User_agencySlug_key" ON "User"("agencySlug");
