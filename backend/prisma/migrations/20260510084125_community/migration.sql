-- CreateTable
CREATE TABLE "RoommatePost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "budgetMin" INTEGER NOT NULL,
    "budgetMax" INTEGER NOT NULL,
    "bio" TEXT NOT NULL,
    "lifestyleTags" TEXT NOT NULL,
    "lookingFor" TEXT NOT NULL,
    "gender" TEXT,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "photoPath" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoommatePost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoommateLike" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "fromPostId" TEXT NOT NULL,
    "toPostId" TEXT NOT NULL,
    "liked" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoommateLike_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoommateLike_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoommateLike_fromPostId_fkey" FOREIGN KEY ("fromPostId") REFERENCES "RoommatePost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoommateLike_toPostId_fkey" FOREIGN KEY ("toPostId") REFERENCES "RoommatePost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BuildingProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "normalizedKey" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "district" TEXT,
    "lat" REAL,
    "lng" REAL,
    "ratingAvg" REAL,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BuildingReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buildingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "pros" TEXT,
    "cons" TEXT,
    "livedFrom" DATETIME,
    "livedTo" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BuildingReview_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "BuildingProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BuildingReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BuildingChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buildingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BuildingChatMessage_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "BuildingProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BuildingChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BuildingMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buildingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "verifiedAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BuildingMember_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "BuildingProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BuildingMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RoommateLike_fromUserId_toPostId_key" ON "RoommateLike"("fromUserId", "toPostId");

-- CreateIndex
CREATE UNIQUE INDEX "BuildingProfile_normalizedKey_key" ON "BuildingProfile"("normalizedKey");

-- CreateIndex
CREATE UNIQUE INDEX "BuildingMember_buildingId_userId_key" ON "BuildingMember"("buildingId", "userId");
