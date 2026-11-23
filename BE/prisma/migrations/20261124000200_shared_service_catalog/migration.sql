BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
-- AdditionalService remains the common catalog. Existing global price/stock and
-- legacy facilityId are retained as evidence, never used as cross-facility supply.
CREATE TABLE "FacilityServiceOffering" (
 "id" TEXT NOT NULL,
 "additionalServiceId" TEXT NOT NULL,
 "facilityId" TEXT NOT NULL,
 "unitPrice" BIGINT,
 "isActive" BOOLEAN NOT NULL DEFAULT false,
 "stockOnHand" INTEGER,
 "rentalCapacity" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "FacilityServiceOffering_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "FacilityServiceOffering_additionalServiceId_fkey" FOREIGN KEY ("additionalServiceId") REFERENCES "AdditionalService"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "FacilityServiceOffering_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "FacilityServiceOffering_values_check" CHECK (("unitPrice" IS NULL OR "unitPrice">0) AND ("stockOnHand" IS NULL OR "stockOnHand">=0) AND ("rentalCapacity" IS NULL OR "rentalCapacity">=0) AND (NOT "isActive" OR "unitPrice" IS NOT NULL))
);
CREATE UNIQUE INDEX "FacilityServiceOffering_additionalServiceId_facilityId_key" ON "FacilityServiceOffering"("additionalServiceId","facilityId");
CREATE INDEX "FacilityServiceOffering_facilityId_isActive_idx" ON "FacilityServiceOffering"("facilityId","isActive");
-- Only verified ownership from the prior evidence migration is eligible.
-- Do not infer supply for the nine catalog-only records, or multiply global stock.
INSERT INTO "FacilityServiceOffering" ("id","additionalServiceId","facilityId","unitPrice","isActive","stockOnHand","rentalCapacity","updatedAt")
 SELECT 'legacy-offer-'||s.id,s.id,s."facilityId",s."unitPrice",s."isActive" AND COALESCE(s."unitPrice">0,false),
 i."stockOnHand",i."rentalCapacity",CURRENT_TIMESTAMP
 FROM "AdditionalService" s LEFT JOIN "AdditionalServiceInventory" i ON i."additionalServiceId"=s.id
 WHERE s.id='cmwo3z9gp00075o95ec9etcci' AND s.code='TAPE' AND s."facilityId"='cmwo3z97300005o95f54xsuor';
COMMIT;
