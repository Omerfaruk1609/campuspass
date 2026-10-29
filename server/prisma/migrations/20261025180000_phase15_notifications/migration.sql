-- CampusPass — Faz 15: Bildirim Merkezi, Topluluk Duyuruları ve Tercihler Migration Dosyası
-- Ağ: Monad Testnet (Chain ID: 10143)

-- CreateTable: Notification
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientWallet" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "destinationUrl" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "metadata" TEXT,
    "dedupKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Announcement
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "communityId" TEXT,
    "eventId" INTEGER,
    "chainId" INTEGER,
    "contractAddress" TEXT,
    "authorWallet" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable: NotificationPreference
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "eventUpdates" BOOLEAN NOT NULL DEFAULT true,
    "community" BOOLEAN NOT NULL DEFAULT true,
    "announcements" BOOLEAN NOT NULL DEFAULT true,
    "certificates" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_recipientWallet_idx" ON "Notification"("recipientWallet");
CREATE INDEX "Notification_recipientWallet_read_idx" ON "Notification"("recipientWallet", "read");
CREATE INDEX "Notification_recipientWallet_createdAt_idx" ON "Notification"("recipientWallet", "createdAt");
CREATE INDEX "Notification_recipientWallet_dedupKey_idx" ON "Notification"("recipientWallet", "dedupKey");

CREATE INDEX "Announcement_targetType_communityId_idx" ON "Announcement"("targetType", "communityId");
CREATE INDEX "Announcement_targetType_eventId_idx" ON "Announcement"("targetType", "eventId");
CREATE INDEX "Announcement_authorWallet_idx" ON "Announcement"("authorWallet");

CREATE UNIQUE INDEX "NotificationPreference_walletAddress_key" ON "NotificationPreference"("walletAddress");
CREATE INDEX "NotificationPreference_walletAddress_idx" ON "NotificationPreference"("walletAddress");
