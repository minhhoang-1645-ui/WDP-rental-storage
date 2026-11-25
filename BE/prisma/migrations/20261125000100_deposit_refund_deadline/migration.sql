ALTER TABLE "DepositSettlement"
ADD COLUMN "refundDueOn" DATE,
ADD COLUMN "refundPolicyVersion" INTEGER,
ADD CONSTRAINT "DepositSettlement_refund_deadline_policy" CHECK (
  ("refundDueOn" IS NULL AND "refundPolicyVersion" IS NULL)
  OR ("refundDueOn" IS NOT NULL AND "refundPolicyVersion" IS NOT NULL AND "refundPolicyVersion" >= 0)
);
