-- CampusPass — Faz 10: Blockchain Doğrulamalı Dijital Katılım Sertifikaları Migration Dosyası
-- Mevcut tabloları veya verileri silmeden AttendanceCertificate modelini genişletir.
-- Reorg durumunda IndexedAttendance silindiğinde sertifika kaydının INVALIDATED_BY_REORG
-- olarak korunabilmesi için kısıtlayıcı yabancı anahtarlar kaldırılır.

-- DropForeignKey
ALTER TABLE "AttendanceCertificate" DROP CONSTRAINT IF EXISTS "AttendanceCertificate_chainId_contractAddress_eventId_fkey";
ALTER TABLE "AttendanceCertificate" DROP CONSTRAINT IF EXISTS "AttendanceCertificate_chainId_contractAddress_eventId_part_fkey";

-- AlterTable: AttendanceCertificate
ALTER TABLE "AttendanceCertificate"
  ADD COLUMN "certificateId" TEXT NOT NULL,
  ADD COLUMN "version" TEXT NOT NULL DEFAULT 'CP-CERT-V1',
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "eventTitle" TEXT NOT NULL,
  ADD COLUMN "organizerAddress" TEXT NOT NULL,
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "attendanceBlockNumber" INTEGER NOT NULL,
  ADD COLUMN "attendanceLogIndex" INTEGER NOT NULL,
  ADD COLUMN "integritySignature" TEXT NOT NULL,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex: AttendanceCertificate benzersiz sertifika kimliği ve etkinlik indeksi
CREATE UNIQUE INDEX "AttendanceCertificate_certificateId_key" ON "AttendanceCertificate"("certificateId");
CREATE INDEX "AttendanceCertificate_chainId_contractAddress_eventId_idx" ON "AttendanceCertificate"("chainId", "contractAddress", "eventId");
