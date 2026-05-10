-- CreateTable
CREATE TABLE "ViewingRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "slot" DATETIME,
    "roomId" TEXT NOT NULL,
    "message" TEXT,
    "ownerNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ViewingRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ViewingRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ViewingRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Listing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "deal" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "description" TEXT,
    "price" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "rooms" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "floor" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "images" TEXT NOT NULL,
    "videoUrl" TEXT,
    "rentPeriod" TEXT,
    "installment" BOOLEAN NOT NULL DEFAULT false,
    "exchange" BOOLEAN NOT NULL DEFAULT false,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "trustScore" INTEGER NOT NULL DEFAULT 50,
    "trustFlags" TEXT,
    "tourPhotos" TEXT,
    "liveAvailable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Listing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Listing" ("area", "createdAt", "currency", "deal", "description", "district", "exchange", "floor", "id", "images", "installment", "lat", "lng", "price", "propertyType", "rejectReason", "rentPeriod", "rooms", "status", "title", "trustFlags", "trustScore", "updatedAt", "urgent", "userId", "videoUrl") SELECT "area", "createdAt", "currency", "deal", "description", "district", "exchange", "floor", "id", "images", "installment", "lat", "lng", "price", "propertyType", "rejectReason", "rentPeriod", "rooms", "status", "title", "trustFlags", "trustScore", "updatedAt", "urgent", "userId", "videoUrl" FROM "Listing";
DROP TABLE "Listing";
ALTER TABLE "new_Listing" RENAME TO "Listing";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ViewingRequest_roomId_key" ON "ViewingRequest"("roomId");
