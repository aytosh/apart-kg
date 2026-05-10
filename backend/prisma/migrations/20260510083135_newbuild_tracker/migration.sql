-- CreateTable
CREATE TABLE "Developer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoPath" TEXT,
    "about" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "website" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DeveloperMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "developerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeveloperMember_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeveloperMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Complex" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "developerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "address" TEXT,
    "lat" REAL,
    "lng" REAL,
    "totalUnits" INTEGER,
    "deadline" DATETIME,
    "photoCover" TEXT,
    "about" TEXT,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "currentStage" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Complex_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "Developer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConstructionUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "complexId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "photos" TEXT,
    "progressPercent" INTEGER,
    "stage" TEXT,
    "milestone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConstructionUpdate_complexId_fkey" FOREIGN KEY ("complexId") REFERENCES "Complex" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComplexSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "complexId" TEXT NOT NULL,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplexSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComplexSubscription_complexId_fkey" FOREIGN KEY ("complexId") REFERENCES "Complex" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "reservedUntil" DATETIME,
    "prepayAmount" INTEGER,
    "prepayCurrency" TEXT,
    "paymentId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reservation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "complexId" TEXT,
    "unitNumber" TEXT,
    "floorPlanPath" TEXT,
    "constructionStage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Listing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Listing_complexId_fkey" FOREIGN KEY ("complexId") REFERENCES "Complex" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Listing" ("area", "createdAt", "currency", "deal", "description", "district", "exchange", "floor", "id", "images", "installment", "lat", "liveAvailable", "lng", "price", "propertyType", "rejectReason", "rentPeriod", "rooms", "status", "title", "tourPhotos", "trustFlags", "trustScore", "updatedAt", "urgent", "userId", "videoUrl") SELECT "area", "createdAt", "currency", "deal", "description", "district", "exchange", "floor", "id", "images", "installment", "lat", "liveAvailable", "lng", "price", "propertyType", "rejectReason", "rentPeriod", "rooms", "status", "title", "tourPhotos", "trustFlags", "trustScore", "updatedAt", "urgent", "userId", "videoUrl" FROM "Listing";
DROP TABLE "Listing";
ALTER TABLE "new_Listing" RENAME TO "Listing";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Developer_slug_key" ON "Developer"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperMember_developerId_userId_key" ON "DeveloperMember"("developerId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Complex_slug_key" ON "Complex"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ComplexSubscription_userId_complexId_key" ON "ComplexSubscription"("userId", "complexId");
