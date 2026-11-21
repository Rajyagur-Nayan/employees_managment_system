"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Clock,
  Monitor,
  Bell,
  FileText,
  ShieldCheck,
  Menu,
} from "lucide-react";
import { Suspense, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { AttendanceNotifier } from "@/components/AttendanceNotifier";
import { getActiveAlertsCount } from "@/lib/api";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Employees", href: "/dashboard/employees", icon: Users },
  { name: "Attendance", href: "/dashboard/attendance", icon: Clock },
  { name: "Workstations", href: "/dashboard/workstations", icon: Monitor },
  { name: "Alerts", href: "/dashboard/alerts", icon: Bell, isAlerts: true },
  { name: "Reports", href: "/dashboard/reports", icon: FileText },
];

function DashboardContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeAlertCount, setActiveAlertCount] = useState<number>(0);

  // Fetch active alerts count once on mount (no repetitive interval polling)
  useEffect(() => {
    getActiveAlertsCount()
      .then((data: any) => setActiveAlertCount(data?.active_alerts || 0))
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-screen bg-white text-[#111111] overflow-hidden font-sans">
      <AttendanceNotifier />
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      {/* Sidebar - Pure White with Clean Borders and Black Accents */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-[#E5E7EB] flex flex-col justify-between transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:w-64",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div>
          {/* Logo & Brand */}
          <div className="flex h-16 items-center px-6 border-b border-[#E5E7EB] gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#111111] flex items-center justify-center text-white shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-[#111111] leading-none">SmartAttendance</h1>
              <span className="text-[11px] text-[#666666] font-medium">Workstation Monitor</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1 px-3 py-4">
            {navigation.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    isActive 
                      ? "bg-[#111111] text-white font-semibold shadow-xs" 
                      : "text-[#666666] hover:bg-neutral-100 hover:text-[#111111] font-medium",
                    "group flex items-center px-3.5 py-2.5 text-sm rounded-lg transition-colors"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon
                    className={cn(
                      isActive ? "text-white" : "text-[#666666] group-hover:text-[#111111]",
                      "flex-shrink-0 -ml-0.5 mr-3 h-4.5 w-4.5 transition-colors"
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate flex-1">{item.name}</span>
                  {item.isAlerts && activeAlertCount > 0 && (
                    <span className={cn(
                      "ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
                      isActive ? "bg-white text-[#111111]" : "bg-rose-600 text-white"
                    )}>
                      {activeAlertCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Manager/Owner Footer Info */}
        <div className="p-4 border-t border-[#E5E7EB] bg-neutral-50 m-3 rounded-xl border border-[#E5E7EB]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#111111] text-white flex items-center justify-center font-bold text-xs">
              M
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-[#111111] truncate">Manager Portal</p>
              <p className="text-[11px] text-[#666666] truncate">Station & Pump Owner</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden bg-white">
        {/* Topbar */}
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-[#E5E7EB] bg-white px-4 md:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="lg:hidden p-2 rounded-lg text-[#666666] hover:bg-neutral-100 hover:text-[#111111]"
              onClick={() => setSidebarOpen(true)}
            >
              <span className="sr-only">Open sidebar</span>
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs text-[#666666]">
              <span>Manager</span>
              <span>/</span>
              <span className="font-semibold text-[#111111] capitalize">
                {pathname.replace("/dashboard", "").replace("/", "") || "Overview"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              AI Engine Online
            </div>
            {activeAlertCount > 0 && (
              <Link
                href="/dashboard/alerts"
                className="relative p-2 rounded-lg text-[#666666] hover:bg-rose-50 hover:text-rose-600 transition-colors"
              >
                <Bell className="w-5 h-5 text-rose-600" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-600"></span>
              </Link>
            )}
          </div>
        </header>

        {/* Main scrollable area */}
        <main className="flex-1 overflow-y-auto bg-[#FAFAFA] p-4 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="h-screen w-full bg-white"></div>}>
      <DashboardContent>{children}</DashboardContent>
    </Suspense>
  );
}
