export type WorkflowType = 'PIECE_ACTIVITY' | 'PER_ORDER' | 'COUNT_BASED';

export type UnitStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

export type DamageStatus = 'OPEN' | 'UNDER_REVIEW' | 'CLOSED' | 'DISPUTED';

export type AttendanceStatus = 'OPEN' | 'CLOSED' | 'NEEDS_REVIEW';

export interface Shop {
  id: string;
  name: string;
  code: string;
  timezone: string;
  address?: string | null;
  contactInfo?: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
}

export interface AccountSession {
  id: string;
  username: string;
  isOwner: boolean;
  staffMember?: {
    id: string;
    fullName: string;
    mobile?: string | null;
    address?: string | null;
    profilePhotoPath?: string | null;
    employmentStatus?: string | null;
  } | null;
  shopMemberships: {
    shopId: string;
    shopName: string;
    shopCode: string;
    roleName: string;
    capabilities: string[];
    positionCategory?: string | null;
    joiningDate?: string | null;
    dutyTimingNotes?: string | null;
    monthlySalary?: number | null;
    shiftStartTime?: string | null;
    shiftEndTime?: string | null;
    lateThreshold?: string | null;
    halfDayThreshold?: string | null;
    absentThreshold?: string | null;
    incentiveAmount?: number | null;
    attendanceEnabled?: boolean;
  }[];
}

export interface TaskUnit {
  id: string;
  shopId: string;
  staffMemberId: string;
  taskAssignmentId: string;
  unitType: WorkflowType;
  pieceNumber?: number | null;
  activityTypeId?: string | null;
  activityCode?: string | null;
  sequenceNumber?: number | null;
  orderRef?: string | null;
  status: UnitStatus;
  completedAt?: string | null;
  damageIncidents?: DamageIncident[];
}

export interface TaskAssignment {
  id: string;
  shopId: string;
  staffMemberId: string;
  assignmentDate: string;
  workflowProfileId: string;
  workflowProfile?: {
    workflowType: WorkflowType;
    name: string;
  };
  serviceTypeId?: string | null;
  serviceType?: {
    name: string;
    code: string;
  } | null;
  orderId?: string | null;
  pieceCount?: number | null;
  pickupCount?: number | null;
  selectedActivities: string[];
  notes?: string | null;
  status: 'ACTIVE' | 'CANCELLED' | 'REASSIGNED';
  taskUnits: TaskUnit[];
  damageIncidents?: DamageIncident[];
  createdAt: string;
}

export interface TaskSummary {
  totalUnits?: number;
  completedUnits?: number;
  pendingUnits?: number;
  percentage?: number | null;
  total?: number;
  completed?: number;
  pending?: number;
  percentageComplete?: number | null;
  breakdown?: {
    wash: number;
    dry: number;
    iron: number;
    fold: number;
    pack: number;
    delivery: number;
    pickup: number;
  };
  byActivity?: Record<string, { total: number; completed: number }>;
}

export interface AttendanceSession {
  id: string;
  shopId: string;
  staffMemberId: string;
  checkInAt?: string | null;
  checkInPhotoPath?: string | null;
  checkOutAt?: string | null;
  checkOutPhotoPath?: string | null;
  durationMinutes?: number | null;
  status: AttendanceStatus;
  staffMember?: {
    fullName: string;
  };
}

export interface DamageIncident {
  id: string;
  shopId: string;
  staffMemberId: string;
  taskAssignmentId: string;
  taskUnitId?: string | null;
  pieceNumber?: number | null;
  reportedAt: string;
  status: DamageStatus;
  notes?: string | null;
  photoPath?: string | null;
  staffMember?: {
    fullName: string;
  };
  taskAssignment?: {
    orderId?: string | null;
  };
}

export interface StaffMemberListItem {
  id: string;
  fullName: string;
  mobile?: string | null;
  employmentStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  account?: {
    username: string;
    status: string;
  } | null;
  shopMemberships: {
    shopId: string;
    positionCategory?: { id: string; name: string } | null;
    permissionProfile: { id: string; name: string };
    monthlySalary?: number | null;
    joiningDate?: string | null;
  }[];
}

export interface ServiceType {
  id: string;
  name: string;
  code: string;
  displayOrder: number;
  isActive?: boolean;
  activityMappings: {
    activityType: {
      id: string;
      name: string;
      code: string;
    };
  }[];
}

export interface ActivityType {
  id: string;
  name: string;
  code: string;
  displayOrder: number;
}

export interface WorkflowProfile {
  id: string;
  name: string;
  description?: string | null;
  workflowType: WorkflowType;
  allowedActivities: string[];
}

export interface PositionCategory {
  id: string;
  shopId?: string | null;
  name: string;
  description?: string | null;
  workflowProfileId?: string | null;
  workflowProfile?: {
    id: string;
    name: string;
    workflowType: WorkflowType;
  } | null;
  isActive?: boolean;
}

export interface PermissionProfile {
  id: string;
  name: string;
  description?: string | null;
  capabilities: { id: string; capability: string }[];
  isOwnerOnly?: boolean;
  isSystem?: boolean;
}

export interface CustomFieldDefinition {
  id: string;
  shopId?: string | null;
  key: string;
  label: string;
  helpText?: string | null;
  fieldType: 'TEXT' | 'NUMBER' | 'DATE' | 'FILE_IMAGE' | 'DROPDOWN' | 'YES_NO';
  isRequired: boolean;
  displayOrder: number;
  dropdownOptions: string[];
  isActive: boolean;
  /** Job roles this field applies to. Empty = all staff. */
  positionCategoryIds?: string[];
}

export interface AuditLogItem {
  id: string;
  shopId?: string | null;
  actorAccountId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown> | null;
  requestId?: string | null;
  createdAt: string;
  shop?: { id: string; name: string; code: string } | null;
  actor?: { id: string; username: string } | null;
}

export interface GlobalShopMetrics {
  totalShops: number;
  totalActiveStaff: number;
  todayAttendanceCount: number;
  todayTotalUnits: number;
  todayCompletedUnits: number;
  todayPendingUnits: number;
  activityBreakdown: {
    wash: number;
    dry: number;
    iron: number;
    fold: number;
    pack: number;
    delivery: number;
    pickup: number;
  };
}

export interface PerShopMetrics {
  id: string;
  name: string;
  code: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  address?: string | null;
  staffCount: number;
  todayAttendance: number;
  todayTotalUnits: number;
  todayCompletedUnits: number;
  todayPendingUnits: number;
}
