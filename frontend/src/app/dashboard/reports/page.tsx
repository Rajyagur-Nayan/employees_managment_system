"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  FileText,
  Filter,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Briefcase,
  Moon,
  Sun,
  User,
  MapPin,
  Calendar,
} from "lucide-react";
import { getDailyReport, getWorkstations, getShifts } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ReportsPage() {
  const [reportData, setReportData] = useState<any>({
    date: "",
    total_employees: 0,
    present_count: 0,
    total_workstation_hours: "0m",
    records: [],
  });
  const [workstations, setWorkstations] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedShift, setSelectedShift] = useState<string>("ALL");
  const [selectedWs, setSelectedWs] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    const today = format(new Date(), "yyyy-MM-dd");
    setSelectedDate(today);
    getWorkstations().then(setWorkstations).catch(() => {});
    getShifts().then(setShifts).catch(() => {});
  }, []);

  const loadReport = async () => {
    setLoading(true);
    const dateQuery = selectedDate || format(new Date(), "yyyy-MM-dd");
    try {
      const data = await getDailyReport({
        date: dateQuery,
        shift: selectedShift !== "ALL" ? selectedShift : undefined,
        workstation_id: selectedWs !== "ALL" ? Number(selectedWs) : undefined,
      });
      setReportData(data || { records: [] });
    } catch (err: any) {
      console.warn("Reports load notice:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mounted && selectedDate) {
      loadReport();
    }
  }, [mounted, selectedDate, selectedShift, selectedWs]);

  const filteredRecords = (reportData?.records || []).filter((r: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.employee_name?.toLowerCase().includes(q) ||
      r.employee_id?.toLowerCase().includes(q) ||
      r.assigned_shift?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111] flex items-center gap-2">
            <FileText className="w-6 h-6 text-[#111111]" /> Day-Wise & Shift-Wise Workstation Reports
          </h1>
          <p className="text-sm text-[#666666] mt-0.5">
            Accurate daily workstation time measurement adhering strictly to individual employee shift assignments
          </p>
        </div>

        <Button
          onClick={loadReport}
          disabled={loading}
          variant="outline"
          size="sm"
          className="border-[#E5E7EB] bg-white text-[#111111] hover:bg-neutral-100 flex items-center gap-2 text-xs font-semibold shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh Report
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white border-[#E5E7EB] shadow-xs p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-[#666666] font-semibold">Report Date</span>
            <Calendar className="w-4 h-4 text-[#666666]" />
          </div>
          <div className="text-2xl font-extrabold text-[#111111] mt-2 font-mono">{reportData?.date || selectedDate}</div>
          <p className="text-xs text-[#666666] mt-1">Configured shift working day</p>
        </Card>

        <Card className="bg-white border-[#E5E7EB] shadow-xs p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-[#666666] font-semibold">Total Roster</span>
            <User className="w-4 h-4 text-[#666666]" />
          </div>
          <div className="text-2xl font-extrabold text-[#111111] mt-2">{reportData?.total_employees || 0}</div>
          <p className="text-xs text-[#666666] mt-1">Active scheduled workforce</p>
        </Card>

        <Card className="bg-white border-[#E5E7EB] shadow-xs p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-emerald-800 font-semibold">Verified Check-Ins</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-800 mt-2">{reportData?.present_count || 0}</div>
          <p className="text-xs text-emerald-700 mt-1">Attendance confirmed present</p>
        </Card>

        <Card className="bg-white border-[#E5E7EB] shadow-xs p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-[#666666] font-semibold">Cumulative Working Time</span>
            <Clock className="w-4 h-4 text-[#111111]" />
          </div>
          <div className="text-2xl font-extrabold text-[#111111] mt-2 font-mono">{reportData?.total_workstation_hours || "0m"}</div>
          <p className="text-xs text-[#666666] mt-1">Sum of verified workstation intervals</p>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="bg-white border-[#E5E7EB] shadow-xs p-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="w-full sm:w-64">
              <Input
                placeholder="Search employee..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white border-[#E5E7EB] text-[#111111] text-xs h-9 shadow-xs"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[#666666]">Date:</span>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-white border-[#E5E7EB] text-[#111111] text-xs h-9 w-auto shadow-xs"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[#666666]">Shift:</span>
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value)}
                className="bg-white border border-[#E5E7EB] rounded-md px-3 py-1.5 text-xs text-[#111111] font-medium h-9 focus:outline-none"
              >
                <option value="ALL">All Shifts</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.shift_name}>
                    {s.shift_name} ({s.timing})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[#666666]">Position:</span>
              <select
                value={selectedWs}
                onChange={(e) => setSelectedWs(e.target.value)}
                className="bg-white border border-[#E5E7EB] rounded-md px-3 py-1.5 text-xs text-[#111111] font-medium h-9 focus:outline-none"
              >
                <option value="ALL">All Workstations</option>
                {workstations.map((w) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* Reports Table */}
      <Card className="bg-white border-[#E5E7EB] shadow-xs overflow-hidden">
        <CardHeader className="py-4 px-6 border-b border-[#E5E7EB] bg-white">
          <CardTitle className="text-base font-bold text-[#111111]">Employee Shift Tracking Records</CardTitle>
          <CardDescription className="text-xs text-[#666666]">
            Night shifts crossing midnight are computed as a single continuous work shift. Workstation time strictly stops at shift end.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-neutral-50 border-b border-[#E5E7EB]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Employee</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Assigned Shift</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Shift Window</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Attendance</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Check-In Time</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Workstation Time</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Away Time</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3 text-center">Sessions</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3 text-right pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#E5E7EB] bg-white">
              {!mounted || loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-[#666666] text-xs">
                    Loading shift records...
                  </TableCell>
                </TableRow>
              ) : filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-[#666666] text-xs">
                    No workstation tracking records found for this shift date.
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecords.map((r: any) => (
                  <TableRow key={r.employee_id} className="hover:bg-neutral-50 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-neutral-100 border border-[#E5E7EB] text-[#111111] flex items-center justify-center font-bold text-xs">
                          {r.employee_name ? r.employee_name.charAt(0).toUpperCase() : "E"}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-[#111111]">{r.employee_name}</div>
                          <div className="text-[11px] font-mono text-[#666666]">{r.employee_id} • {r.department}</div>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111111]">
                        {r.is_night_shift ? (
                          <Moon className="w-3.5 h-3.5 text-indigo-600" />
                        ) : (
                          <Sun className="w-3.5 h-3.5 text-amber-500" />
                        )}
                        <span>{r.assigned_shift}</span>
                      </div>
                      <span className="text-[11px] text-[#666666] flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-[#666666]" /> {r.assigned_workstation}
                      </span>
                    </TableCell>

                    <TableCell className="font-mono text-xs text-[#111111]">
                      {r.shift_start} - {r.shift_end}
                      {r.is_night_shift && (
                        <span className="block text-[10px] text-indigo-600 font-semibold">(Crosses Midnight)</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {r.attendance_status === "PRESENT" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> PRESENT
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                          <XCircle className="w-3 h-3" /> ABSENT
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="font-mono text-xs text-[#666666]">
                      {r.attendance_time}
                    </TableCell>

                    <TableCell>
                      <span className="font-mono font-bold text-xs text-[#111111] bg-neutral-100 px-2 py-0.5 rounded border border-[#E5E7EB]">
                        {r.total_workstation_time}
                      </span>
                    </TableCell>

                    <TableCell className="font-mono text-xs text-[#666666]">
                      {r.total_away_time}
                    </TableCell>

                    <TableCell className="text-center font-mono text-xs text-[#111111] font-semibold">
                      {r.session_count}
                    </TableCell>

                    <TableCell className="text-right pr-6">
                      {r.current_status === "Working" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> Working
                        </span>
                      )}
                      {r.current_status === "Away" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span> Away
                        </span>
                      )}
                      {r.current_status === "Absent" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span> Absent
                        </span>
                      )}
                      {r.current_status === "Not Started" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-[#666666] border border-[#E5E7EB]">
                          Not Started
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
