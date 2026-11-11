-- Security Monitoring & Login Activity: tabel baru saja, tidak mengubah atau menghapus data yang ada.
-- Selaraskan dengan schema: updatedAt diisi Prisma (@updatedAt), bukan default database.
ALTER TABLE "PeriodClosing" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'APP',
    "ruleId" TEXT,
    "userId" TEXT,
    "accountHash" TEXT,
    "accountMask" TEXT,
    "ip" TEXT NOT NULL DEFAULT 'unknown',
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "geoSource" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "deviceType" TEXT,
    "deviceHash" TEXT,
    "method" TEXT,
    "path" TEXT,
    "statusCode" INTEGER,
    "requestId" TEXT,
    "metadata" JSONB,
    "dedupKey" TEXT,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEventReview" (
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityEventReview_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "KnownDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "browser" TEXT,
    "os" TEXT,
    "deviceType" TEXT,
    "lastIp" TEXT,
    "country" TEXT,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnownDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedUntil" TIMESTAMP(3),
    "loggedBlock" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "GeoIpCache" (
    "ip" TEXT NOT NULL,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoIpCache_pkey" PRIMARY KEY ("ip")
);

-- CreateTable
CREATE TABLE "SecuritySetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "loginMaxFailures" INTEGER NOT NULL DEFAULT 5,
    "loginWindowMin" INTEGER NOT NULL DEFAULT 10,
    "loginBlockMin" INTEGER NOT NULL DEFAULT 15,
    "ipMaxFailures" INTEGER NOT NULL DEFAULT 30,
    "detectionMode" TEXT NOT NULL DEFAULT 'LOG_ONLY',
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "notifyMinSeverity" TEXT NOT NULL DEFAULT 'HIGH',
    "notifyCooldownMin" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SecuritySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAlert" (
    "dedupKey" TEXT NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("dedupKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "SecurityEvent_dedupKey_key" ON "SecurityEvent"("dedupKey");

-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_type_createdAt_idx" ON "SecurityEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_severity_createdAt_idx" ON "SecurityEvent"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_ip_createdAt_idx" ON "SecurityEvent"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_accountHash_createdAt_idx" ON "SecurityEvent"("accountHash", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEventReview_status_idx" ON "SecurityEventReview"("status");

-- CreateIndex
CREATE UNIQUE INDEX "KnownDevice_userId_deviceHash_key" ON "KnownDevice"("userId", "deviceHash");

-- CreateIndex
CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart");

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEventReview" ADD CONSTRAINT "SecurityEventReview_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SecurityEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnownDevice" ADD CONSTRAINT "KnownDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

