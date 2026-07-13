-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "contactEmail" TEXT NOT NULL DEFAULT 'recruitment@blibli.com',

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);
