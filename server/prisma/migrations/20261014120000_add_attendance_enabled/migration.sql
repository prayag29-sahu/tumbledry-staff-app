-- Add attendance_enabled column to shop_memberships
-- Defaults to true for general staff. Can be toggled on/off by owner per staff member.
ALTER TABLE "shop_memberships" ADD COLUMN "attendance_enabled" BOOLEAN NOT NULL DEFAULT true;

-- By default, existing supervisors should have attendance_enabled = false
UPDATE "shop_memberships" sm
SET "attendance_enabled" = false
FROM "permission_profiles" pp
WHERE sm.permission_profile_id = pp.id
  AND (LOWER(pp.name) LIKE '%supervisor%' OR pp.id = 'sys-supervisor');
