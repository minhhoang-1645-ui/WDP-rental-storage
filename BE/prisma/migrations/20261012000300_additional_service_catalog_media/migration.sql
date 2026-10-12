ALTER TABLE "AdditionalService"
ALTER COLUMN "unitPrice" DROP NOT NULL,
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "imageAlt" TEXT;
