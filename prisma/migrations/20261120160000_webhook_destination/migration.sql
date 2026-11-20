-- CreateTable
CREATE TABLE "WebhookDestination" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
