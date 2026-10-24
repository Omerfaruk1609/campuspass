-- CampusPass — İlk PostgreSQL Veritabanı Migration Dosyası (Faz 9 / Faz 9.5)
-- Ağ: Monad Testnet (Chain ID: 10143)
-- Sözleşme: 0x12C8B599b2c34dB66Ba942Da818f056Ae6B1a8da

-- CreateTable: Community
CREATE TABLE "Community" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "leadOrganizerAddress" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EventMetadata
CREATE TABLE "EventMetadata" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "eventId" INTEGER NOT NULL,
    "organizerAddress" TEXT NOT NULL,
    "title" TEXT,
    "capacity" INTEGER,
    "description" TEXT NOT NULL,
    "community" TEXT NOT NULL,
    "communityId" TEXT,
    "category" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "registrationDeadline" TIMESTAMP(3) NOT NULL,
    "campus" TEXT NOT NULL,
    "building" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "posterUrl" TEXT,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable: IndexedRegistration
CREATE TABLE "IndexedRegistration" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "eventId" INTEGER NOT NULL,
    "participantAddress" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexedRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable: IndexedAttendance
CREATE TABLE "IndexedAttendance" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "eventId" INTEGER NOT NULL,
    "participantAddress" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexedAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable: IndexerCheckpoint
CREATE TABLE "IndexerCheckpoint" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "lastProcessedBlock" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AuthNonce
CREATE TABLE "AuthNonce" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "walletAddress" TEXT,
    "domain" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable: OrganizerSession
CREATE TABLE "OrganizerSession" (
    "id" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AttendanceCertificate
CREATE TABLE "AttendanceCertificate" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "eventId" INTEGER NOT NULL,
    "participantAddress" TEXT NOT NULL,
    "attendanceTxHash" TEXT NOT NULL,
    "certificateHash" TEXT NOT NULL,
    "metadataUri" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Community
CREATE UNIQUE INDEX "Community_slug_key" ON "Community"("slug");
CREATE UNIQUE INDEX "Community_name_key" ON "Community"("name");
CREATE INDEX "Community_leadOrganizerAddress_idx" ON "Community"("leadOrganizerAddress");

-- CreateIndex: EventMetadata
CREATE UNIQUE INDEX "EventMetadata_chainId_contractAddress_eventId_key" ON "EventMetadata"("chainId", "contractAddress", "eventId");
CREATE INDEX "EventMetadata_organizerAddress_idx" ON "EventMetadata"("organizerAddress");
CREATE INDEX "EventMetadata_category_idx" ON "EventMetadata"("category");
CREATE INDEX "EventMetadata_community_idx" ON "EventMetadata"("community");
CREATE INDEX "EventMetadata_startAt_idx" ON "EventMetadata"("startAt");

-- CreateIndex: IndexedRegistration
CREATE UNIQUE INDEX "IndexedRegistration_chainId_contractAddress_transactionHash_key" ON "IndexedRegistration"("chainId", "contractAddress", "transactionHash", "logIndex");
CREATE UNIQUE INDEX "IndexedRegistration_chainId_contractAddress_eventId_partici_key" ON "IndexedRegistration"("chainId", "contractAddress", "eventId", "participantAddress");
CREATE INDEX "IndexedRegistration_participantAddress_idx" ON "IndexedRegistration"("participantAddress");
CREATE INDEX "IndexedRegistration_chainId_contractAddress_eventId_idx" ON "IndexedRegistration"("chainId", "contractAddress", "eventId");
CREATE INDEX "IndexedRegistration_blockNumber_idx" ON "IndexedRegistration"("blockNumber");

-- CreateIndex: IndexedAttendance
CREATE UNIQUE INDEX "IndexedAttendance_chainId_contractAddress_transactionHash_l_key" ON "IndexedAttendance"("chainId", "contractAddress", "transactionHash", "logIndex");
CREATE UNIQUE INDEX "IndexedAttendance_chainId_contractAddress_eventId_participa_key" ON "IndexedAttendance"("chainId", "contractAddress", "eventId", "participantAddress");
CREATE INDEX "IndexedAttendance_participantAddress_idx" ON "IndexedAttendance"("participantAddress");
CREATE INDEX "IndexedAttendance_chainId_contractAddress_eventId_idx" ON "IndexedAttendance"("chainId", "contractAddress", "eventId");
CREATE INDEX "IndexedAttendance_blockNumber_idx" ON "IndexedAttendance"("blockNumber");

-- CreateIndex: IndexerCheckpoint
CREATE UNIQUE INDEX "IndexerCheckpoint_chainId_contractAddress_key" ON "IndexerCheckpoint"("chainId", "contractAddress");

-- CreateIndex: AuthNonce
CREATE UNIQUE INDEX "AuthNonce_nonce_key" ON "AuthNonce"("nonce");
CREATE INDEX "AuthNonce_expiresAt_idx" ON "AuthNonce"("expiresAt");

-- CreateIndex: OrganizerSession
CREATE UNIQUE INDEX "OrganizerSession_sessionTokenHash_key" ON "OrganizerSession"("sessionTokenHash");
CREATE INDEX "OrganizerSession_walletAddress_idx" ON "OrganizerSession"("walletAddress");
CREATE INDEX "OrganizerSession_expiresAt_idx" ON "OrganizerSession"("expiresAt");

-- CreateIndex: AttendanceCertificate
CREATE UNIQUE INDEX "AttendanceCertificate_certificateHash_key" ON "AttendanceCertificate"("certificateHash");
CREATE UNIQUE INDEX "AttendanceCertificate_chainId_contractAddress_eventId_parti_key" ON "AttendanceCertificate"("chainId", "contractAddress", "eventId", "participantAddress");
CREATE INDEX "AttendanceCertificate_participantAddress_idx" ON "AttendanceCertificate"("participantAddress");

-- AddForeignKey
ALTER TABLE "EventMetadata" ADD CONSTRAINT "EventMetadata_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndexedRegistration" ADD CONSTRAINT "IndexedRegistration_chainId_contractAddress_eventId_fkey" FOREIGN KEY ("chainId", "contractAddress", "eventId") REFERENCES "EventMetadata"("chainId", "contractAddress", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndexedAttendance" ADD CONSTRAINT "IndexedAttendance_chainId_contractAddress_eventId_fkey" FOREIGN KEY ("chainId", "contractAddress", "eventId") REFERENCES "EventMetadata"("chainId", "contractAddress", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndexedAttendance" ADD CONSTRAINT "IndexedAttendance_chainId_contractAddress_eventId_particip_fkey" FOREIGN KEY ("chainId", "contractAddress", "eventId", "participantAddress") REFERENCES "IndexedRegistration"("chainId", "contractAddress", "eventId", "participantAddress") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCertificate" ADD CONSTRAINT "AttendanceCertificate_chainId_contractAddress_eventId_fkey" FOREIGN KEY ("chainId", "contractAddress", "eventId") REFERENCES "EventMetadata"("chainId", "contractAddress", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCertificate" ADD CONSTRAINT "AttendanceCertificate_chainId_contractAddress_eventId_part_fkey" FOREIGN KEY ("chainId", "contractAddress", "eventId", "participantAddress") REFERENCES "IndexedAttendance"("chainId", "contractAddress", "eventId", "participantAddress") ON DELETE RESTRICT ON UPDATE CASCADE;
