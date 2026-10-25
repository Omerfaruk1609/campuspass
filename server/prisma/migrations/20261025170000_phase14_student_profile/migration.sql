-- CampusPass — Faz 14: Öğrenci Profilleri ve Hesap Ayarları Migration Dosyası
-- Ağ: Monad Testnet (Chain ID: 10143)

-- CreateTable: StudentProfile
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "displayName" TEXT,
    "university" TEXT NOT NULL DEFAULT 'Monad Üniversitesi',
    "department" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_walletAddress_key" ON "StudentProfile"("walletAddress");
CREATE INDEX "StudentProfile_walletAddress_idx" ON "StudentProfile"("walletAddress");
