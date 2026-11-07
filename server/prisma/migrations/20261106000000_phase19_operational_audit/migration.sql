-- AlterTable
ALTER TABLE "CommunityMember" ADD COLUMN "reviewedByWallet" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "IndexedAttendance" ADD COLUMN "verifiedByWallet" TEXT;
