-- CreateTable
CREATE TABLE "auth_attempts" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "ip" TEXT,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_attempts_email_created_at_idx" ON "auth_attempts"("email", "created_at");

-- CreateIndex
CREATE INDEX "auth_attempts_ip_created_at_idx" ON "auth_attempts"("ip", "created_at");
