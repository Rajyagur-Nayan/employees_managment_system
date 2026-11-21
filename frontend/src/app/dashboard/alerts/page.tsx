"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bell,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Filter,
  RefreshCw,
  User,
  MapPin,
  Check,
  AlertCircle,
  Sliders,
  Save,
} from "lucide-react";
import {
  getAlerts,
  acknowledgeAlert,
  resolveAlert,
  getEmployees,
  getWorkstations,
  getAlertConfig,
  updateAlertConfig,
} from "@/lib/api";
import { toast } from "sonner";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [workstations, setWorkstations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Configurable Absence Threshold (Default: 15 minutes)
  const [thresholdMinutes, setThresholdMinutes] = useState<number>(15);
  const [savingThreshold, setSavingThreshold] = useState<boolean>(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterEmpId, setFilterEmpId] = useState<string>("");
  const [filterShift, setFilterShift] = useState<string>("");
  const [filterDate, setFilterDate] = useState<string>("");

  // Action modal
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null);
  const [modalAction, setModalAction] = useState<"acknowledge" | "resolve" | null>(null);
  const [actionNotes, setActionNotes] = useState<string>("");
  const [actionOperator, setActionOperator] = useState<string>("Manager");
  const [submittingAction, setSubmittingAction] = useState(false);

  // Load choices and threshold once on mount
  useEffect(() => {
    getEmployees().then((data) => setEmployees(data || [])).catch(() => {});
    getWorkstations().then((data) => setWorkstations(data || [])).catch(() => {});
    getAlertConfig().then((data) => {
      if (data?.absence_threshold_minutes) {
        setThresholdMinutes(data.absence_threshold_minutes);
      }
    }).catch(() => {});
  }, []);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterStatus !== "ALL") params.status = filterStatus;
      if (filterEmpId) params.employee_id = filterEmpId;
      if (filterShift) params.shift = filterShift;
      if (filterDate) params.date = filterDate;

      const alertsRes = await getAlerts(params);
      setAlerts(alertsRes?.alerts || []);
    } catch (err) {
      console.warn("Failed to load alerts:", err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterEmpId, filterShift, filterDate]);

  // Initial load on filter change - NO setInterval polling
  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // Event-driven WebSocket push updates (NO polling loops)
  useEffect(() => {
    const defaultWs = "ws://127.0.0.1:8000/ws/workstation";
    const envWs = process.env.NEXT_PUBLIC_WS_URL
      ? process.env.NEXT_PUBLIC_WS_URL.replace("://localhost:", "://127.0.0.1:").replace("/ws/attendance", "/ws/workstation")
      : defaultWs;

    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(envWs);
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "position_alert" || data.type === "position_alert_resolved") {
            loadAlerts();
          }
        } catch {}
      };
    } catch {}

    return () => {
      if (socket) socket.close();
    };
  }, [loadAlerts]);

  const handleSaveThreshold = async (minutes: number) => {
    setSavingThreshold(true);
    try {
      await updateAlertConfig(minutes);
      setThresholdMinutes(minutes);
      toast.success("Absence Threshold Updated", {
        description: `Alert threshold set to ${minutes} continuous minutes of absence.`,
      });
    } catch (err: any) {
      toast.error("Failed to update threshold", { description: err.message });
    } finally {
      setSavingThreshold(false);
    }
  };

  const handleOpenActionModal = (alertItem: any, action: "acknowledge" | "resolve") => {
    setSelectedAlert(alertItem);
    setModalAction(action);
    setActionNotes("");
  };

  const handleConfirmAction = async () => {
    if (!selectedAlert || !modalAction) return;
    setSubmittingAction(true);
    try {
      if (modalAction === "acknowledge") {
        await acknowledgeAlert(
          selectedAlert.id,
          actionOperator || "Manager",
          actionNotes || "Acknowledged by manager"
        );
        toast.success(`Alert #${selectedAlert.id} acknowledged`);
      } else if (modalAction === "resolve") {
        await resolveAlert(
          selectedAlert.id,
          actionOperator || "Manager",
          actionNotes || "Resolved by manager"
        );
        toast.success(`Alert #${selectedAlert.id} resolved`);
      }
      setSelectedAlert(null);
      setModalAction(null);
      setActionNotes("");
      await loadAlerts();
    } catch (err: any) {
      toast.error("Error updating alert", { description: err.message });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Stats calculation
  const totalAlerts = alerts.length;
  const activeCount = alerts.filter((a) => a.status === "ACTIVE").length;
  const acknowledgedCount = alerts.filter((a) => a.status === "ACKNOWLEDGED").length;
  const resolvedCount = alerts.filter((a) => a.status === "RESOLVED").length;

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111] flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-[#111111]" /> Position Absence Alerts
          </h1>
          <p className="text-[#666666] text-sm mt-0.5">
            Event-driven manager notifications for continuous employee absences exceeding configured threshold
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadAlerts}
          disabled={loading}
          className="border-[#E5E7EB] text-[#111111] bg-white hover:bg-neutral-100 shadow-xs flex items-center gap-2 h-9 text-xs font-semibold"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh Alerts
        </Button>
      </div>

      {/* Threshold Configuration Card */}
      <Card className="bg-white border-[#E5E7EB] shadow-xs p-5">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-[#111111]">
              <Sliders className="w-4 h-4 text-[#111111]" /> Configurable Absence Alert Threshold
            </div>
            <p className="text-xs text-[#666666] mt-0.5">
              Generates exactly 1 alert when an active confirmed employee leaves their workstation for longer than this duration. (Default: 15 minutes)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[5, 10, 15, 20, 30].map((mins) => (
              <Button
                key={mins}
                size="sm"
                variant={thresholdMinutes === mins ? "default" : "outline"}
                onClick={() => handleSaveThreshold(mins)}
                disabled={savingThreshold}
                className={
                  thresholdMinutes === mins
                    ? "bg-[#111111] text-white hover:bg-neutral-800 text-xs font-semibold h-8"
                    : "bg-white border-[#E5E7EB] text-[#111111] hover:bg-neutral-100 text-xs font-medium h-8"
                }
              >
                {mins} min {mins === 15 ? "(Default)" : ""}
              </Button>
            ))}

            <div className="flex items-center gap-1.5 ml-1">
              <Input
                type="number"
                min={1}
                max={180}
                placeholder="Custom"
                value={thresholdMinutes}
                onChange={(e) => setThresholdMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 bg-white border-[#E5E7EB] text-xs h-8 text-[#111111] font-mono"
              />
              <span className="text-xs text-[#666666] font-medium">min</span>
              <Button
                size="sm"
                onClick={() => handleSaveThreshold(thresholdMinutes)}
                disabled={savingThreshold}
                className="bg-[#111111] text-white hover:bg-neutral-800 text-xs font-semibold h-8 px-2.5 shadow-xs"
              >
                <Save className="w-3.5 h-3.5 mr-1" /> Set
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-white border-[#E5E7EB] shadow-xs p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-[#666666] font-semibold">Total Incidents</span>
            <Bell className="w-4 h-4 text-[#666666]" />
          </div>
          <div className="text-2xl font-extrabold text-[#111111] mt-2">{totalAlerts}</div>
          <p className="text-xs text-[#666666] mt-1">Recorded absence events</p>
        </Card>

        <Card className="bg-white border-[#E5E7EB] shadow-xs p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-rose-800 font-semibold">Active Alerts</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-extrabold text-rose-800 mt-2">{activeCount}</div>
          <p className="text-xs text-rose-700 mt-1">Continuous absence &gt; {thresholdMinutes}m</p>
        </Card>

        <Card className="bg-white border-[#E5E7EB] shadow-xs p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-amber-800 font-semibold">Acknowledged</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-amber-800 mt-2">{acknowledgedCount}</div>
          <p className="text-xs text-amber-700 mt-1">Under manager review</p>
        </Card>

        <Card className="bg-white border-[#E5E7EB] shadow-xs p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-emerald-800 font-semibold">Resolved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-800 mt-2">{resolvedCount}</div>
          <p className="text-xs text-emerald-700 mt-1">Returned to position or cleared</p>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card className="bg-white border-[#E5E7EB] shadow-xs p-4">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#666666]" />
            <span className="text-xs font-bold text-[#111111] uppercase tracking-wider">Filters:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="flex rounded-md overflow-hidden border border-[#E5E7EB] bg-neutral-100 p-0.5">
              {["ALL", "ACTIVE", "ACKNOWLEDGED", "RESOLVED"].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                    filterStatus === status
                      ? "bg-white text-[#111111] font-bold shadow-xs"
                      : "text-[#666666] hover:text-[#111111]"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <select
              value={filterEmpId}
              onChange={(e) => setFilterEmpId(e.target.value)}
              className="bg-white border border-[#E5E7EB] rounded-md px-3 py-1.5 text-xs text-[#111111] h-8 focus:outline-none"
            >
              <option value="">All Employees</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.employee_id}>
                  {emp.employee_id} - {emp.name}
                </option>
              ))}
            </select>

            <select
              value={filterShift}
              onChange={(e) => setFilterShift(e.target.value)}
              className="bg-white border border-[#E5E7EB] rounded-md px-3 py-1.5 text-xs text-[#111111] h-8 focus:outline-none"
            >
              <option value="">All Shifts</option>
              <option value="Day Shift">Day Shift</option>
              <option value="Night Shift">Night Shift</option>
              <option value="Morning Shift">Morning Shift</option>
              <option value="Evening Shift">Evening Shift</option>
              <option value="General Shift">General Shift</option>
            </select>

            <Input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="bg-white border-[#E5E7EB] text-xs text-[#111111] h-8 py-1 px-2 w-auto shadow-xs"
            />

            {(filterStatus !== "ALL" || filterEmpId || filterShift || filterDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterStatus("ALL");
                  setFilterEmpId("");
                  setFilterShift("");
                  setFilterDate("");
                }}
                className="text-xs text-[#666666] hover:text-[#111111] h-8"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Alerts Table */}
      <Card className="bg-white border-[#E5E7EB] shadow-xs overflow-hidden">
        <CardHeader className="py-4 px-6 border-b border-[#E5E7EB] bg-white">
          <CardTitle className="text-base font-bold text-[#111111]">Absence Alert Log & Incidents</CardTitle>
          <CardDescription className="text-xs text-[#666666]">
            Idempotent absence incident logs with automatic return tracking. Exactly 1 alert generated per continuous absence.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-neutral-50 border-b border-[#E5E7EB]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[#111111] font-semibold text-xs py-3">Incident</TableHead>
                <TableHead className="text-[#111111] font-semibold text-xs py-3">Employee</TableHead>
                <TableHead className="text-[#111111] font-semibold text-xs py-3">Position / Shift</TableHead>
                <TableHead className="text-[#111111] font-semibold text-xs py-3">Absent Since</TableHead>
                <TableHead className="text-[#111111] font-semibold text-xs py-3">Absence Duration</TableHead>
                <TableHead className="text-[#111111] font-semibold text-xs py-3">Alert Triggered At</TableHead>
                <TableHead className="text-[#111111] font-semibold text-xs py-3">Status</TableHead>
                <TableHead className="text-right text-[#111111] font-semibold text-xs py-3 pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#E5E7EB] bg-white">
              {alerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-[#666666] text-xs">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-600" />
                    No absence alerts recorded.
                  </TableCell>
                </TableRow>
              ) : (
                alerts.map((item) => {
                  const empName =
                    item.employee_name ||
                    employees.find((e) => e.employee_id === item.employee_id)?.name ||
                    item.employee_id;
                  const wsName =
                    item.workstation_name ||
                    workstations.find((w) => w.id === item.workstation_id)?.name ||
                    `Position #${item.workstation_id}`;

                  return (
                    <TableRow key={item.id} className="hover:bg-neutral-50 transition-colors">
                      <TableCell className="text-[#666666] font-mono text-xs font-semibold">
                        #{item.id}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-neutral-100 border border-[#E5E7EB] flex items-center justify-center text-[#111111] font-bold text-xs">
                            {empName.slice(0, 1)}
                          </div>
                          <div>
                            <div className="text-[#111111] font-medium text-sm">{empName}</div>
                            <div className="text-[#666666] text-xs font-mono">{item.employee_id}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="text-[#111111] text-xs font-semibold flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-[#111111]" /> {wsName}
                          </div>
                          <div className="text-[#666666] text-xs">{item.shift || "General Shift"}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-[#111111] text-xs font-mono">
                        {item.absent_since ? format(new Date(item.absent_since), "HH:mm:ss") : "-"}
                      </TableCell>
                      <TableCell>
                        <span className="text-rose-700 font-mono font-bold text-xs bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          {formatDuration(item.absence_duration_seconds || 0)}
                        </span>
                      </TableCell>
                      <TableCell className="text-[#666666] text-xs font-mono">
                        {item.alert_generated_at
                          ? format(new Date(item.alert_generated_at), "HH:mm:ss (dd/MM)")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {item.status === "ACTIVE" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                            <AlertCircle className="w-3 h-3" /> ACTIVE
                          </span>
                        )}
                        {item.status === "ACKNOWLEDGED" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Clock className="w-3 h-3" /> ACKNOWLEDGED
                          </span>
                        )}
                        {item.status === "RESOLVED" && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <Check className="w-3 h-3" /> RESOLVED
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-1.5">
                          {item.status === "ACTIVE" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenActionModal(item, "acknowledge")}
                                className="h-7 text-xs border-[#E5E7EB] text-[#111111] hover:bg-neutral-100"
                              >
                                Acknowledge
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleOpenActionModal(item, "resolve")}
                                className="h-7 text-xs bg-[#111111] text-white hover:bg-neutral-800"
                              >
                                Resolve
                              </Button>
                            </>
                          )}
                          {item.status === "ACKNOWLEDGED" && (
                            <Button
                              size="sm"
                              onClick={() => handleOpenActionModal(item, "resolve")}
                              className="h-7 text-xs bg-[#111111] text-white hover:bg-neutral-800"
                            >
                              Resolve
                            </Button>
                          )}
                          {item.status === "RESOLVED" && (
                            <span className="text-[#666666] text-xs italic font-medium">
                              {item.resolved_at
                                ? `Resolved at ${format(new Date(item.resolved_at), "HH:mm")}`
                                : "Closed"}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Acknowledge / Resolve Modal */}
      {selectedAlert && modalAction && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="bg-white border-[#E5E7EB] shadow-xl max-w-md w-full">
            <CardHeader className="border-b border-[#E5E7EB] pb-4">
              <CardTitle className="text-[#111111] flex items-center gap-2 text-base">
                {modalAction === "acknowledge" ? (
                  <>
                    <Clock className="w-5 h-5 text-amber-600" /> Acknowledge Absence Alert #{selectedAlert.id}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Resolve Absence Alert #{selectedAlert.id}
                  </>
                )}
              </CardTitle>
              <CardDescription className="text-[#666666] text-xs mt-1">
                Employee: <strong className="text-[#111111]">{selectedAlert.employee_id}</strong> | Position:{" "}
                <strong className="text-[#111111]">#{selectedAlert.workstation_id}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div>
                <Label className="text-xs font-semibold text-[#111111]">Manager / Operator Name</Label>
                <Input
                  value={actionOperator}
                  onChange={(e) => setActionOperator(e.target.value)}
                  className="bg-white border-[#E5E7EB] text-[#111111] mt-1 text-sm shadow-xs h-9"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-[#111111]">Action Notes / Reason</Label>
                <Input
                  placeholder={
                    modalAction === "acknowledge"
                      ? "e.g. Informed supervisor, checking camera feed"
                      : "e.g. Employee returned, discussed absence reason"
                  }
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  className="bg-white border-[#E5E7EB] text-[#111111] mt-1 text-sm shadow-xs h-9"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedAlert(null);
                    setModalAction(null);
                  }}
                  disabled={submittingAction}
                  className="border-[#E5E7EB] text-[#111111] h-9 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmAction}
                  disabled={submittingAction}
                  className="bg-[#111111] hover:bg-neutral-800 text-white h-9 text-xs font-semibold shadow-xs"
                >
                  {submittingAction
                    ? "Submitting..."
                    : modalAction === "acknowledge"
                    ? "Confirm Acknowledged"
                    : "Confirm Resolved"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
