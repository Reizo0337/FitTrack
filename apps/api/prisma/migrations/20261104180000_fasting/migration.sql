-- CreateTable
CREATE TABLE "FastingConfig" (
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "breakfastTime" TEXT NOT NULL DEFAULT '08:00',
    "lunchTime" TEXT NOT NULL DEFAULT '14:00',
    "snackTime" TEXT NOT NULL DEFAULT '17:30',
    "dinnerTime" TEXT NOT NULL DEFAULT '21:00',

    CONSTRAINT "FastingConfig_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "FastingConfig" ADD CONSTRAINT "FastingConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
