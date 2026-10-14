/// <reference types="jest" />
/**
 * Unit tests for task unit counting rules (server-authoritative business logic).
 * These tests verify the exact counting formulas from the specification:
 * - PIECE_ACTIVITY (Washerman): 5 pieces × [WASH, DRY] = 10 units
 * - PIECE_ACTIVITY (Ironman): 5 pieces × [IRON, FOLD, PACK] = 15 units
 * - PER_ORDER (Delivery): 1 unit per order regardless of pieces
 * - COUNT_BASED (Pickup): N units from pickup count
 */

// Unit counting logic extracted for pure testing (no DB dependency)

type WorkflowType = 'PIECE_ACTIVITY' | 'PER_ORDER' | 'COUNT_BASED';

interface TaskUnitSpec {
  unitType: WorkflowType;
  pieceNumber?: number;
  activityCode?: string;
  sequenceNumber?: number;
  orderRef?: string;
}

function generateTaskUnits(params: {
  workflowType: WorkflowType;
  pieceCount?: number;
  pickupCount?: number;
  orderId?: string;
  selectedActivities?: string[];
}): TaskUnitSpec[] {
  const units: TaskUnitSpec[] = [];

  switch (params.workflowType) {
    case 'PIECE_ACTIVITY': {
      const pieces = params.pieceCount ?? 0;
      const activities = params.selectedActivities ?? [];
      for (let p = 1; p <= pieces; p++) {
        for (const act of activities) {
          units.push({ unitType: 'PIECE_ACTIVITY', pieceNumber: p, activityCode: act });
        }
      }
      break;
    }
    case 'PER_ORDER': {
      units.push({ unitType: 'PER_ORDER', orderRef: params.orderId });
      break;
    }
    case 'COUNT_BASED': {
      for (let i = 1; i <= (params.pickupCount ?? 0); i++) {
        units.push({ unitType: 'COUNT_BASED', sequenceNumber: i });
      }
      break;
    }
  }

  return units;
}

describe('Task unit counting — specification compliance', () => {
  // ─── Washerman counting ─────────────────────────────────────────────────
  describe('Washerman (PIECE_ACTIVITY — Wash/Dry)', () => {
    test('5 pieces × [WASH, DRY] = 10 units', () => {
      const units = generateTaskUnits({
        workflowType: 'PIECE_ACTIVITY',
        pieceCount: 5,
        selectedActivities: ['WASH', 'DRY'],
      });
      expect(units).toHaveLength(10);
    });

    test('5 pieces × [WASH only] = 5 units', () => {
      const units = generateTaskUnits({
        workflowType: 'PIECE_ACTIVITY',
        pieceCount: 5,
        selectedActivities: ['WASH'],
      });
      expect(units).toHaveLength(5);
    });

    test('3 pieces × [DRY only] = 3 units', () => {
      const units = generateTaskUnits({
        workflowType: 'PIECE_ACTIVITY',
        pieceCount: 3,
        selectedActivities: ['DRY'],
      });
      expect(units).toHaveLength(3);
    });

    test('each piece has both WASH and DRY units', () => {
      const units = generateTaskUnits({
        workflowType: 'PIECE_ACTIVITY',
        pieceCount: 2,
        selectedActivities: ['WASH', 'DRY'],
      });
      expect(units.filter(u => u.pieceNumber === 1 && u.activityCode === 'WASH')).toHaveLength(1);
      expect(units.filter(u => u.pieceNumber === 1 && u.activityCode === 'DRY')).toHaveLength(1);
      expect(units.filter(u => u.pieceNumber === 2 && u.activityCode === 'WASH')).toHaveLength(1);
      expect(units.filter(u => u.pieceNumber === 2 && u.activityCode === 'DRY')).toHaveLength(1);
    });

    test('0 activities = 0 units', () => {
      const units = generateTaskUnits({
        workflowType: 'PIECE_ACTIVITY',
        pieceCount: 5,
        selectedActivities: [],
      });
      expect(units).toHaveLength(0);
    });
  });

  // ─── Ironman counting ───────────────────────────────────────────────────
  describe('Ironman (PIECE_ACTIVITY — Iron/Fold/Pack)', () => {
    test('5 pieces × [IRON, FOLD, PACK] = 15 units', () => {
      const units = generateTaskUnits({
        workflowType: 'PIECE_ACTIVITY',
        pieceCount: 5,
        selectedActivities: ['IRON', 'FOLD', 'PACK'],
      });
      expect(units).toHaveLength(15);
    });

    test('5 pieces × [IRON, FOLD] = 10 units', () => {
      const units = generateTaskUnits({
        workflowType: 'PIECE_ACTIVITY',
        pieceCount: 5,
        selectedActivities: ['IRON', 'FOLD'],
      });
      expect(units).toHaveLength(10);
    });

    test('completing IRON does not complete FOLD or PACK (independent units)', () => {
      const units = generateTaskUnits({
        workflowType: 'PIECE_ACTIVITY',
        pieceCount: 1,
        selectedActivities: ['IRON', 'FOLD', 'PACK'],
      });
      // 3 separate unit specs; completing one doesn't affect others
      expect(units.map(u => u.activityCode)).toEqual(['IRON', 'FOLD', 'PACK']);
    });
  });

  // ─── Delivery counting ──────────────────────────────────────────────────
  describe('Delivery Boy (PER_ORDER)', () => {
    test('1 delivery order = 1 unit regardless of piece count', () => {
      const units = generateTaskUnits({
        workflowType: 'PER_ORDER',
        orderId: 'ORD-001',
        pieceCount: 50, // piece count does NOT multiply units
      });
      expect(units).toHaveLength(1);
    });

    test('delivery unit carries the order reference', () => {
      const units = generateTaskUnits({
        workflowType: 'PER_ORDER',
        orderId: 'ORD-XYZ',
      });
      expect(units[0]?.orderRef).toBe('ORD-XYZ');
    });
  });

  // ─── Pickup counting ────────────────────────────────────────────────────
  describe('Pickup (COUNT_BASED)', () => {
    test('Pickup Count 5 = 5 independently completable units', () => {
      const units = generateTaskUnits({
        workflowType: 'COUNT_BASED',
        pickupCount: 5,
      });
      expect(units).toHaveLength(5);
    });

    test('Pickup Count 1 = 1 unit', () => {
      const units = generateTaskUnits({
        workflowType: 'COUNT_BASED',
        pickupCount: 1,
      });
      expect(units).toHaveLength(1);
    });

    test('pickup units have sequential numbers 1..N', () => {
      const units = generateTaskUnits({
        workflowType: 'COUNT_BASED',
        pickupCount: 3,
      });
      expect(units.map(u => u.sequenceNumber)).toEqual([1, 2, 3]);
    });

    test('pickup units have no order reference or piece count', () => {
      const units = generateTaskUnits({
        workflowType: 'COUNT_BASED',
        pickupCount: 2,
      });
      units.forEach(u => {
        expect(u.orderRef).toBeUndefined();
        expect(u.pieceNumber).toBeUndefined();
      });
    });
  });

  // ─── Completion percentage ──────────────────────────────────────────────
  describe('Completion percentage calculation', () => {
    function calculatePercentage(completed: number, total: number): number | null {
      if (total === 0) return null;
      return Math.round((completed / total) * 100);
    }

    test('5/10 completed = 50%', () => expect(calculatePercentage(5, 10)).toBe(50));
    test('10/10 completed = 100%', () => expect(calculatePercentage(10, 10)).toBe(100));
    test('0/10 completed = 0%', () => expect(calculatePercentage(0, 10)).toBe(0));
    test('0/0 (no tasks) = null (shown as "No tasks assigned")', () => {
      expect(calculatePercentage(0, 0)).toBeNull();
    });
  });
});
