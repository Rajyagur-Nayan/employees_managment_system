"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Video, Users, Clock, BarChart, Settings, Menu, Monitor } from "lucide-react";
import { Suspense, useState } from "react";
import { cn } from "@/lib/utils";
import { AttendanceNotifier } from "@/components/AttendanceNotifier";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Live Attendance", href: "/dashboard/live", icon: Video },
  { name: "Workstation Presence", href: "/dashboard/workstations", icon: Monitor },
  { name: "Attendance Log", href: "/dashboard/attendance", icon: Clock },
  { name: "Employees", href: "/dashboard/employees", icon: Users },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

function DashboardContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-50 overflow-hidden">
      <AttendanceNotifier />
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/80 lg:hidden" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-neutral-900 border-r border-neutral-800 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:w-64",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-16 items-center px-6 border-b border-neutral-800">
          <h1 className="text-lg font-semibold tracking-tight text-white">Smart Attendance</h1>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  isActive ? "bg-neutral-800 text-white" : "text-neutral-400 hover:bg-neutral-800/50 hover:text-white",
                  "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors"
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon
                  className={cn(
                    isActive ? "text-white" : "text-neutral-400 group-hover:text-white",
                    "flex-shrink-0 -ml-1 mr-3 h-5 w-5"
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar for mobile */}
        <div className="lg:hidden flex h-16 flex-shrink-0 items-center border-b border-neutral-800 bg-neutral-900 px-4">
          <button
            type="button"
            className="text-neutral-400 hover:text-white"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
          <div className="ml-4 text-sm font-medium">Smart Attendance</div>
        </div>

        {/* Main scrollable area */}
        <main className="flex-1 overflow-y-auto bg-neutral-950 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="h-screen w-full bg-neutral-950"></div>}>
      <DashboardContent>{children}</DashboardContent>
    </Suspense>
  );
}
