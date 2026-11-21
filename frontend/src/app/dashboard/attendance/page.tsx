"use client";

import { useEffect, useState } from "react";
import { getAttendance, getEmployees, manualAttendanceCheckIn } from "@/lib/api";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Search,
  Plus,
  RefreshCw,
  UserCheck,
  Clock,
  User,
} from "lucide-react";
import { toast } from "sonner";

export default function AttendancePage() {
  const [records, setRecords] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [dateFilterType, setDateFilterType] = useState<"today" | "all" | "custom">("today");
  const [loading, setLoading] = useState(false);

  // Manual Check-In Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [manualEmpId, setManualEmpId] = useState("");
  const [manualDate, setManualDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [manualNotes, setManualNotes] = useState("Manual attendance check-in");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadEmployees();
    loadAttendance();
  }, [selectedDate, dateFilterType]);

  const loadEmployees = async () => {
    try {
      const data = await getEmployees();
      setEmployees(data);
      if (data.length > 0 && !manualEmpId) {
        setManualEmpId(data[0].employee_id);
      }
    } catch (e) {
      console.error("Error loading employees:", e);
    }
  };

  const loadAttendance = async () => {
    setLoading(true);
    try {
      const dateParam = dateFilterType === "all" ? undefined : selectedDate;
      const data = await getAttendance(dateParam);
      setRecords(data);
      applyFilter(data, search);
    } catch (e: any) {
      console.error("Error loading attendance:", e);
      toast.error("Failed to load attendance", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const applyFilter = (data: any[], searchTerm: string) => {
    const s = searchTerm.toLowerCase();
    const result = data.filter(
      (r) =>
        r.employee_id.toLowerCase().includes(s) ||
        r.name.toLowerCase().includes(s) ||
        (r.notes && r.notes.toLowerCase().includes(s))
    );
    setFiltered(result);
  };

  useEffect(() => {
    applyFilter(records, search);
  }, [search, records]);

  const handleManualCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualEmpId) {
      toast.error("Please select an employee");
      return;
    }
    setSubmitting(true);
    try {
      const res = await manualAttendanceCheckIn(
        manualEmpId,
        "supervisor",
        manualNotes,
        manualDate
      );
      if (res.is_duplicate) {
        toast.warning("Duplicate Attendance", {
          description: `Attendance was already recorded for ${res.name} on ${res.date}.`,
        });
      } else {
        toast.success("Attendance Marked Successfully", {
          description: `Attendance recorded for ${res.name} (${res.employee_id}) on ${res.date}.`,
        });
      }
      setIsModalOpen(false);
      loadAttendance();
    } catch (err: any) {
      toast.error("Failed to mark attendance", { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const verifiedCount = records.filter((r) => !r.is_duplicate).length;
  const duplicateCount = records.filter((r) => r.is_duplicate).length;

  return (
    <div className="space-y-6">
      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#111111]">Daily Attendance Management</h2>
          <p className="text-sm text-[#666666] mt-0.5">
            Day-to-day employee check-in verification, facial recognition logs, and manual marking
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAttendance}
            disabled={loading}
            className="bg-white border-[#E5E7EB] text-[#111111] hover:bg-neutral-100 text-xs shadow-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Mark Attendance
          </Button>
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white border-[#E5E7EB] shadow-xs p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-neutral-100 flex items-center justify-center text-[#111111]">
            <Calendar className="w-5 h-5 text-[#111111]" />
          </div>
          <div>
            <span className="text-xs text-[#666666] font-medium uppercase tracking-wider block">Total Logged</span>
            <span className="text-2xl font-bold font-mono text-[#111111]">{records.length}</span>
          </div>
        </Card>

        <Card className="bg-white border-[#E5E7EB] shadow-xs p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <span className="text-xs text-[#666666] font-medium uppercase tracking-wider block">Verified Present</span>
            <span className="text-2xl font-bold font-mono text-emerald-700">{verifiedCount}</span>
          </div>
        </Card>

        <Card className="bg-white border-[#E5E7EB] shadow-xs p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <span className="text-xs text-[#666666] font-medium uppercase tracking-wider block">Duplicates Prevented</span>
            <span className="text-2xl font-bold font-mono text-amber-700">{duplicateCount}</span>
          </div>
        </Card>
      </div>

      {/* Filter Toolbar: Date & Search */}
      <Card className="bg-white border-[#E5E7EB] shadow-xs p-4">
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[#666666] mr-1">Date:</span>
            <button
              type="button"
              onClick={() => {
                setDateFilterType("today");
                setSelectedDate(format(new Date(), "yyyy-MM-dd"));
              }}
              className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-colors ${
                dateFilterType === "today"
                  ? "bg-[#111111] text-white"
                  : "bg-neutral-50 border border-[#E5E7EB] text-[#111111] hover:bg-neutral-100"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDateFilterType("all")}
              className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-colors ${
                dateFilterType === "all"
                  ? "bg-[#111111] text-white"
                  : "bg-neutral-50 border border-[#E5E7EB] text-[#111111] hover:bg-neutral-100"
              }`}
            >
              All Dates
            </button>
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setDateFilterType("custom");
                }}
                className="h-8 text-xs bg-neutral-50 border-[#E5E7EB] text-[#111111] font-mono w-36"
              />
            </div>
          </div>

          <div className="w-full md:w-72 relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#666666]" />
            <Input
              placeholder="Search employee or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 bg-neutral-50 border-[#E5E7EB] text-[#111111] placeholder:text-[#666666] text-xs shadow-xs h-8"
            />
          </div>
        </div>
      </Card>

      {/* Attendance Table */}
      <Card className="bg-white border-[#E5E7EB] shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-neutral-50 border-b border-[#E5E7EB]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Date</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Check-in Time</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Employee ID</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Employee Name</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Confidence</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Status</TableHead>
                <TableHead className="font-semibold text-[#111111] text-xs py-3">Notes / Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#E5E7EB] bg-white">
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-[#666666] text-sm">
                    No attendance records found for this period.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((record) => (
                  <TableRow key={record.id} className="hover:bg-neutral-50 transition-colors">
                    <TableCell className="text-[#111111] font-mono text-xs font-semibold">{record.date}</TableCell>
                    <TableCell className="text-[#111111] font-mono text-xs">
                      {format(new Date(record.timestamp), "HH:mm:ss")}
                    </TableCell>
                    <TableCell className="text-[#666666] font-mono text-xs">{record.employee_id}</TableCell>
                    <TableCell className="text-[#111111] font-semibold text-sm">{record.name}</TableCell>
                    <TableCell className="text-[#666666] font-mono text-xs">
                      {record.confidence ? `${(record.confidence * 100).toFixed(1)}%` : "Manual / 100%"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          record.is_duplicate
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : record.status === "MANUAL_CORRECTION"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        }`}
                      >
                        {record.is_duplicate ? (
                          <>
                            <AlertTriangle className="w-3 h-3 text-amber-600" /> Duplicate Prevented
                          </>
                        ) : record.status === "MANUAL_CORRECTION" ? (
                          <>
                            <UserCheck className="w-3 h-3 text-blue-600" /> Manual Verified
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Face Verified
                          </>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-[#666666] text-xs truncate max-w-xs">
                      {record.notes || "Live camera detection"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Manual Mark Attendance Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="bg-white border-[#E5E7EB] shadow-xl max-w-md w-full">
            <CardHeader className="border-b border-[#E5E7EB]">
              <CardTitle className="text-[#111111] flex items-center gap-2 text-base font-bold">
                <UserCheck className="w-4 h-4 text-[#111111]" /> Mark Day-to-Day Attendance
              </CardTitle>
            </CardHeader>
            <form onSubmit={handleManualCheckIn}>
              <CardContent className="space-y-4 pt-4">
                <div>
                  <Label className="text-xs text-[#666666] font-semibold">Select Employee</Label>
                  <select
                    value={manualEmpId}
                    onChange={(e) => setManualEmpId(e.target.value)}
                    className="w-full mt-1.5 bg-neutral-50 border border-[#E5E7EB] rounded-md px-3 py-2 text-[#111111] text-xs font-medium focus:outline-none focus:border-[#111111] focus:bg-white"
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.employee_id}>
                        {emp.employee_id} - {emp.name} ({emp.department || "General"})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-xs text-[#666666] font-semibold">Attendance Date</Label>
                  <Input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="mt-1.5 bg-neutral-50 border-[#E5E7EB] text-[#111111] text-xs font-mono"
                    required
                  />
                </div>

                <div>
                  <Label className="text-xs text-[#666666] font-semibold">Notes / Reason</Label>
                  <Input
                    type="text"
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    placeholder="e.g. In-office check-in, camera bypass..."
                    className="mt-1.5 bg-neutral-50 border-[#E5E7EB] text-[#111111] text-xs"
                  />
                </div>
              </CardContent>
              <div className="p-4 border-t border-[#E5E7EB] flex items-center justify-end gap-2 bg-neutral-50">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="bg-white border-[#E5E7EB] text-[#111111] hover:bg-neutral-100 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting}
                  className="bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold"
                >
                  {submitting ? "Marking..." : "Confirm Attendance"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
