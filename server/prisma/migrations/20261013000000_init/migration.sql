-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "StaffEmploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowType" AS ENUM ('PIECE_ACTIVITY', 'PER_ORDER', 'COUNT_BASED');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'FILE_IMAGE', 'DROPDOWN', 'YES_NO');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'REASSIGNED');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('PIECE_ACTIVITY', 'PER_ORDER', 'COUNT_BASED');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DamageStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'CLOSED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('OPEN', 'CLOSED', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "shops" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "address" TEXT,
    "contact_info" TEXT,
    "logo_path" TEXT,
    "status" "ShopStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_owner" BOOLEAN NOT NULL DEFAULT false,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMP(3),
    "force_password_change" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "staff_member_id" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_members" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "mobile" TEXT,
    "address" TEXT,
    "aadhaar_encrypted" TEXT,
    "bank_account_encrypted" TEXT,
    "profile_photo_path" TEXT,
    "employment_status" "StaffEmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_memberships" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "staff_member_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "permission_profile_id" TEXT NOT NULL,
    "position_category_id" TEXT,
    "workflow_profile_id" TEXT,
    "joining_date" TIMESTAMP(3),
    "monthly_salary" DECIMAL(10,2),
    "security_deposit" DECIMAL(10,2),
    "duty_timing_notes" TEXT,
    "incentive_amount" DECIMAL(10,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_owner_only" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_profile_capabilities" (
    "id" TEXT NOT NULL,
    "permission_profile_id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,

    CONSTRAINT "permission_profile_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_categories" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workflow_profile_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workflow_type" "WorkflowType" NOT NULL,
    "allowed_activities" TEXT[],
    "requires_order_id" BOOLEAN NOT NULL DEFAULT false,
    "requires_piece_count" BOOLEAN NOT NULL DEFAULT false,
    "requires_service_type" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_activity_mappings" (
    "id" TEXT NOT NULL,
    "service_type_id" TEXT NOT NULL,
    "activity_type_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_activity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "help_text" TEXT,
    "field_type" "CustomFieldType" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "dropdown_options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility_scope" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_values" (
    "id" TEXT NOT NULL,
    "custom_field_definition_id" TEXT NOT NULL,
    "staff_member_id" TEXT NOT NULL,
    "value_text" TEXT,
    "value_number" DECIMAL(15,4),
    "value_date" TIMESTAMP(3),
    "value_file_path" TEXT,
    "value_boolean" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignments" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "staff_member_id" TEXT NOT NULL,
    "created_by_account_id" TEXT NOT NULL,
    "assignment_date" DATE NOT NULL,
    "workflow_profile_id" TEXT NOT NULL,
    "service_type_id" TEXT,
    "order_id" TEXT,
    "piece_count" INTEGER,
    "pickup_count" INTEGER,
    "selected_activities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "idempotency_key" TEXT NOT NULL,
    "config_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_units" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "staff_member_id" TEXT NOT NULL,
    "task_assignment_id" TEXT NOT NULL,
    "unit_type" "UnitType" NOT NULL,
    "piece_number" INTEGER,
    "activity_type_id" TEXT,
    "activity_code" TEXT,
    "sequence_number" INTEGER,
    "order_ref" TEXT,
    "status" "UnitStatus" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMP(3),
    "completed_by_account_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "damage_incidents" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "staff_member_id" TEXT NOT NULL,
    "task_assignment_id" TEXT NOT NULL,
    "task_unit_id" TEXT,
    "piece_number" INTEGER,
    "reported_by_account_id" TEXT NOT NULL,
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DamageStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "photo_path" TEXT,
    "reviewed_by_account_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "damage_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "staff_member_id" TEXT NOT NULL,
    "check_in_at" TIMESTAMP(3),
    "check_in_photo_path" TEXT,
    "check_out_at" TIMESTAMP(3),
    "check_out_photo_path" TEXT,
    "duration_minutes" INTEGER,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'OPEN',
    "correction_history" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_info" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT,
    "actor_account_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shops_code_key" ON "shops"("code");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_username_key" ON "accounts"("username");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_staff_member_id_key" ON "accounts"("staff_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_memberships_shop_id_staff_member_id_key" ON "shop_memberships"("shop_id", "staff_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "permission_profile_capabilities_permission_profile_id_capab_key" ON "permission_profile_capabilities"("permission_profile_id", "capability");

-- CreateIndex
CREATE UNIQUE INDEX "service_types_code_key" ON "service_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "activity_types_code_key" ON "activity_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "service_activity_mappings_service_type_id_activity_type_id_key" ON "service_activity_mappings"("service_type_id", "activity_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_shop_id_key_key" ON "custom_field_definitions"("shop_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_values_custom_field_definition_id_staff_member_key" ON "custom_field_values"("custom_field_definition_id", "staff_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignments_idempotency_key_key" ON "task_assignments"("idempotency_key");

-- CreateIndex
CREATE INDEX "task_assignments_shop_id_staff_member_id_assignment_date_idx" ON "task_assignments"("shop_id", "staff_member_id", "assignment_date");

-- CreateIndex
CREATE INDEX "task_assignments_shop_id_assignment_date_idx" ON "task_assignments"("shop_id", "assignment_date");

-- CreateIndex
CREATE INDEX "task_units_shop_id_staff_member_id_task_assignment_id_idx" ON "task_units"("shop_id", "staff_member_id", "task_assignment_id");

-- CreateIndex
CREATE INDEX "task_units_task_assignment_id_status_idx" ON "task_units"("task_assignment_id", "status");

-- CreateIndex
CREATE INDEX "damage_incidents_shop_id_staff_member_id_reported_at_idx" ON "damage_incidents"("shop_id", "staff_member_id", "reported_at");

-- CreateIndex
CREATE INDEX "damage_incidents_shop_id_status_idx" ON "damage_incidents"("shop_id", "status");

-- CreateIndex
CREATE INDEX "attendance_sessions_shop_id_staff_member_id_check_in_at_idx" ON "attendance_sessions"("shop_id", "staff_member_id", "check_in_at");

-- CreateIndex
CREATE INDEX "refresh_sessions_account_id_idx" ON "refresh_sessions"("account_id");

-- CreateIndex
CREATE INDEX "refresh_sessions_token_hash_idx" ON "refresh_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "audit_logs_shop_id_created_at_idx" ON "audit_logs"("shop_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_account_id_created_at_idx" ON "audit_logs"("actor_account_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_shop_id_key_key" ON "app_settings"("shop_id", "key");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_memberships" ADD CONSTRAINT "shop_memberships_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_memberships" ADD CONSTRAINT "shop_memberships_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_memberships" ADD CONSTRAINT "shop_memberships_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_memberships" ADD CONSTRAINT "shop_memberships_permission_profile_id_fkey" FOREIGN KEY ("permission_profile_id") REFERENCES "permission_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_memberships" ADD CONSTRAINT "shop_memberships_position_category_id_fkey" FOREIGN KEY ("position_category_id") REFERENCES "position_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_memberships" ADD CONSTRAINT "shop_memberships_workflow_profile_id_fkey" FOREIGN KEY ("workflow_profile_id") REFERENCES "workflow_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_profile_capabilities" ADD CONSTRAINT "permission_profile_capabilities_permission_profile_id_fkey" FOREIGN KEY ("permission_profile_id") REFERENCES "permission_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_categories" ADD CONSTRAINT "position_categories_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_categories" ADD CONSTRAINT "position_categories_workflow_profile_id_fkey" FOREIGN KEY ("workflow_profile_id") REFERENCES "workflow_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_activity_mappings" ADD CONSTRAINT "service_activity_mappings_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_activity_mappings" ADD CONSTRAINT "service_activity_mappings_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "activity_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_custom_field_definition_id_fkey" FOREIGN KEY ("custom_field_definition_id") REFERENCES "custom_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_values" ADD CONSTRAINT "custom_field_values_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_workflow_profile_id_fkey" FOREIGN KEY ("workflow_profile_id") REFERENCES "workflow_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_units" ADD CONSTRAINT "task_units_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_units" ADD CONSTRAINT "task_units_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_units" ADD CONSTRAINT "task_units_task_assignment_id_fkey" FOREIGN KEY ("task_assignment_id") REFERENCES "task_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_units" ADD CONSTRAINT "task_units_activity_type_id_fkey" FOREIGN KEY ("activity_type_id") REFERENCES "activity_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_incidents" ADD CONSTRAINT "damage_incidents_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_incidents" ADD CONSTRAINT "damage_incidents_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_incidents" ADD CONSTRAINT "damage_incidents_task_assignment_id_fkey" FOREIGN KEY ("task_assignment_id") REFERENCES "task_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "damage_incidents" ADD CONSTRAINT "damage_incidents_task_unit_id_fkey" FOREIGN KEY ("task_unit_id") REFERENCES "task_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "staff_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

