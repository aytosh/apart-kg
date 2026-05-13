-- AlterTable: promotion windows on Listing
ALTER TABLE "Listing" ADD COLUMN "vipUntil" DATETIME;
ALTER TABLE "Listing" ADD COLUMN "topUntil" DATETIME;
ALTER TABLE "Listing" ADD COLUMN "premiumUntil" DATETIME;
ALTER TABLE "Listing" ADD COLUMN "priorityScore" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Listing_priorityScore_idx" ON "Listing"("priorityScore");

-- CreateTable: CallbackRequest
CREATE TABLE "CallbackRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requesterId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "preferredAt" TEXT,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CallbackRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CallbackRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CallbackRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "CallbackRequest_ownerId_idx" ON "CallbackRequest"("ownerId");
CREATE INDEX "CallbackRequest_listingId_idx" ON "CallbackRequest"("listingId");
CREATE INDEX "CallbackRequest_status_idx" ON "CallbackRequest"("status");
