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
    profilePhotoPath?: string | null;
  } | null;
  shopMemberships: {
    shopId: string;
    shopName: string;
    shopCode: string;
    roleName: string;
    capabilities: string[];
    positionCategory?: string | null;
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
  createdAt: string;
}

export interface TaskSummary {
  totalUnits: number;
  completedUnits: number;
  pendingUnits: number;
  percentage: number | null;
  byActivity: Record<string, { total: number; completed: number }>;
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
}

export interface PermissionProfile {
  id: string;
  name: string;
  description?: string | null;
  capabilities: { id: string; capability: string }[];
}
