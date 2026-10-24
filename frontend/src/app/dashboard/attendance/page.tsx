"use client";

import { useEffect, useState } from "react";
import { getAttendance } from "@/lib/api";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";

export default function AttendancePage() {
  const [records, setRecords] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getAttendance().then(data => {
      setRecords(data);
      setFiltered(data);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const s = search.toLowerCase();
    setFiltered(records.filter(r => 
      r.employee_id.toLowerCase().includes(s) || 
      r.name.toLowerCase().includes(s)
    ));
  }, [search, records]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold tracking-tight text-white">Attendance Log</h2>
        <div className="w-full sm:w-72">
          <Input 
            placeholder="Search employee..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-neutral-900 border-neutral-800 text-white"
          />
        </div>
      </div>

      <Card className="bg-neutral-900 border-neutral-800">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-neutral-800 hover:bg-neutral-800/50">
                <TableHead className="text-neutral-400">Date</TableHead>
                <TableHead className="text-neutral-400">Time</TableHead>
                <TableHead className="text-neutral-400">ID</TableHead>
                <TableHead className="text-neutral-400">Name</TableHead>
                <TableHead className="text-neutral-400">Confidence</TableHead>
                <TableHead className="text-neutral-400">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-neutral-500">
                    No attendance records found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((record) => (
                  <TableRow key={record.id} className="border-neutral-800 hover:bg-neutral-800/50">
                    <TableCell className="text-white">{record.date}</TableCell>
                    <TableCell className="text-neutral-300">
                      {format(new Date(record.timestamp), 'HH:mm:ss')}
                    </TableCell>
                    <TableCell className="text-neutral-400">{record.employee_id}</TableCell>
                    <TableCell className="text-white font-medium">{record.name}</TableCell>
                    <TableCell className="text-neutral-400">
                      {record.confidence ? `${(record.confidence * 100).toFixed(1)}%` : '-'}
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
