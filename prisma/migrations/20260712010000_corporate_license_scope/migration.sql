ALTER TABLE "licenses"
  ALTER COLUMN "business_id" DROP NOT NULL,
  ADD COLUMN "juristic_person_id" UUID;

ALTER TABLE "licenses"
  ADD CONSTRAINT "licenses_juristic_person_id_fkey"
  FOREIGN KEY ("juristic_person_id") REFERENCES "juristic_persons"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "licenses"
  ADD CONSTRAINT "licenses_exactly_one_subject"
  CHECK (
    ("business_id" IS NOT NULL AND "juristic_person_id" IS NULL)
    OR ("business_id" IS NULL AND "juristic_person_id" IS NOT NULL)
  );

CREATE INDEX "licenses_juristic_person_id_idx"
  ON "licenses"("juristic_person_id");
