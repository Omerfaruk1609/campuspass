-- CampusPass — Faz 12: Üniversite Topluluk Yönetim Sistemi Migration Dosyası
-- Ağ: Monad Testnet (Chain ID: 10143)

-- CreateEnum
CREATE TYPE "CommunityRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'REMOVED');

-- AlterTable: Community genişletilmiş alanlar
ALTER TABLE "Community" ADD COLUMN "shortDescription" TEXT;
ALTER TABLE "Community" ADD COLUMN "universityName" TEXT NOT NULL DEFAULT 'Monad Üniversitesi';
ALTER TABLE "Community" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Genel';
ALTER TABLE "Community" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Community" ADD COLUMN "coverImageUrl" TEXT;
ALTER TABLE "Community" ADD COLUMN "websiteUrl" TEXT;
ALTER TABLE "Community" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Community" ADD COLUMN "createdByWallet" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Community" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- Mevcut kayıtlar varsa createdByWallet alanını leadOrganizerAddress ile doldur
UPDATE "Community" SET "createdByWallet" = "leadOrganizerAddress" WHERE "createdByWallet" = '';

-- CreateTable: CommunityMember
CREATE TABLE "CommunityMember" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "role" "CommunityRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING',
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "community_member_unique" ON "CommunityMember"("communityId", "walletAddress");
CREATE INDEX "CommunityMember_walletAddress_idx" ON "CommunityMember"("walletAddress");
CREATE INDEX "CommunityMember_communityId_idx" ON "CommunityMember"("communityId");
CREATE INDEX "CommunityMember_status_idx" ON "CommunityMember"("status");
CREATE INDEX "CommunityMember_role_idx" ON "CommunityMember"("role");

CREATE INDEX "Community_createdByWallet_idx" ON "Community"("createdByWallet");
CREATE INDEX "Community_status_idx" ON "Community"("status");
CREATE INDEX "Community_category_idx" ON "Community"("category");

-- AddForeignKey
ALTER TABLE "CommunityMember" ADD CONSTRAINT "CommunityMember_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
