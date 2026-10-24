"use client";

import { useEffect, useState } from "react";
import { getEmployees, deleteEmployee } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { UserPlus, Trash2, Eye } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";


export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  
  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = () => {
    getEmployees().then(setEmployees).catch(console.error);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this employee?")) {
      await deleteEmployee(id);
      loadEmployees();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight text-white">Employees</h2>
        <Link href="/dashboard/employees/new">
          <Button className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Add Employee
          </Button>
        </Link>
      </div>

      <Card className="bg-neutral-900 border-neutral-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-neutral-800 hover:bg-neutral-800/50">
                <TableHead className="text-neutral-400">ID</TableHead>
                <TableHead className="text-neutral-400">Name</TableHead>
                <TableHead className="text-neutral-400">Email</TableHead>
                <TableHead className="text-neutral-400">Registered At</TableHead>
                <TableHead className="text-right text-neutral-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-neutral-500">
                    No employees registered yet.
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((emp) => (
                  <TableRow key={emp.id} className="border-neutral-800 hover:bg-neutral-800/50">
                    <TableCell className="text-neutral-400 font-medium">{emp.employee_id}</TableCell>
                    <TableCell className="text-white">{emp.name}</TableCell>
                    <TableCell className="text-neutral-400">{emp.email || '-'}</TableCell>
                    <TableCell className="text-neutral-400">
                      {format(new Date(emp.registered_at), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/dashboard/employees/${emp.id}`}>
                          <Button variant="ghost" size="icon" className="text-neutral-400 hover:text-white">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                          onClick={() => handleDelete(emp.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
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
