import { useState } from "react";
import { useListAccountingRecords, useGetAccountingSummary } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { format } from "date-fns";

export function Reports() {
  const { data: records = [], isLoading } = useListAccountingRecords({}, { query: { queryKey: ["/api/accounting"] } });
  const { data: summary = [] } = useGetAccountingSummary({ query: { queryKey: ["/api/accounting/summary"] } });

  const exportToCSV = () => {
    if (!records.length) return;
    const headers = ["ID", "Date", "Vehicle", "Task ID", "Amount", "Notes"];
    const rows = records.map(r => [
      r.id,
      format(new Date(r.date), "yyyy-MM-dd HH:mm"),
      r.vehicleName || `Vehicle ${r.vehicleId}`,
      r.taskId,
      r.amount,
      r.notes || ""
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `accounting_export_${format(new Date(), 'yyyyMMdd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounting & Reports</h1>
          <p className="text-muted-foreground text-sm">Revenue tracking and history</p>
        </div>
        <Button onClick={exportToCSV} variant="outline">
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4 shrink-0">
        {summary.map(s => (
          <Card key={s.vehicleId}>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground font-medium mb-1 truncate" title={s.vehicleName}>
                {s.vehicleName}
              </div>
              <div className="text-2xl font-bold">${s.totalRevenue.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.tripCount} trips</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col mt-2">
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Task ID</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">Loading records...</TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">No records found</TableCell>
                </TableRow>
              ) : (
                records.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{format(new Date(r.date), "yyyy-MM-dd HH:mm")}</TableCell>
                    <TableCell className="font-medium">{r.vehicleName}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">#{r.taskId}</TableCell>
                    <TableCell className="font-bold text-green-600">${r.amount}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.notes}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
