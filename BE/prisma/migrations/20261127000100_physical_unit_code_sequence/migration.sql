BEGIN;

CREATE TABLE "StorageUnitCodeCounter" (
    "prefix" TEXT PRIMARY KEY,
    "lastIssued" DECIMAL(50, 0) NOT NULL
);

-- Include every status and any existing code using the same global prefix,
-- even if the unit has since moved to another type.
LOCK TABLE "StorageUnit" IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO "StorageUnitCodeCounter" ("prefix", "lastIssued")
SELECT parts[1], MAX(parts[2]::NUMERIC)
FROM "StorageUnit"
CROSS JOIN LATERAL regexp_match("unitNumber", '^(.+)-([0-9]{2,})$') AS code(parts)
WHERE parts IS NOT NULL
GROUP BY parts[1];

-- Cover older writers and imports that still supply a physical unit code.
CREATE FUNCTION track_storage_unit_code() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    parts TEXT[] := regexp_match(NEW."unitNumber", '^(.+)-([0-9]{2,})$');
BEGIN
    IF parts IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "StorageUnitCodeCounter"
        WHERE "prefix" = parts[1] AND "lastIssued" >= parts[2]::NUMERIC
    ) THEN
        INSERT INTO "StorageUnitCodeCounter" ("prefix", "lastIssued")
        VALUES (parts[1], parts[2]::NUMERIC)
        ON CONFLICT ("prefix") DO UPDATE
        SET "lastIssued" = GREATEST("StorageUnitCodeCounter"."lastIssued", EXCLUDED."lastIssued");
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "StorageUnit_track_code"
AFTER INSERT OR UPDATE OF "unitNumber" ON "StorageUnit"
FOR EACH ROW EXECUTE FUNCTION track_storage_unit_code();

COMMIT;
