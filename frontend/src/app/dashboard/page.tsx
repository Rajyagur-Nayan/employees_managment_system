"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  ArrowRight,
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Monitor,
  Eye,
  Calendar,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { getLiveTracking, getWorkstations } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

interface EmployeeTrackingItem {
  employee_id: string;
  employee_name: string;
  department: string;
  assigned_workstation: string;
  workstation_id: number | null;
  shift: string;
  shift_timing: string;
  attendance_status: "PRESENT" | "ABSENT";
  attendance_time: string | null;
  workstation_status: "Working" | "Away" | "Absent" | "Not Started";
  today_working_time: string;
  today_working_seconds: number;
  last_active_time: string;
  entry_time: string;
  exit_time: string;
}

interface DashboardSummary {
  total_employees: number;
  present_today: number;
  absent_today: number;
  currently_working: number;
  currently_away: number;
  not_started: number;
  total_workstation_seconds: number;
  total_workstation_hours: string;
}

function formatSecondsHms(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function DashboardOverview() {
  const [summary, setSummary] = useState<DashboardSummary>({
    total_employees: 0,
    present_today: 0,
    absent_today: 0,
    currently_working: 0,
    currently_away: 0,
    not_started: 0,
    total_workstation_seconds: 0,
    total_workstation_hours: "0m",
  });
  const [trackingList, setTrackingList] = useState<EmployeeTrackingItem[]>([]);
  const [workstations, setWorkstations] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [mounted, setMounted] = useState<boolean>(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedShift, setSelectedShift] = useState<string>("ALL");
  const [selectedWs, setSelectedWs] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  const { status: wsStatus, lastMessage } = useWebSocket();

  useEffect(() => {
    setMounted(true);
    setSelectedDate(format(new Date(), "yyyy-MM-dd"));
  }, []);

  // Fetch workstations for filter dropdown
  useEffect(() => {
    getWorkstations().then(setWorkstations).catch(() => {});
  }, []);

  // Fetch tracking data from backend
  const fetchTracking = async (showLoading: boolean = false) => {
    if (showLoading) setLoading(true);
    const dateQuery = selectedDate || format(new Date(), "yyyy-MM-dd");
    try {
      const data = await getLiveTracking({
        date: dateQuery,
        shift: selectedShift !== "ALL" ? selectedShift : undefined,
        workstation_id: selectedWs !== "ALL" ? Number(selectedWs) : undefined,
        status: selectedStatus !== "ALL" ? selectedStatus : undefined,
      });

      if (data?.summary) {
        setSummary(data.summary);
      }
      if (Array.isArray(data?.employees)) {
        setTrackingList(data.employees);
      }
      setBackendOnline(true);
    } catch (err: any) {
      setBackendOnline(false);
      if (showLoading) {
        console.warn("Live tracking notice: backend is unreachable at http://127.0.0.1:8000");
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Initial and on filter change
  useEffect(() => {
    if (mounted) {
      fetchTracking(true);
    }
  }, [mounted, selectedDate, selectedShift, selectedWs, selectedStatus]);

  // Periodic polling every 5s for backend truth
  useEffect(() => {
    if (!mounted) return;
    const timer = setInterval(() => {
      fetchTracking(false);
    }, 5000);
    return () => clearInterval(timer);
  }, [mounted, selectedDate, selectedShift, selectedWs, selectedStatus]);

  // Live client-side ticking every 1 second for active "Working" employees
  useEffect(() => {
    const ticker = setInterval(() => {
      setTrackingList((prev) =>
        prev.map((emp) => {
          if (emp.workstation_status === "Working") {
            const nextSec = emp.today_working_seconds + 1;
            return {
              ...emp,
              today_working_seconds: nextSec,
              today_working_time: formatSecondsHms(nextSec),
            };
          }
          return emp;
        })
      );
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  // Listen to WebSocket events to update immediately
  useEffect(() => {
    if (lastMessage?.type === "attendance" || lastMessage?.type === "telemetry") {
      fetchTracking(false);
    }
  }, [lastMessage]);

  // Client search filter
  const filteredList = trackingList.filter((emp) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      emp.employee_name.toLowerCase().includes(q) ||
      emp.employee_id.toLowerCase().includes(q) ||
      emp.assigned_workstation.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            Workstation & Attendance Dashboard
          </h1>
          <p className="text-sm text-[#666666] mt-0.5">
            Real-time multi-employee active tracking, verified check-ins, and workstation presence
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/dashboard/live">
            <Button variant="outline" className="bg-white border-[#E5E7EB] text-[#111111] hover:bg-neutral-100 text-xs font-semibold shadow-xs">
              <Activity className="w-3.5 h-3.5 mr-1.5 text-[#111111]" /> Live Attendance
            </Button>
          </Link>
          <Link href="/dashboard/workstations">
            <Button className="bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold shadow-xs">
              <Monitor className="w-3.5 h-3.5 mr-1.5" /> Workstation Camera
            </Button>
          </Link>
        </div>
      </div>

      {/* Backend Offline Indicator Banner */}
      {backendOnline === false && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-amber-50/90 border border-amber-200/90 rounded-xl text-amber-900 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-xs">
              <span className="font-bold">Backend Server Offline:</span>{" "}
              FastAPI is not reachable at <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 text-amber-800">http://127.0.0.1:8000</code>. Start the backend with <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-amber-200 text-amber-800">uvicorn api.main:app --reload</code> to stream live data.
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchTracking(true)}
            className="h-7 text-xs border-amber-300 text-amber-800 bg-white hover:bg-amber-100/60 self-start sm:self-center"
          >
            Retry Connection
          </Button>
        </div>
      )}

      {/* 5 Core Top Stat Cards (Clean White Theme) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Card 1: Total Employees */}
        <Card className="bg-white border-[#E5E7EB] shadow-xs hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#666666]">
              Total Employees
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
              <Users className="w-4 h-4 text-[#111111]" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-[#111111]">{summary.total_employees}</div>
            <p className="text-xs text-[#666666] mt-1">Active enrolled roster</p>
          </CardContent>
        </Card>

        {/* Card 2: Present Employees */}
        <Card className="bg-white border-[#E5E7EB] shadow-xs hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#666666]">
              Present Today
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-emerald-600">{summary.present_today}</div>
            <p className="text-xs text-[#666666] mt-1">Verified check-ins</p>
          </CardContent>
        </Card>

        {/* Card 3: Absent Employees */}
        <Card className="bg-white border-[#E5E7EB] shadow-xs hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#666666]">
              Absent Today
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-rose-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-rose-600">{summary.absent_today}</div>
            <p className="text-xs text-[#666666] mt-1">Not checked in</p>
          </CardContent>
        </Card>

        {/* Card 4: Currently Working */}
        <Card className="bg-white border-[#E5E7EB] shadow-xs hover:shadow-sm transition-shadow border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#666666]">
              Currently Working
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-[#111111]">{summary.currently_working}</div>
            <p className="text-xs text-emerald-600 font-medium mt-1">
              Active at workstations
            </p>
          </CardContent>
        </Card>

        {/* Card 5: Total Workstation Hours */}
        <Card className="bg-white border-[#E5E7EB] shadow-xs hover:shadow-sm transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#666666]">
              Workstation Hours
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
              <Clock className="w-4 h-4 text-[#111111]" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-[#111111] font-mono">
              {summary.total_workstation_hours}
            </div>
            <p className="text-xs text-[#666666] mt-1">Actual active presence</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Multi-Employee Tracking Table Card */}
      <Card className="bg-white border-[#E5E7EB] shadow-xs overflow-hidden">
        <CardHeader className="p-5 border-b border-[#E5E7EB] bg-white">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold text-[#111111] flex items-center gap-2">
                <Users className="w-5 h-5 text-[#111111]" /> Live Employee Tracking Table
              </CardTitle>
              <CardDescription className="text-xs text-[#666666] mt-0.5">
                Independent workstation presence timers, attendance eligibility check, and active working statuses
              </CardDescription>
            </div>

            {/* Filter Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search Bar */}
              <div className="relative w-44 sm:w-56">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
                <Input
                  placeholder="Search employee..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs bg-neutral-50 border-[#E5E7EB] text-[#111111] placeholder:text-neutral-400 focus:bg-white focus:border-[#111111]"
                />
              </div>

              {/* Date Filter */}
              <div className="flex items-center gap-1.5 bg-neutral-50 border border-[#E5E7EB] rounded-md px-2 py-1 text-xs">
                <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-[#111111] text-xs font-medium focus:outline-none"
                />
              </div>

              {/* Shift Filter */}
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value)}
                className="h-8 px-2.5 text-xs bg-neutral-50 border border-[#E5E7EB] rounded-md text-[#111111] focus:outline-none focus:border-[#111111] focus:bg-white font-medium"
              >
                <option value="ALL">All Shifts</option>
                <option value="General Shift">General Shift</option>
                <option value="Morning Shift">Morning Shift</option>
                <option value="Day Shift">Day Shift</option>
                <option value="Night Shift">Night Shift</option>
              </select>

              {/* Workstation Filter */}
              <select
                value={selectedWs}
                onChange={(e) => setSelectedWs(e.target.value)}
                className="h-8 px-2.5 text-xs bg-neutral-50 border border-[#E5E7EB] rounded-md text-[#111111] focus:outline-none focus:border-[#111111] focus:bg-white font-medium"
              >
                <option value="ALL">All Workstations</option>
                {workstations.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} - {w.name}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="h-8 px-2.5 text-xs bg-neutral-50 border border-[#E5E7EB] rounded-md text-[#111111] focus:outline-none focus:border-[#111111] focus:bg-white font-medium"
              >
                <option value="ALL">All Statuses</option>
                <option value="Working">Working (Green)</option>
                <option value="Away">Away (Orange)</option>
                <option value="Absent">Absent (Red)</option>
                <option value="Not Started">Not Started (Gray)</option>
              </select>

              {/* Refresh Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchTracking(true)}
                className="h-8 px-2.5 bg-white border-[#E5E7EB] text-[#111111] hover:bg-neutral-100"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-neutral-50 border-b border-[#E5E7EB]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Employee</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Employee ID</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Assigned Workstation</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Shift</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Attendance</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Workstation Status</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Today&apos;s Working Time</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Last Active Time</TableHead>
                <TableHead className="text-right font-semibold text-[#111111] text-xs py-3 pr-4">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#E5E7EB] bg-white">
              {loading && filteredList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-[#666666] text-sm">
                    Loading live employee tracking data...
                  </TableCell>
                </TableRow>
              ) : filteredList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-[#666666] text-sm">
                    No employees matched the selected filter criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredList.map((emp) => {
                  return (
                    <TableRow key={emp.employee_id} className="hover:bg-neutral-50 transition-colors">
                      {/* 1. Employee Name & Avatar */}
                      <TableCell className="font-medium text-[#111111] py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-neutral-100 text-[#111111] flex items-center justify-center font-bold text-xs border border-[#E5E7EB]">
                            {emp.employee_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[#111111]">{emp.employee_name}</p>
                            <span className="text-[11px] text-[#666666]">{emp.department}</span>
                          </div>
                        </div>
                      </TableCell>

                      {/* 2. Employee ID */}
                      <TableCell className="font-mono text-xs text-[#666666]">
                        {emp.employee_id}
                      </TableCell>

                      {/* 3. Assigned Workstation */}
                      <TableCell className="text-xs text-[#111111] font-medium">
                        {emp.assigned_workstation}
                      </TableCell>

                      {/* 4. Shift */}
                      <TableCell>
                        <span className="text-xs text-[#111111] font-medium block">
                          {emp.shift}
                        </span>
                        <span className="text-[10px] text-[#666666] block font-mono">
                          {emp.shift_timing}
                        </span>
                      </TableCell>

                      {/* 5. Attendance Status */}
                      <TableCell>
                        {emp.attendance_status === "PRESENT" ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 w-fit">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Present
                            </span>
                            {emp.attendance_time && (
                              <span className="text-[10px] text-[#666666] mt-0.5 font-mono">
                                In: {emp.attendance_time}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 w-fit">
                            <XCircle className="w-3.5 h-3.5 text-rose-600" /> Absent
                          </span>
                        )}
                      </TableCell>

                      {/* 6. Workstation Status (Green: Working, Orange: Away, Red: Absent, Gray: Not Started) */}
                      <TableCell>
                        {emp.workstation_status === "Working" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            Working
                          </span>
                        ) : emp.workstation_status === "Away" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            Away
                          </span>
                        ) : emp.workstation_status === "Absent" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                            Absent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-[#666666] border border-neutral-200">
                            <span className="w-2 h-2 rounded-full bg-neutral-400"></span>
                            Not Started
                          </span>
                        )}
                      </TableCell>

                      {/* 7. Today's Working Time */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono text-sm font-bold ${
                              emp.workstation_status === "Working"
                                ? "text-emerald-600"
                                : emp.today_working_seconds > 0
                                ? "text-[#111111]"
                                : "text-neutral-400"
                            }`}
                          >
                            {emp.today_working_time}
                          </span>
                          {emp.workstation_status === "Working" && (
                            <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 rounded animate-pulse font-medium">
                              LIVE
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* 8. Last Active Time */}
                      <TableCell className="text-xs font-mono text-[#666666]">
                        {emp.last_active_time}
                      </TableCell>

                      {/* 9. Action */}
                      <TableCell className="text-right pr-4">
                        <Link href={`/dashboard/employees/${emp.employee_id}`}>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-[#666666] hover:text-[#111111]">
                            <Eye className="w-3.5 h-3.5 mr-1" /> View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Secondary Row: Telemetry Health + Summary Notes */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Anti-spoofing & Precision Engine */}
        <Card className="bg-white border-[#E5E7EB] shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-[#111111] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> AI Attendance Engine
            </CardTitle>
            <CardDescription className="text-xs text-[#666666]">
              YOLOv8 Face Detection, DeepSORT, and FaceNet Recognition
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-50 border border-[#E5E7EB]">
              <span className="text-xs text-[#666666] font-medium">Attendance Policy</span>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                1 Check-in / Day
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-50 border border-[#E5E7EB]">
              <span className="text-xs text-[#666666] font-medium">Timer Eligibility</span>
              <span className="text-xs font-semibold text-[#111111] bg-neutral-100 px-2 py-0.5 rounded border border-[#E5E7EB]">
                Requires Attendance
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-50 border border-[#E5E7EB]">
              <span className="text-xs text-[#666666] font-medium">Configurable Absence Threshold</span>
              <span className="text-xs font-mono text-[#111111]">15m (Default)</span>
            </div>
          </CardContent>
        </Card>

        {/* Workstation Timer Rule Card */}
        <Card className="bg-white border-[#E5E7EB] shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-[#111111] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#111111]" /> Time Tracking Rules
            </CardTitle>
            <CardDescription className="text-xs text-[#666666]">
              Absence deduction and discrete presence accumulation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-[#666666]">
            <p className="flex items-start gap-2">
              <span className="font-bold text-[#111111]">•</span>
              <span><strong>Attendance Duration:</strong> Time between initial verified check-in and shift completion.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="font-bold text-[#111111]">•</span>
              <span><strong>Workstation Duration:</strong> Actual sum of discrete presence intervals at assigned station.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="font-bold text-[#111111]">•</span>
              <span>Absences are never counted as working time; timers pause automatically when away.</span>
            </p>
          </CardContent>
        </Card>

        {/* System Telemetry & Link Status */}
        <Card className="bg-white border-[#E5E7EB] shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-[#111111] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#111111]" /> System Connectivity
            </CardTitle>
            <CardDescription className="text-xs text-[#666666]">
              Live WebSocket and hardware telemetry
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-50 border border-[#E5E7EB]">
              <span className="text-xs text-[#666666] font-medium">WebSocket Telemetry</span>
              <div className="flex items-center gap-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    mounted && wsStatus === "connected" ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
                <span className="text-xs font-semibold text-[#111111] uppercase" suppressHydrationWarning>
                  {mounted ? wsStatus : "disconnected"}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-50 border border-[#E5E7EB]">
              <span className="text-xs text-[#666666] font-medium">Database Connection</span>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                PostgreSQL (Neon)
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-50 border border-[#E5E7EB]">
              <span className="text-xs text-[#666666] font-medium">Timezone Reference</span>
              <span className="text-xs font-mono text-[#111111]">Asia/Kolkata (IST UTC+5:30)</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
