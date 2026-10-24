'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/api';
import { TaskAssignment, TaskSummary, TaskUnit } from '../../types';
import { ProgressRing } from '../../components/ProgressRing';
import { DamageModal } from '../../components/DamageModal';
import { DamageIncidentViewerModal, DamageIncidentRecord } from '../../components/DamageIncidentViewerModal';
import {
  Calendar, Layers, CheckCircle2, Clock, AlertTriangle, RotateCcw,
  Sparkles, Check, X, TrendingUp, Droplets,
  Wind, ChevronRight, ArrowLeft, BarChart3,
  Award, Star,
} from 'lucide-react';

interface MonthlyStats {
  total: number; completed: number; pending: number; percentageComplete: number | null;
  breakdown?: { wash: number; dry: number; iron: number; fold: number; pack: number; delivery: number; pickup: number };
  dailyProgress?: Array<{ date: string; total: number; completed: number }>;
}

function localDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function WashermanPage() {
  const router = useRouter();
  const { user, activeShopId, activeRole, isLoading: isAuthLoading } = useAuth();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const isWashermanAllowed = useMemo(() => {
    if (!user) return false;
    if (user.isOwner) return true;
    return (activeRole || '').toLowerCase().includes('wash');
  }, [user, activeRole]);

  useEffect(() => {
    if (isAuthLoading || !isMounted) return;
    if (!user) { router.replace('/login'); return; }
    if (!isWashermanAllowed) {
      const r = (activeRole || '').toLowerCase();
      if (r.includes('supervisor')) router.replace('/supervisor');
      else if (r.includes('manager')) router.replace('/manager');
      else if (r.includes('iron')) router.replace('/ironman');
      else if (r.includes('deliver')) router.replace('/delivery');
      else router.replace('/');
    }
  }, [isAuthLoading, isMounted, user, isWashermanAllowed, activeRole, router]);

  type Tab = 'tasks' | 'stats';
  const [activeTab, setActiveTab] = useState<Tab>('tasks');
  const [selectedDate, setSelectedDate] = useState<string>(localDateKey());
  const [assignments, setAssignments] = useState<TaskAssignment[]>([]);
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [isTasksLoading, setIsTasksLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [completingUnitId, setCompletingUnitId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);
  const [monthlySummary, setMonthlySummary] = useState<MonthlyStats | null>(null);
  const [statsMonth, setStatsMonth] = useState<{ year: number; month: number }>(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [damageTarget, setDamageTarget] = useState<{
    taskAssignmentId: string; pieceNumber?: number; orderId?: string;
  } | null>(null);
  const [viewingDamageIncident, setViewingDamageIncident] = useState<DamageIncidentRecord | null>(null);

  const staffMemberId = user?.staffMember?.id;
  const [todayAttendance, setTodayAttendance] = useState<{ id: string; checkInAt: string | null } | null>(null);

  const fetchAttendanceStatus = useCallback(async () => {
    if (!activeShopId) return;
    try {
      const res = await apiRequest<{ session: { id: string; checkInAt: string | null } | null }>(
        `/api/shops/${activeShopId}/attendance/my-session`
      );
      setTodayAttendance(res.session);
    } catch {
      setTodayAttendance(null);
    }
  }, [activeShopId]);

  useEffect(() => {
    fetchAttendanceStatus();
  }, [fetchAttendanceStatus]);

  const hasCheckedInToday = Boolean(todayAttendance?.checkInAt);


  const fetchTasks = useCallback(async (showLoading = true) => {
    if (!activeShopId || !staffMemberId) {
      if (showLoading) setIsTasksLoading(false);
      return;
    }
    if (showLoading && assignments.length === 0) setIsTasksLoading(true);
    lastFetchRef.current = Date.now();
    try {
      const data = await apiRequest<{ assignments: TaskAssignment[]; summary: TaskSummary }>(
        `/api/shops/${activeShopId}/staff/${staffMemberId}/tasks?date=${selectedDate}`
      );
      setAssignments(data.assignments);
      setSummary(data.summary);
    } catch { setAssignments([]); setSummary(null); }
    finally { setIsTasksLoading(false); }
  }, [activeShopId, staffMemberId, selectedDate, assignments.length]);

  const fetchMonthlyStats = useCallback(async () => {
    if (!activeShopId || !staffMemberId) return;
    setIsStatsLoading(true);
    try {
      const data = await apiRequest<MonthlyStats>(
        `/api/shops/${activeShopId}/staff/${staffMemberId}/task-summary/monthly?year=${statsMonth.year}&month=${statsMonth.month}`
      );
      setMonthlySummary(data);
    } catch { setMonthlySummary(null); }
    finally { setIsStatsLoading(false); }
  }, [activeShopId, staffMemberId, statsMonth]);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (activeTab === 'tasks') {
        await Promise.all([
          fetchTasks(false),
          fetchAttendanceStatus(),
        ]);
      } else {
        await fetchMonthlyStats();
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, [activeTab, fetchTasks, fetchAttendanceStatus, fetchMonthlyStats]);

  useEffect(() => {
    if (!isWashermanAllowed || isAuthLoading) return;
    fetchTasks(true);
  }, [fetchTasks, isWashermanAllowed, isAuthLoading]);

  useEffect(() => {
    const handle = () => { if (Date.now() - lastFetchRef.current > 30000) fetchTasks(false); };
    window.addEventListener('focus', handle);
    const vis = () => { if (document.visibilityState === 'visible') handle(); };
    document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('focus', handle); document.removeEventListener('visibilitychange', vis); };
  }, [fetchTasks]);

  useEffect(() => {
    if (activeTab === 'stats' && isWashermanAllowed && !isAuthLoading) fetchMonthlyStats();
  }, [activeTab, fetchMonthlyStats, isWashermanAllowed, isAuthLoading]);



  const handleCompleteUnit = async (unit: TaskUnit) => {
    if (!activeShopId || unit.status === 'COMPLETED' || completingUnitId) return;
    if (selectedDate !== localDateKey()) {
      alert('Tasks can only be marked as completed on their assigned date (today).');
      return;
    }
    if (!hasCheckedInToday) {
      alert('Attendance check-in is required before you can complete tasks today. Please clock in under Attendance first.');
      return;
    }
    setCompletingUnitId(unit.id);
    setAssignments(prev => prev.map(asg => asg.id !== unit.taskAssignmentId ? asg : {
      ...asg, taskUnits: asg.taskUnits.map(u => u.id === unit.id
        ? { ...u, status: 'COMPLETED' as const, completedAt: new Date().toISOString() } : u),
    }));
    setSummary(prev => {
      if (!prev) return prev;
      const ap = prev as unknown as Record<string, number>;
      const cur = prev.completedUnits ?? ap.completed ?? 0;
      const tot = prev.totalUnits ?? ap.total ?? 1;
      const nc = cur + 1; const np = Math.max(0, tot - nc); const pct = Math.min(100, Math.round(nc/tot*100));
      return { ...prev, completedUnits: nc, completed: nc, pendingUnits: np, pending: np, percentage: pct, percentageComplete: pct };
    });
    try {
      await apiRequest(`/api/shops/${activeShopId}/task-units/${unit.id}/complete`, { method: 'PATCH' });
      setSuccessToast('Unit marked complete!');
      setTimeout(() => setSuccessToast(null), 3000);
      fetchTasks(false);
    } catch (err) { fetchTasks(false); alert(err instanceof Error ? err.message : 'Failed.'); }
    finally { setCompletingUnitId(null); }
  };

  const ap2 = summary as unknown as Record<string, number>;
  const totalUnits = summary?.totalUnits ?? ap2?.total ?? 0;
  const completedUnits = summary?.completedUnits ?? ap2?.completed ?? 0;
  const ringPercentage = summary?.percentage ?? ap2?.percentageComplete
    ?? (totalUnits > 0 ? Math.round(completedUnits/totalUnits*100) : null);
  const washCount = summary?.breakdown?.wash ?? 0;
  const dryCount = summary?.breakdown?.dry ?? 0;

  const monthLabel = new Date(statsMonth.year, statsMonth.month-1, 1).toLocaleString('default',{month:'long',year:'numeric'});
  const navigateMonth = (dir: -1|1) => setStatsMonth(p => {
    let m=p.month+dir, y=p.year;
    if(m<1){m=12;y--;} if(m>12){m=1;y++;}
    return {year:y,month:m};
  });

  const membership = user?.shopMemberships?.find(m => m.shopId === activeShopId);

  if (!isMounted || isAuthLoading) return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-brand-lime/20 border border-brand-lime/30 flex items-center justify-center">
        <Droplets className="w-8 h-8 text-brand-forest/40 animate-pulse" />
      </div>
      <p className="text-sm font-semibold text-content-muted">Loading Washerman Station&#x2026;</p>
    </div>
  );
  if (!user || !isWashermanAllowed) return null;

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'tasks', label: 'Wash Tasks', icon: Layers },
    { id: 'stats', label: 'My Stats', icon: BarChart3 },
  ];

  return (
    <div className="space-y-0 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-black text-brand-forest tracking-tight flex items-center gap-2">
            <Droplets className="w-5 h-5 text-brand-lime" />
            Washerman Station
          </h2>
          <p className="text-xs text-content-muted mt-0.5">
            {user.staffMember?.fullName || 'Staff'} &#183; {membership?.shopName || 'Shop'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="p-2 min-w-[38px] min-h-[38px] rounded-xl bg-surface-card border border-border-subtle shadow-clay-sm text-brand-forest hover:bg-surface-hover active:scale-95 flex items-center justify-center transition-all touch-manipulation"
          title="Refresh Station"
          aria-label="Refresh Station"
        >
          <RotateCcw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-brand-forest' : ''}`} />
        </button>
      </div>

      <div className="flex bg-surface-card rounded-2xl border border-border-subtle shadow-clay p-1 mb-5 gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition-all ${activeTab === id ? 'bg-brand-forest text-white shadow-md' : 'text-content-muted hover:text-brand-forest'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-brand-forest">
              Assigned Orders <span className="font-normal text-content-muted">({assignments.length})</span>
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="p-2 min-w-[36px] min-h-[36px] rounded-xl bg-surface-card border border-border-subtle shadow-clay-sm text-content-muted hover:text-brand-forest active:scale-95 flex items-center justify-center transition-all touch-manipulation"
                title="Refresh Orders"
                aria-label="Refresh Orders"
              >
                <RotateCcw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-brand-forest' : ''}`} />
              </button>
              <div className="flex items-center gap-1.5 bg-surface-card px-3 py-1.5 rounded-xl border border-border-subtle shadow-clay-sm">
                <Calendar className="w-3.5 h-3.5 text-brand-forest" />
                <input type="date" value={selectedDate} max={localDateKey()}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="bg-transparent text-xs font-bold text-brand-forest focus:outline-none cursor-pointer" />
              </div>
            </div>
          </div>

          <ProgressRing
            percentage={ringPercentage}
            label="Today's Wash Progress"
            sublabel={totalUnits > 0 ? `${completedUnits} of ${totalUnits} units completed`
              : isTasksLoading ? 'Loading...' : 'No tasks assigned for this date'}
          />

          {(washCount > 0 || dryCount > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-card rounded-2xl border border-border-subtle shadow-clay p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <Droplets className="w-5 h-5 text-blue-600" />
                </div>
                <div><p className="text-[11px] text-content-muted font-semibold">Wash Units</p><p className="text-lg font-black text-brand-forest">{washCount}</p></div>
              </div>
              <div className="bg-surface-card rounded-2xl border border-border-subtle shadow-clay p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-100 flex items-center justify-center shrink-0">
                  <Wind className="w-5 h-5 text-sky-600" />
                </div>
                <div><p className="text-[11px] text-content-muted font-semibold">Dry Units</p><p className="text-lg font-black text-brand-forest">{dryCount}</p></div>
              </div>
            </div>
          )}

          {isTasksLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 animate-pulse">
                  <div className="h-4 w-1/3 bg-border-subtle rounded-lg mb-2" /><div className="h-3 w-1/2 bg-border-subtle rounded-lg" />
                </div>
              ))}
            </div>
          ) : assignments.length === 0 ? (
            <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-surface-cream border border-border-subtle shadow-clay-inset mx-auto flex items-center justify-center text-content-muted mb-3">
                <Layers className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-brand-forest">No Wash Tasks</h4>
              <p className="text-xs text-content-muted mt-1 max-w-xs mx-auto">
                {selectedDate === localDateKey() ? 'No tasks assigned today. Your manager will assign them shortly.' : `No tasks found for ${selectedDate}.`}
              </p>
            </div>
          ) : assignments.map(assignment => {
            const pieceNums = Array.from(new Set(assignment.taskUnits.map(u=>u.pieceNumber).filter(Boolean))).sort((a,b)=>(a as number)-(b as number)) as number[];
            const done = assignment.taskUnits.filter(u=>u.status==='COMPLETED').length;
            const tot = assignment.taskUnits.length;
            const pct = tot>0 ? Math.round(done/tot*100) : 0;
            return (
              <div key={assignment.id} className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-4 sm:p-5">
                <div className="flex items-start justify-between pb-3 border-b border-border-subtle">
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-extrabold text-brand-forest">{assignment.orderId ? `Order #${assignment.orderId}` : 'Wash Assignment'}</span>
                      {assignment.serviceType && <span className="px-2 py-0.5 rounded-lg clay-badge-lime text-[11px] font-bold">{assignment.serviceType.name}</span>}
                    </div>
                    <p className="text-xs text-content-muted mt-0.5">{assignment.pieceCount ? `${assignment.pieceCount} Pieces` : ''}{assignment.notes ? ` • ${assignment.notes}` : ''}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${pct===100 ? 'bg-status-success/15 text-status-success border-status-success/30' : 'bg-surface-cream text-content-muted border-border-subtle'}`}>{done}/{tot}</span>
                    {pct>0 && <div className="w-16 h-1.5 rounded-full bg-border-subtle overflow-hidden"><div className="h-full rounded-full bg-brand-lime" style={{width:`${pct}%`}}/></div>}
                  </div>
                </div>

                {assignment.damageIncidents && assignment.damageIncidents.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border-subtle/80 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-black text-status-danger uppercase tracking-wider">
                      <AlertTriangle className="w-3.5 h-3.5" /><span>Reported Issues ({assignment.damageIncidents.length})</span>
                    </div>
                    {assignment.damageIncidents.map(dmg => (
                      <div key={dmg.id} onClick={() => setViewingDamageIncident(dmg as unknown as DamageIncidentRecord)}
                        className="cursor-pointer p-2.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-red-900">{dmg.pieceNumber ? `Piece #${dmg.pieceNumber}` : 'Incident'}</span>
                        <span className="text-[11px] text-red-700 truncate flex-1 mx-2">{dmg.notes || 'Damage reported'}</span>
                        <ChevronRight className="w-4 h-4 text-red-400 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 space-y-2.5">
                  {pieceNums.map(pieceNum => {
                    const pieceUnits = assignment.taskUnits.filter(u=>u.pieceNumber===pieceNum);
                    const pieceDmg = assignment.damageIncidents?.find(d=>d.pieceNumber===pieceNum)||pieceUnits.flatMap(u=>u.damageIncidents||[]).find(Boolean);
                    return (
                      <div key={pieceNum} className={`rounded-xl p-3 border flex flex-wrap items-center justify-between gap-2 ${pieceDmg ? 'bg-red-50/60 border-red-200' : 'bg-surface-cream/70 border-border-subtle/80'}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="w-6 h-6 rounded-lg bg-surface-card border border-border-subtle flex items-center justify-center text-xs font-bold text-brand-forest shadow-clay-sm">{pieceNum}</div>
                          <span className="text-xs font-bold text-brand-forest">Piece #{pieceNum}</span>
                          {pieceDmg && (
                            <button onClick={() => setViewingDamageIncident(pieceDmg as unknown as DamageIncidentRecord)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-100 text-red-900 text-[10px] font-extrabold border border-red-300">
                              <AlertTriangle className="w-3 h-3 text-red-600" /><span>Damage ({pieceDmg.status})</span>
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {pieceUnits.map(unit => {
                            const isDone = unit.status === 'COMPLETED';
                            const isPending = completingUnitId === unit.id;
                            const isHistoric = selectedDate !== localDateKey();
                            return (
                              <button key={unit.id} onClick={() => handleCompleteUnit(unit)}
                                disabled={isDone || isPending || isHistoric || !hasCheckedInToday}
                                title={isHistoric ? 'Cannot complete tasks for past dates' : !hasCheckedInToday ? 'Attendance check-in required to complete tasks' : isDone ? 'Already done' : `Mark ${unit.activityCode || 'Done'}`}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${isDone ? 'bg-status-success/15 text-status-success border border-status-success/30 cursor-default' : isHistoric ? 'bg-surface-cream text-content-muted border border-border-subtle cursor-not-allowed opacity-60' : 'clay-btn-secondary text-brand-forest hover:border-brand-lime'}`}>
                                {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : isPending ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-brand-lime" />}
                                <span>{unit.activityCode || 'Done'}</span>
                              </button>
                            );
                          })}
                          <button onClick={() => setDamageTarget({ taskAssignmentId: assignment.id, pieceNumber: pieceNum, orderId: assignment.orderId||undefined })}
                            className={`p-1.5 rounded-xl transition-colors ${pieceDmg ? 'bg-red-100 text-red-700 border border-red-300 hover:bg-red-200' : 'text-content-muted hover:text-status-danger hover:bg-status-danger/10'}`}
                            title="Report damage">
                            <AlertTriangle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button onClick={() => navigateMonth(-1)} className="p-2 rounded-xl bg-surface-card border border-border-subtle shadow-clay-sm text-content-muted hover:text-brand-forest transition-colors"><ArrowLeft className="w-4 h-4" /></button>
            <h3 className="text-sm font-black text-brand-forest">{monthLabel}</h3>
            <button onClick={() => navigateMonth(1)} disabled={statsMonth.year===new Date().getFullYear()&&statsMonth.month>=new Date().getMonth()+1}
              className="p-2 rounded-xl bg-surface-card border border-border-subtle shadow-clay-sm text-content-muted hover:text-brand-forest transition-colors disabled:opacity-40 disabled:cursor-not-allowed"><ChevronRight className="w-4 h-4" /></button>
          </div>
          {isStatsLoading ? (
            <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-24 bg-surface-card rounded-2xl border border-border-subtle animate-pulse"/>)}</div>
          ) : !monthlySummary ? (
            <div className="bg-surface-card rounded-clay border border-border-subtle shadow-clay p-8 text-center">
              <TrendingUp className="w-10 h-10 text-content-muted mx-auto mb-3"/>
              <h4 className="text-sm font-bold text-brand-forest">No Data Available</h4>
              <p className="text-xs text-content-muted mt-1">No records for {monthLabel}.</p>
            </div>
          ) : (
            <>
              <div className="bg-gradient-to-br from-brand-forest to-[#1a3623] rounded-2xl p-5 text-white shadow-clay-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-white/70 uppercase tracking-widest mb-1">Monthly Total</p>
                    <p className="text-4xl font-black">{monthlySummary.completed}<span className="text-xl text-white/60">/{monthlySummary.total}</span></p>
                    <p className="text-xs text-white/60 mt-1">units completed</p>
                  </div>
                  <div className="text-right">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-black ${(monthlySummary.percentageComplete??0)>=80 ? 'bg-brand-lime/20 text-brand-lime' : 'bg-white/10 text-white/80'}`}>
                      <Star className="w-4 h-4"/>{monthlySummary.percentageComplete?.toFixed(0)??0}%
                    </div>
                    <p className="text-xs text-white/50 mt-2">{monthlySummary.pending} pending</p>
                  </div>
                </div>
                <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-lime" style={{width:`${monthlySummary.percentageComplete??0}%`}}/>
                </div>
              </div>

              {monthlySummary.breakdown && (
                <div className="bg-surface-card rounded-2xl border border-border-subtle shadow-clay p-4">
                  <h4 className="text-xs font-black text-brand-forest uppercase tracking-widest mb-3">Activity Breakdown</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {([{key:'wash',label:'Wash',Ic:Droplets,bg:'bg-blue-100',c:'text-blue-600'},{key:'dry',label:'Dry',Ic:Wind,bg:'bg-sky-100',c:'text-sky-600'}] as {key:string;label:string;Ic:React.ElementType;bg:string;c:string}[]).map(({key,label,Ic,bg,c})=>{
                      const cnt=(monthlySummary.breakdown as Record<string,number>)[key]??0;
                      return (
                        <div key={key} className="flex items-center gap-3 p-3 rounded-xl bg-surface-cream border border-border-subtle">
                          <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}><Ic className={`w-5 h-5 ${c}`}/></div>
                          <div><p className="text-[11px] text-content-muted font-semibold">{label}</p><p className="text-xl font-black text-brand-forest">{cnt}</p></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="bg-surface-card rounded-2xl border border-border-subtle shadow-clay p-4">
                <h4 className="text-xs font-black text-brand-forest uppercase tracking-widest mb-3">Performance Rating</h4>
                {(() => {
                  const p=monthlySummary.percentageComplete??0;
                  const r=p>=90?{l:'Excellent',c:'text-green-700',bg:'bg-green-100',e:'\u{1F3C6}'}:p>=70?{l:'Good',c:'text-blue-700',bg:'bg-blue-100',e:'\u2B50'}:p>=50?{l:'Average',c:'text-amber-700',bg:'bg-amber-100',e:'\u{1F4C8}'}:{l:'Needs Improvement',c:'text-red-700',bg:'bg-red-100',e:'\u{1F4CB}'};
                  return (
                    <div className={`flex items-center gap-3 p-3 rounded-xl ${r.bg}`}>
                      <span className="text-2xl">{r.e}</span>
                      <div><p className={`text-sm font-black ${r.c}`}>{r.l}</p><p className="text-xs text-content-muted">{p.toFixed(0)}% this month</p></div>
                      <Award className={`w-6 h-6 ml-auto ${r.c}`}/>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      )}



      {damageTarget && (
        <DamageModal isOpen onClose={()=>setDamageTarget(null)} shopId={activeShopId||''} staffMemberId={staffMemberId||''}
          taskAssignmentId={damageTarget.taskAssignmentId} pieceNumber={damageTarget.pieceNumber} orderId={damageTarget.orderId}
          onSuccess={()=>{setSuccessToast('Damage reported!');setTimeout(()=>setSuccessToast(null),4000);fetchTasks();}}/>
      )}
      {viewingDamageIncident && (
        <DamageIncidentViewerModal isOpen onClose={()=>setViewingDamageIncident(null)}
          incident={viewingDamageIncident} shopId={activeShopId||''} canManage={false} onUpdated={()=>fetchTasks(false)}/>
      )}


      {successToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-[#1E4327] text-white rounded-2xl shadow-clay-lg flex items-center gap-2.5 text-xs font-bold animate-fade-in border border-emerald-500/30">
          <div className="w-5 h-5 rounded-full bg-brand-lime text-brand-forest flex items-center justify-center shrink-0"><Check className="w-3.5 h-3.5 stroke-[3]"/></div>
          <span>{successToast}</span>
          <button onClick={()=>setSuccessToast(null)} className="ml-2 text-white/70 hover:text-white"><X className="w-4 h-4"/></button>
        </div>
      )}
    </div>
  );
}
