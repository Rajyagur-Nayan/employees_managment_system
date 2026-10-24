"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Video,
  Monitor,
  Activity,
  ArrowRight,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { getDashboardStats, getAttendance, getCameraStatus, getEmployees } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ActivityItem {
  type: string;
  employee_id?: string;
  employee_name?: string;
  confidence?: number;
  timestamp?: string;
  status?: string;
  is_duplicate?: boolean;
  message?: string;
}

export default function DashboardOverview() {
  const [stats, setStats] = useState({
    total_employees: 0,
    present_today: 0,
    absent_today: 0,
    attendance_rate: 0,
  });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [recentRecords, setRecentRecords] = useState<any[]>([]);
  const [aiStatus, setAiStatus] = useState<string>("Checking...");
  const [cameraConnected, setCameraConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const { status: wsStatus, lastMessage } = useWebSocket();

  // Load initial data from APIs
  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [statsData, attendanceData, camStatus] = await Promise.allSettled([
        getDashboardStats(),
        getAttendance(),
        getCameraStatus(),
      ]);

      if (statsData.status === "fulfilled" && statsData.value) {
        setStats(statsData.value);
      }

      if (attendanceData.status === "fulfilled" && Array.isArray(attendanceData.value)) {
        const records = attendanceData.value;
        setRecentRecords(records.slice(0, 5));

        // Populate initial activities list with today's real attendance
        const initialActs: ActivityItem[] = records.slice(0, 10).map((r: any) => ({
          type: "attendance",
          employee_id: r.employee_id,
          employee_name: r.name,
          confidence: r.confidence ?? 0.95,
          timestamp: r.timestamp ? format(new Date(r.timestamp), "HH:mm:ss") : "--:--",
          status: r.status,
          is_duplicate: r.is_duplicate,
          message: r.is_duplicate ? "Already checked in today" : "Attendance verified",
        }));
        setActivities(initialActs);
      }

      if (camStatus.status === "fulfilled" && camStatus.value) {
        setAiStatus(camStatus.value.status === "running" ? "running" : "standby");
        setCameraConnected(Boolean(camStatus.value.camera_connected));
      }
    } catch (err) {
      console.error("Dashboard initial load failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Handle incoming real-time WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === "system") {
      setAiStatus(lastMessage.status || "standby");
      if (typeof lastMessage.camera_connected === "boolean") {
        setCameraConnected(lastMessage.camera_connected);
      }
    }

    if (
      lastMessage.type === "attendance" ||
      lastMessage.type === "unknown" ||
      lastMessage.type === "liveness_failed"
    ) {
      const newAct: ActivityItem = {
        type: lastMessage.type,
        employee_id: lastMessage.employee_id,
        employee_name: lastMessage.employee_name,
        confidence: lastMessage.confidence,
        timestamp: lastMessage.timestamp || format(new Date(), "HH:mm:ss"),
        status: lastMessage.status,
        is_duplicate: lastMessage.is_duplicate,
        message: lastMessage.message,
      };

      setActivities((prev) => [newAct, ...prev].slice(0, 15));

      // Refresh overview stats and recent records on confirmed attendance
      if (lastMessage.type === "attendance") {
        getDashboardStats().then(setStats).catch(console.error);
        getAttendance().then((recs) => {
          if (Array.isArray(recs)) setRecentRecords(recs.slice(0, 5));
        }).catch(console.error);
      }
    }
  }, [lastMessage]);

  return (
    <div className="space-y-6">
      {/* Greeting and Quick Launch Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Dashboard Overview</h2>
          <p className="text-neutral-400">
            Smart Attendance & Workstation Monitoring for {format(new Date(), "EEEE, MMMM do, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/live">
            <Button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40">
              <Video className="w-4 h-4" /> Live Attendance Screen
            </Button>
          </Link>
          <Link href="/dashboard/workstations">
            <Button variant="outline" className="flex items-center gap-2 border-neutral-700 hover:bg-neutral-800 text-white">
              <Monitor className="w-4 h-4" /> Workstations
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-neutral-400">Total Enrolled</CardTitle>
            <Users className="w-4 h-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{stats.total_employees}</div>
            <p className="text-xs text-neutral-500 mt-1">Registered employee profiles</p>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-neutral-400">Present Today</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-400">{stats.present_today}</div>
            <p className="text-xs text-neutral-500 mt-1">Verified check-ins today</p>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-neutral-400">Absent Today</CardTitle>
            <XCircle className="w-4 h-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-rose-400">{stats.absent_today}</div>
            <p className="text-xs text-neutral-500 mt-1">Pending arrival</p>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900 border-neutral-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-neutral-400">Attendance Rate</CardTitle>
            <Clock className="w-4 h-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{stats.attendance_rate}%</div>
            <p className="text-xs text-neutral-500 mt-1">Daily turnout percentage</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Activity Feed + Today's Logs + System Status */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Live Activity Feed */}
        <Card className="col-span-4 bg-neutral-900 border-neutral-800 flex flex-col">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" /> Attendance Activity Stream
              </CardTitle>
              <CardDescription className="text-neutral-400 text-xs">
                Real-time facial detection and check-in logs
              </CardDescription>
            </div>
            <Link href="/dashboard/attendance" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto max-h-[380px]">
            <div className="space-y-3">
              {activities.length === 0 ? (
                <div className="text-sm text-neutral-500 text-center py-10">
                  {loading ? "Loading attendance records..." : "No attendance recorded yet today. Start the Live Screen to verify employees."}
                </div>
              ) : (
                activities.map((act, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80 hover:border-neutral-700/80 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${
                          act.type === "attendance"
                            ? act.is_duplicate
                              ? "bg-amber-400"
                              : "bg-emerald-400"
                            : act.type === "unknown"
                            ? "bg-neutral-500"
                            : "bg-rose-500"
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium text-white">
                          {act.type === "attendance"
                            ? act.employee_name || act.employee_id
                            : act.type === "unknown"
                            ? "Unknown Face Detected"
                            : "Spoofing / Liveness Rejected"}
                        </p>
                        <p className="text-xs text-neutral-400">
                          {act.type === "attendance"
                            ? `${act.employee_id} • ${act.is_duplicate ? "Duplicate Check-in" : "Verified Present"}`
                            : act.message || "Facial match below threshold"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono text-neutral-300 bg-neutral-900 px-2 py-1 rounded border border-neutral-800">
                        {act.timestamp || "--:--"}
                      </span>
                      {act.confidence !== undefined && (
                        <p className="text-[10px] text-neutral-500 mt-1">
                          {Math.round(act.confidence * 100)}% match
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* System & Telemetry Status */}
        <Card className="col-span-3 bg-neutral-900 border-neutral-800 flex flex-col justify-between">
          <CardHeader className="pb-3">
            <CardTitle className="text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> System & Engine Status
            </CardTitle>
            <CardDescription className="text-neutral-400 text-xs">
              Live camera, AI model, and WebSocket connection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2.5 rounded-md bg-neutral-950/60 border border-neutral-800">
                <span className="text-sm text-neutral-300">WebSocket Link</span>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${wsStatus === "connected" ? "bg-emerald-400" : "bg-rose-500"}`} />
                  <span className="text-xs font-medium text-white uppercase">{wsStatus}</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-md bg-neutral-950/60 border border-neutral-800">
                <span className="text-sm text-neutral-300">Camera Engine</span>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      aiStatus === "running" ? "bg-emerald-400" : "bg-neutral-500"
                    }`}
                  />
                  <span className="text-xs font-medium text-white capitalize">{aiStatus}</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-md bg-neutral-950/60 border border-neutral-800">
                <span className="text-sm text-neutral-300">Anti-Spoofing Liveness</span>
                <span className="text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2 py-0.5 rounded">
                  ENABLED (Texture Check)
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-md bg-neutral-950/60 border border-neutral-800">
                <span className="text-sm text-neutral-300">Multi-Frame Window</span>
                <span className="text-xs font-mono text-neutral-400">3 frames / 2.0s</span>
              </div>
            </div>

            {/* Quick Navigation Cards */}
            <div className="pt-2 border-t border-neutral-800 space-y-2">
              <p className="text-xs font-medium text-neutral-400">Quick Navigation</p>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/dashboard/live" className="p-2.5 rounded-md bg-neutral-950/80 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-300 flex items-center justify-between transition-colors">
                  <span>Live Camera</span>
                  <ArrowRight className="w-3 h-3 text-neutral-500" />
                </Link>
                <Link href="/dashboard/employees" className="p-2.5 rounded-md bg-neutral-950/80 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-300 flex items-center justify-between transition-colors">
                  <span>Manage Roster</span>
                  <ArrowRight className="w-3 h-3 text-neutral-500" />
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Recent Check-ins Table */}
      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" /> Today&apos;s Verified Attendance Check-ins
            </CardTitle>
            <CardDescription className="text-neutral-400 text-xs">
              Latest confirmed presence entries saved to the database
            </CardDescription>
          </div>
          <Link href="/dashboard/attendance">
            <Button variant="ghost" size="sm" className="text-xs text-neutral-400 hover:text-white">
              Full Attendance History <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-neutral-950/60 text-xs text-neutral-400 border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Employee ID</th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Confidence</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80 text-neutral-300">
                {recentRecords.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-neutral-500 text-xs">
                      No verified attendance records found for today.
                    </td>
                  </tr>
                ) : (
                  recentRecords.map((r: any) => (
                    <tr key={r.id} className="hover:bg-neutral-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono text-neutral-400">{r.employee_id}</td>
                      <td className="py-3 px-4 font-medium text-white">{r.name}</td>
                      <td className="py-3 px-4 text-neutral-300">
                        {r.timestamp ? format(new Date(r.timestamp), "HH:mm:ss") : "--:--"}
                      </td>
                      <td className="py-3 px-4 text-neutral-400">
                        {r.confidence ? `${(r.confidence * 100).toFixed(1)}%` : "Manual"}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            r.is_duplicate
                              ? "bg-neutral-800 text-neutral-400"
                              : "bg-emerald-500/10 text-emerald-400"
                          }`}
                        >
                          {r.is_duplicate ? "Duplicate" : "Verified Present"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
