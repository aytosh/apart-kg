-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "descriptionI18n" TEXT;
ALTER TABLE "Listing" ADD COLUMN "titleI18n" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "preferredLang" TEXT;
ALTER TABLE "User" ADD COLUMN "wechatId" TEXT;
