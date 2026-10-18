'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { Shop, AuditLogItem } from '../../types';
import { FileText, RefreshCw } from 'lucide-react';

/** Plain-English names for audit actions recorded by the backend. */
const ACTION_LABEL: Record<string, string> = {
  'shop.created': 'Shop added',
  'shop.updated': 'Shop details changed',
  'shop.archived': 'Shop archived',
  'shop.deleted': 'Shop deleted',
  'staff.created': 'Staff added',
  'staff.updated': 'Staff details changed',
  'staff.password_reset': 'Password reset',
  'staff.archived': 'Staff removed',
  'staff.attendance_enabled': 'Attendance tracking turned on',
  'staff.attendance_disabled': 'Attendance tracking turned off',
  'staff.custom_fields_updated': 'Extra details updated',
  'attendance.marked_present': 'Marked present',
  'attendance.marked_check_out': 'Marked checked out',
  'attendance.marked_half_day': 'Marked half day',
  'attendance.marked_absent': 'Marked absent',
  'custom_field.created': 'Custom field added',
  'custom_field.updated': 'Custom field changed',
  'custom_field.deleted': 'Custom field deleted',
  'position_category.created': 'Job role added',
  'position_category.updated': 'Job role changed',
  'position_category.deactivated': 'Job role removed',
  'service_type.created': 'Service added',
  'service_type.updated': 'Service changed',
  'service_type.enabled': 'Service turned on',
  'service_type.disabled': 'Service turned off',
  'permission_profile.created': 'Access level added',
  'permission_profile.updated': 'Access level changed',
};

function prettyAction(action: string) {
  return ACTION_LABEL[action] || action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Short human summary from the metadata the backend stored. */
function summarize(meta: AuditLogItem['metadata']): string {
  if (!meta) return '';
  const m = meta as Record<string, unknown>;
  const parts: string[] = [];
  const pick = (k: string) => (typeof m[k] === 'string' || typeof m[k] === 'number' ? String(m[k]) : null);
  const name = pick('fullName') || pick('staffName') || pick('name') || pick('label');
  if (name) parts.push(name);
  const role = pick('role') || pick('position');
  if (role) parts.push(role);
  const username = pick('username');
  if (username) parts.push(`@${username}`);
  const code = pick('code') || pick('key');
  if (code && !name?.includes(code)) parts.push(code);
  const date = pick('date');
  if (date) parts.push(date);
  const status = pick('status');
  if (status) parts.push(status);
  return parts.join(' · ');
}

interface Props {
  shops: Shop[];
}

const PAGE_SIZE = 50;

export function AuditLogPanel({ shops }: Props) {
  const [shopId, setShopId] = useState('');
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(
    async (nextPage = 1) => {
      setIsLoading(true);
      try {
        const qs = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(nextPage) });
        if (shopId) qs.set('shopId', shopId);
        const res = await apiRequest<{ logs: AuditLogItem[]; total: number }>(`/api/config/audit-logs?${qs.toString()}`);
        setLogs((prev) => (nextPage === 1 ? res.logs || [] : [...prev, ...(res.logs || [])]));
        setTotal(res.total || 0);
        setPage(nextPage);
      } catch {
        if (nextPage === 1) setLogs([]);
      } finally {
        setIsLoading(false);
      }
    },
    [shopId]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border-subtle pb-3">
        <div>
          <h2 className="text-base font-extrabold text-brand-forest">Activity History (Audit Log)</h2>
          <p className="text-xs text-content-muted">Who changed what and when — staff added, passwords reset, attendance marked, settings changed</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl bg-surface-cream border border-border-subtle font-bold text-brand-forest"
          >
            <option value="">All shops</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            onClick={() => load(1)}
            className="p-2 rounded-xl bg-surface-cream border border-border-subtle text-brand-forest hover:bg-surface-hover"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading && logs.length === 0 ? (
        <div className="py-12 text-center text-xs text-content-muted font-semibold">Loading activity…</div>
      ) : logs.length === 0 ? (
        <div className="py-12 text-center text-xs text-content-muted space-y-1">
          <FileText className="w-8 h-8 text-content-muted mx-auto" />
          <p className="font-bold text-brand-forest">No activity recorded yet</p>
          <p>From now on, adding staff, resetting passwords, marking attendance and changing settings will show here.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border-subtle text-content-muted text-[11px] uppercase tracking-wider font-extrabold">
                  <th className="py-2.5 px-3">When</th>
                  <th className="py-2.5 px-3">What happened</th>
                  <th className="py-2.5 px-3">Details</th>
                  <th className="py-2.5 px-3">Done by</th>
                  <th className="py-2.5 px-3">Shop</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-cream/50 transition-colors">
                    <td className="py-2.5 px-3 whitespace-nowrap text-content-muted font-mono text-[11px]">
                      {new Date(log.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-brand-forest/10 text-brand-forest" title={log.action}>
                        {prettyAction(log.action)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-brand-forest font-medium max-w-[260px] truncate" title={summarize(log.metadata)}>
                      {summarize(log.metadata) || '—'}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap font-medium text-content-muted">{log.actor?.username || 'System'}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-content-muted">{log.shop?.name || 'All shops'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-[11px] text-content-muted">
            <span>Showing {logs.length} of {total}</span>
            {logs.length < total && (
              <button onClick={() => load(page + 1)} disabled={isLoading} className="px-3 py-1.5 rounded-xl bg-surface-cream border border-border-subtle font-bold text-brand-forest">
                {isLoading ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
