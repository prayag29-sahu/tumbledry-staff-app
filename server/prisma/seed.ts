/**
 * Prisma seed file — approved configuration data only.
 * NO fake staff, fake attendance, fake orders or demo metrics.
 * Seeds only the approved initial configuration that the app
 * needs to function: permission profiles, workflow profiles,
 * service catalogue and activity catalogue.
 */
import 'dotenv/config';
import { PrismaClient, WorkflowType } from '@prisma/client';
import { hashPassword } from '../src/modules/auth/auth.service';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding approved configuration data...');

  // ─── Activity catalogue ──────────────────────────────────────────────────
  await Promise.all([
    upsertActivity('WASH', 'Wash', 1),
    upsertActivity('DRY', 'Dry', 2),
    upsertActivity('IRON', 'Iron', 3),
    upsertActivity('FOLD', 'Fold', 4),
    upsertActivity('PACK', 'Pack', 5),
    upsertActivity('DELIVERY', 'Delivery', 6),
    upsertActivity('PICKUP', 'Pickup', 7),
  ]);
  console.log('✓ Activity types seeded');

  // ─── Service catalogue ───────────────────────────────────────────────────
  // Initial service types from business specification.
  // Service-to-activity mapping is LEFT BLANK pending Owner approval (Open Decision #2).
  await upsertService('CL', 'Dry Clean', 1);
  await upsertService('WF', 'Wash & Fold', 2);
  await upsertService('WSI', 'Wash & Steam Iron', 3);
  await upsertService('SI', 'Steam Iron', 4);
  await upsertService('SHC', 'Shoes Cleaning', 5);
  await upsertService('BLANKET', 'Blanket', 6);
  console.log('✓ Service types seeded (activity mappings pending Owner approval)');

  // ─── Workflow profiles ───────────────────────────────────────────────────
  await prisma.workflowProfile.upsert({
    where: { id: 'wfp-piece-activity' },
    update: {},
    create: {
      id: 'wfp-piece-activity',
      name: 'Piece × Activity (Washerman/Ironman)',
      description: 'Generates one task unit per piece × per selected activity.',
      workflowType: WorkflowType.PIECE_ACTIVITY,
      allowedActivities: ['WASH', 'DRY', 'IRON', 'FOLD', 'PACK'],
      requiresOrderId: true,
      requiresPieceCount: true,
      requiresServiceType: true,
    },
  });

  await prisma.workflowProfile.upsert({
    where: { id: 'wfp-per-order' },
    update: {},
    create: {
      id: 'wfp-per-order',
      name: 'Per Delivery Order',
      description: 'Generates one task unit per delivery order regardless of piece count.',
      workflowType: WorkflowType.PER_ORDER,
      allowedActivities: ['DELIVERY'],
      requiresOrderId: true,
      requiresPieceCount: true,
      requiresServiceType: false,
    },
  });

  await prisma.workflowProfile.upsert({
    where: { id: 'wfp-count-based' },
    update: {},
    create: {
      id: 'wfp-count-based',
      name: 'Pickup Count',
      description: 'Generates N independently completable pickup units from Pickup Count.',
      workflowType: WorkflowType.COUNT_BASED,
      allowedActivities: ['PICKUP'],
      requiresOrderId: false,
      requiresPieceCount: false,
      requiresServiceType: false,
    },
  });
  console.log('✓ Workflow profiles seeded');

  // ─── System permission profiles ──────────────────────────────────────────
  // These represent the standard permission bundles for each system role.
  // Owner can create additional custom profiles.
  await upsertPermissionProfile('Supervisor', true, [
    'staff.read', 'staff.create', 'staff.update', 'staff.archive',
    'tasks.read_team', 'tasks.assign',
    'attendance.read_team', 'attendance.self',
    'damage.read', 'damage.report',
    'custom_fields.manage',
    'reports.read',
  ]);

  await upsertPermissionProfile('Manager', true, [
    'staff.read',
    'tasks.read_team', 'tasks.assign',
    'attendance.read_team', 'attendance.self',
    'damage.read',
    'reports.read',
  ]);

  await upsertPermissionProfile('Washerman', true, [
    'tasks.complete', 'tasks.read_self',
    'attendance.self',
    'damage.report',
  ]);

  await upsertPermissionProfile('Ironman', true, [
    'tasks.complete', 'tasks.read_self',
    'attendance.self',
    'damage.report',
  ]);

  await upsertPermissionProfile('Delivery Boy', true, [
    'tasks.complete', 'tasks.read_self',
    'attendance.self',
  ]);
  console.log('✓ System permission profiles seeded');

  // ─── Owner account ───────────────────────────────────────────────────────
  // Creates an initial Owner account if none exists.
  // Password is set to a forced-change placeholder — Owner MUST change on first login.
  const existingOwner = await prisma.account.findFirst({ where: { isOwner: true } });
  if (!existingOwner) {
    const tempPassword = 'TumbledryOwner@' + Math.random().toString(36).slice(2, 10);
    const passwordHash = await hashPassword(tempPassword);
    await prisma.account.create({
      data: {
        username: 'owner',
        passwordHash,
        isOwner: true,
        forcePasswordChange: true,
        status: 'ACTIVE',
      },
    });
    console.log('✓ Owner account created: username=owner  (MUST change password on first login)');
    console.log(`  Temporary password: ${tempPassword}`);
    console.log('  Store this password securely — it will not be shown again.');
  } else {
    console.log('✓ Owner account already exists — skipped.');
  }

  console.log('\n✅ Seed complete. No fake staff, orders or attendance records were created.');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function upsertActivity(code: string, name: string, order: number) {
  return prisma.activityType.upsert({
    where: { code },
    update: { name, displayOrder: order },
    create: { code, name, displayOrder: order },
  });
}

async function upsertService(code: string, name: string, order: number) {
  return prisma.serviceType.upsert({
    where: { code },
    update: { name, displayOrder: order },
    create: { code, name, displayOrder: order },
  });
}

async function upsertPermissionProfile(name: string, isSystem: boolean, capabilities: string[]) {
  const profile = await prisma.permissionProfile.upsert({
    where: { id: `sys-${name.toLowerCase().replace(/\s+/g, '-')}` },
    update: { name },
    create: {
      id: `sys-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      isSystem,
      capabilities: {
        create: capabilities.map((cap) => ({ capability: cap })),
      },
    },
  });
  return profile;
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
