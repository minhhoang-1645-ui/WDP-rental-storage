-- Read-only prerequisite report. A non-zero blocking count requires reconciliation; never delete rows automatically.
BEGIN READ ONLY;
SELECT 'duplicate_active_facility_grants' AS issue, count(*) AS blocking_count FROM (
 SELECT "userId","facilityId" FROM "FacilityAccess" WHERE "revokedAt" IS NULL GROUP BY 1,2 HAVING count(*)>1
) x
UNION ALL SELECT 'duplicate_policy_versions',count(*) FROM (
 SELECT "key","facilityId","storageTypeId","version" FROM "BusinessRule" GROUP BY 1,2,3,4 HAVING count(*)>1
) x
UNION ALL SELECT 'invalid_policy_scope_or_dates',count(*) FROM "BusinessRule"
 WHERE "version"<=0 OR "effectiveTo"<="effectiveFrom" OR ("storageTypeId" IS NOT NULL AND "facilityId" IS NULL)
UNION ALL SELECT 'overlapping_policy_intervals',count(*) FROM "BusinessRule" a JOIN "BusinessRule" b ON a.id<b.id
 AND a."key"=b."key" AND a."facilityId" IS NOT DISTINCT FROM b."facilityId" AND a."storageTypeId" IS NOT DISTINCT FROM b."storageTypeId"
 AND a."effectiveFrom"<COALESCE(b."effectiveTo",'infinity'::timestamp) AND b."effectiveFrom"<COALESCE(a."effectiveTo",'infinity'::timestamp)
UNION ALL SELECT 'invalid_allocation_periods',count(*) FROM "ReservationUnit" WHERE "plannedStartDate">="plannedEndDate"
UNION ALL SELECT 'overlapping_unreleased_allocations',count(*) FROM "ReservationUnit" a JOIN "ReservationUnit" b ON a.id<b.id
 AND a."storageUnitId"=b."storageUnitId" AND a."releasedAt" IS NULL AND b."releasedAt" IS NULL
 AND a."plannedStartDate"<b."plannedEndDate" AND b."plannedStartDate"<a."plannedEndDate"
UNION ALL SELECT 'invalid_invoice_balances',count(*) FROM "Invoice"
 WHERE "totalAmount"<0 OR "amountPaid"<0 OR "balanceDue"<0 OR ("status"<>'VOID' AND "amountPaid"+"balanceDue"<>"totalAmount") OR ("status"='VOID' AND ("balanceDue"<>0 OR "amountPaid">"totalAmount")) OR ("status"='PAID' AND "balanceDue"<>0)
UNION ALL SELECT 'nonpositive_payments',count(*) FROM "Payment" WHERE "amount"<=0
UNION ALL SELECT 'policy_missing_facility',count(*) FROM "BusinessRule" r LEFT JOIN "Facility" f ON f.id=r."facilityId" WHERE r."facilityId" IS NOT NULL AND f.id IS NULL
UNION ALL SELECT 'policy_missing_storage_type',count(*) FROM "BusinessRule" r LEFT JOIN "StorageType" t ON t.id=r."storageTypeId" WHERE r."storageTypeId" IS NOT NULL AND t.id IS NULL;
COMMIT;
