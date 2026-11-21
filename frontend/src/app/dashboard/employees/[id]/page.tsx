"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getEmployee, getAttendance } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { User, Mail, Phone, Building, ArrowLeft, Calendar, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function EmployeeDetailPage() {
  const params = useParams();
  const id = params.id as string;
  
  const [employee, setEmployee] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);

  useEffect(() => {
    if (id) {
      getEmployee(id).then(emp => {
        setEmployee(emp);
        return getAttendance(undefined, emp.employee_id);
      }).then(setAttendance).catch(console.error);
    }
  }, [id]);

  if (!employee) return <div className="p-12 text-center text-slate-400 font-medium">Loading employee profile...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/employees">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-slate-200 text-slate-600 bg-white shadow-xs">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Employee Profile</h2>
          <p className="text-sm text-slate-500">Employee details, shift credentials, and verified check-in history</p>
        </div>
      </div>
      
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-white border-slate-200 shadow-sm md:col-span-1">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-slate-900 text-base">Profile Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center">
                <User className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{employee.name}</h3>
                <p className="text-sm font-mono text-slate-500">{employee.employee_id}</p>
                <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium border border-slate-200">
                  {employee.shift_name || "General Shift"}
                </span>
              </div>
            </div>
            
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <Mail className="w-4 h-4 text-slate-400" />
                <span>{employee.email || "No email provided"}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <Phone className="w-4 h-4 text-slate-400" />
                <span>{employee.phone || "No phone provided"}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <Building className="w-4 h-4 text-slate-400" />
                <span>{employee.department || "General Department"}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-700">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>Timing: {employee.shift_timing || "09:00 - 18:00"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-white border-slate-200 shadow-sm md:col-span-2 overflow-hidden">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-slate-900 text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Attendance History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="border-slate-200">
                  <TableHead className="text-slate-600 font-semibold text-xs py-3">Date</TableHead>
                  <TableHead className="text-slate-600 font-semibold text-xs py-3">Time</TableHead>
                  <TableHead className="text-slate-600 font-semibold text-xs py-3">Status</TableHead>
                  <TableHead className="text-slate-600 font-semibold text-xs py-3">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {attendance.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-10 text-slate-400 text-sm">
                      No attendance records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  attendance.map((record) => (
                    <TableRow key={record.id} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell className="text-slate-900 font-mono text-xs">{record.date}</TableCell>
                      <TableCell className="text-slate-600 font-mono text-xs">
                        {format(new Date(record.timestamp), "HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          record.is_duplicate 
                            ? "bg-amber-50 text-amber-700 border border-amber-200" 
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        }`}>
                          {record.is_duplicate ? "Duplicate" : "Verified Present"}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-600 font-mono text-xs">
                        {record.confidence ? `${(record.confidence * 100).toFixed(1)}%` : "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
