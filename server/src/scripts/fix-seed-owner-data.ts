import 'dotenv/config';
import { PrismaClient, WorkflowType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- 1. Fixing PositionCategory Workflow Profiles ---');
  // 1. Ensure WorkflowProfiles exist
  const pieceActivityWfp = await prisma.workflowProfile.upsert({
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

  const perOrderWfp = await prisma.workflowProfile.upsert({
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

  const countBasedWfp = await prisma.workflowProfile.upsert({
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

  // Link existing positions
  const updatedWasher = await prisma.positionCategory.updateMany({
    where: { name: { contains: 'Washer', mode: 'insensitive' } },
    data: { workflowProfileId: pieceActivityWfp.id },
  });
  console.log(`Updated Washer positions to piece-activity: ${updatedWasher.count}`);

  const updatedIron = await prisma.positionCategory.updateMany({
    where: { name: { contains: 'Iron', mode: 'insensitive' } },
    data: { workflowProfileId: pieceActivityWfp.id },
  });
  console.log(`Updated Ironman positions to piece-activity: ${updatedIron.count}`);

  const updatedDelivery = await prisma.positionCategory.updateMany({
    where: { name: { contains: 'Delivery', mode: 'insensitive' } },
    data: { workflowProfileId: perOrderWfp.id },
  });
  console.log(`Updated Delivery positions to per-order: ${updatedDelivery.count}`);

  const updatedPickup = await prisma.positionCategory.updateMany({
    where: { name: { contains: 'Pickup', mode: 'insensitive' } },
    data: { workflowProfileId: countBasedWfp.id },
  });
  console.log(`Updated Pickup positions to count-based: ${updatedPickup.count}`);

  console.log('--- 2. Setting Default Work Steps for Services ---');
  // Ensure activities exist
  const activities = await prisma.activityType.findMany();
  const actMap = new Map(activities.map((a) => [a.code, a.id]));

  const serviceDefaultActivities: Record<string, string[]> = {
    CL: ['DRY', 'IRON', 'PACK'],
    WF: ['WASH', 'DRY', 'FOLD', 'PACK'],
    WSI: ['WASH', 'DRY', 'IRON', 'PACK'],
    SI: ['IRON', 'PACK'],
    SHC: ['WASH', 'DRY', 'PACK'],
    BLANKET: ['WASH', 'DRY', 'PACK'],
  };

  for (const [code, stepCodes] of Object.entries(serviceDefaultActivities)) {
    const svc = await prisma.serviceType.findUnique({ where: { code } });
    if (!svc) {
      console.log(`Service ${code} not found, skipping.`);
      continue;
    }
    // Delete existing mappings and recreate
    await prisma.serviceActivityMapping.deleteMany({ where: { serviceTypeId: svc.id } });
    const stepIds = stepCodes.map((sc) => actMap.get(sc)).filter(Boolean) as string[];
    if (stepIds.length > 0) {
      await prisma.serviceActivityMapping.createMany({
        data: stepIds.map((activityTypeId) => ({
          serviceTypeId: svc.id,
          activityTypeId,
        })),
        skipDuplicates: true,
      });
      console.log(`✓ Mapped service ${svc.name} (${code}) -> [${stepCodes.join(', ')}]`);
    }
  }

  console.log('--- 3. Seeding Standard Custom Fields for Shops ---');
  const shops = await prisma.shop.findMany();
  const deliveryBoyRoles = await prisma.positionCategory.findMany({
    where: { name: { contains: 'Delivery', mode: 'insensitive' } },
  });
  const deliveryRoleIds = deliveryBoyRoles.map((r) => r.id);

  for (const shop of shops) {
    const existing = await prisma.customFieldDefinition.findMany({
      where: { shopId: shop.id },
    });
    const existingKeys = new Set(existing.map((f) => f.key));

    const standardFields = [
      {
        key: 'aadhaar_number',
        label: 'Aadhaar / Govt ID Number',
        helpText: 'Official 12-digit Aadhaar or Gov ID',
        fieldType: 'TEXT' as const,
        isRequired: false,
        displayOrder: 1,
        visibilityScope: 'ALL',
      },
      {
        key: 'emergency_contact',
        label: 'Emergency Contact Phone',
        helpText: 'Family or guardian contact number',
        fieldType: 'TEXT' as const,
        isRequired: false,
        displayOrder: 2,
        visibilityScope: 'ALL',
      },
      {
        key: 'blood_group',
        label: 'Blood Group',
        helpText: 'Medical info for safety',
        fieldType: 'DROPDOWN' as const,
        dropdownOptions: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
        isRequired: false,
        displayOrder: 3,
        visibilityScope: 'ALL',
      },
      {
        key: 'uniform_size',
        label: 'Uniform Size',
        helpText: 'Tumbledry staff uniform size',
        fieldType: 'DROPDOWN' as const,
        dropdownOptions: ['S', 'M', 'L', 'XL', 'XXL'],
        isRequired: false,
        displayOrder: 4,
        visibilityScope: 'ALL',
      },
      {
        key: 'driving_licence',
        label: 'Driving Licence Number',
        helpText: 'Two-wheeler licence for delivery staff',
        fieldType: 'TEXT' as const,
        isRequired: false,
        displayOrder: 5,
        visibilityScope: deliveryRoleIds.length > 0 ? JSON.stringify(deliveryRoleIds) : 'ALL',
      },
    ];

    for (const sf of standardFields) {
      if (!existingKeys.has(sf.key)) {
        await prisma.customFieldDefinition.create({
          data: {
            ...sf,
            shopId: shop.id,
            isActive: true,
          },
        });
        console.log(`✓ Added standard field "${sf.label}" for shop ${shop.name}`);
      }
    }
  }

  console.log('--- 4. Enabling damage.report for Delivery Boy permission profile ---');
  const deliveryProfile = await prisma.permissionProfile.findFirst({
    where: { name: { equals: 'Delivery Boy', mode: 'insensitive' } },
    include: { capabilities: true },
  });
  if (deliveryProfile) {
    const hasDamageReport = deliveryProfile.capabilities.some((c) => c.capability === 'damage.report');
    if (!hasDamageReport) {
      await prisma.permissionProfileCapability.create({
        data: {
          permissionProfileId: deliveryProfile.id,
          capability: 'damage.report',
        },
      });
      console.log('✓ Added damage.report capability to Delivery Boy');
    }
  }

  console.log('--- All DB-centric fixes applied successfully! ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
