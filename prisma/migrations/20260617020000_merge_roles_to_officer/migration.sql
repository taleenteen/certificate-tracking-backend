-- Consolidate 5 roles into 4: inspector + supervisor → officer
-- Roles are stored as a text array, so we replace each value in place.
UPDATE "system_users"
SET "roles" = (
  SELECT array_agg(
    CASE
      WHEN r = 'inspector' THEN 'officer'
      WHEN r = 'supervisor' THEN 'officer'
      ELSE r
    END
  )
  FROM unnest("roles") AS r
)
WHERE 'inspector' = ANY("roles") OR 'supervisor' = ANY("roles");
