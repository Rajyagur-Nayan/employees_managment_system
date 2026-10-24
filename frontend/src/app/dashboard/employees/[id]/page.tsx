"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getEmployee, getAttendance } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { User, Mail, Phone, Building } from "lucide-react";

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

  if (!employee) return <div className="p-8 text-center text-neutral-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-white">Employee Profile</h2>
      
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-neutral-900 border-neutral-800 md:col-span-1">
          <CardHeader>
            <CardTitle className="text-white">Profile Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center">
                <User className="w-8 h-8 text-neutral-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">{employee.name}</h3>
                <p className="text-sm text-neutral-400">{employee.employee_id}</p>
              </div>
            </div>
            
            <div className="space-y-3 pt-4 border-t border-neutral-800">
              <div className="flex items-center gap-3 text-sm text-neutral-300">
                <Mail className="w-4 h-4 text-neutral-500" />
                <span>{employee.email || "No email provided"}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-neutral-300">
                <Phone className="w-4 h-4 text-neutral-500" />
                <span>{employee.phone || "No phone provided"}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-neutral-300">
                <Building className="w-4 h-4 text-neutral-500" />
                <span>{employee.department || "No department"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-neutral-900 border-neutral-800 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-white">Attendance History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-neutral-800">
                  <TableHead className="text-neutral-400">Date</TableHead>
                  <TableHead className="text-neutral-400">Time</TableHead>
                  <TableHead className="text-neutral-400">Status</TableHead>
                  <TableHead className="text-neutral-400">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendance.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-neutral-500">
                      No attendance records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  attendance.map((record) => (
                    <TableRow key={record.id} className="border-neutral-800">
                      <TableCell className="text-white">{record.date}</TableCell>
                      <TableCell className="text-neutral-300">
                        {format(new Date(record.timestamp), 'HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          record.is_duplicate 
                            ? 'bg-neutral-800 text-neutral-400' 
                            : 'bg-emerald-500/10 text-emerald-500'
                        }`}>
                          {record.is_duplicate ? 'Duplicate' : 'Present'}
                        </span>
                      </TableCell>
                      <TableCell className="text-neutral-400">
                        {record.confidence ? `${(record.confidence * 100).toFixed(1)}%` : '-'}
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
