import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTasks,
  useListVehicles,
  useUpdateTask,
  getListTasksQueryKey,
  type Task,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, Download, RefreshCw, Plus, Users, Clock, Plane, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

type ExtendedTask = Task & {
  rowIndex?: number | null;
  tableType?: "left" | "right" | null;
  km?: number | string | null;
};

export function ExcelView() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split("T")[0]);

  // Fetch tasks and vehicles
  const { data: tasks = [], isPending: tasksPending } = useListTasks(
    {},
    { query: { queryKey: getListTasksQueryKey() } }
  );
  const { data: vehicles = [] } = useListVehicles({}, { query: { queryKey: ["/api/vehicles"] } });

  const updateTaskMutation = useUpdateTask();

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    setSelectedDate(`${yyyy}-${mm}-${dd}`);
  };

  // Pre-compute calendar day status
  const { completedDays, uncompletedDays } = useMemo(() => {
    const byDate = new Map<string, { hasActive: boolean }>();
    if (Array.isArray(tasks)) {
      for (const t of tasks as any[]) {
        if (!t?.scheduledTime) continue;
        const d = new Date(t.scheduledTime);
        if (isNaN(d.getTime())) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const prev = byDate.get(key);
        const isActive = t.status !== "completed" && t.status !== "cancelled";
        byDate.set(key, { hasActive: (prev?.hasActive ?? false) || isActive });
      }
    }
    const completed: Date[] = [];
    const uncompleted: Date[] = [];
    for (const [key, { hasActive }] of byDate.entries()) {
      const [y, m, dd] = key.split("-").map(Number);
      const dateObj = new Date(y, m - 1, dd);
      if (hasActive) uncompleted.push(dateObj);
      else completed.push(dateObj);
    }
    return { completedDays: completed, uncompletedDays: uncompleted };
  }, [tasks]);

  const calendarModifiers = { completed: completedDays, uncompleted: uncompletedDays };

  // Filter tasks within the 24-hour shift window (D 06:00 to D+1 05:59)
  const shiftStart = new Date(selectedDate);
  shiftStart.setHours(6, 0, 0, 0);
  const shiftEnd = new Date(shiftStart);
  shiftEnd.setDate(shiftEnd.getDate() + 1);

  const dayTasks = (tasks as ExtendedTask[]).filter((t) => {
    const time = new Date(t.scheduledTime);
    return time >= shiftStart && time < shiftEnd;
  });

  // Extract plate from notes as a fallback if vehicleName is not set
  const getPlateFromNotes = (notes: string | null | undefined) => {
    if (!notes) return null;
    const match = notes.match(/Plaka:\s*([^|]+)/i);
    return match ? match[1].trim() : null;
  };

  // Group tasks by table type and sort them by rowIndex
  const sortTasksByRowIndex = (a: ExtendedTask, b: ExtendedTask) => (a.rowIndex ?? 9999) - (b.rowIndex ?? 9999);

  // Main Regular Tables (left vs right)
  const leftRegular = dayTasks
    .filter((t) => t.tableType === "left" && t.type !== "extra")
    .sort(sortTasksByRowIndex);

  const rightRegular = dayTasks
    .filter((t) => t.tableType === "right" && t.type !== "extra")
    .sort(sortTasksByRowIndex);

  // Extras Tables (left vs right)
  const leftExtras = dayTasks
    .filter((t) => t.tableType === "left" && t.type === "extra")
    .sort(sortTasksByRowIndex);

  const rightExtras = dayTasks
    .filter((t) => t.tableType === "right" && t.type === "extra")
    .sort(sortTasksByRowIndex);

  // Maximum row counts for side-by-side alignment
  const maxRegularRows = Math.max(leftRegular.length, rightRegular.length);
  const maxExtraRows = Math.max(leftExtras.length, rightExtras.length);

  // In-line updates
  const handlePlateChange = (task: Task, vehicleIdVal: string) => {
    if (vehicleIdVal === "cancelled") {
      let newNotes = task.notes ?? "";
      const cleanNotes = newNotes.includes(" | Plaka:") ? newNotes.split(" | Plaka:")[0] : (newNotes.includes(" | İPTAL") ? newNotes.split(" | İPTAL")[0] : (newNotes === "İPTAL" ? "" : newNotes));
      const finalNotes = cleanNotes ? `${cleanNotes} | İPTAL` : "İPTAL";

      updateTaskMutation.mutate(
        {
          id: task.id,
          data: {
            vehicleId: null,
            notes: finalNotes || null,
            status: "cancelled",
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          },
        }
      );
      return;
    }

    if (vehicleIdVal === "custom_prompt") {
      const customPlate = prompt("Lütfen özel plaka veya plakaları girin (Örn: 06 ABC 123 veya 06 ABC 123 / 06 DEF 456):");
      if (customPlate === null) return; // cancelled prompt

      let newNotes = task.notes ?? "";
      const cleanNotes = newNotes.includes(" | Plaka:") ? newNotes.split(" | Plaka:")[0] : (newNotes.includes(" | İPTAL") ? newNotes.split(" | İPTAL")[0] : (newNotes === "İPTAL" ? "" : newNotes));
      
      const finalNotes = customPlate.trim()
        ? (cleanNotes ? `${cleanNotes} | Plaka: ${customPlate.trim()}` : `Plaka: ${customPlate.trim()}`)
        : cleanNotes;

      updateTaskMutation.mutate(
        {
          id: task.id,
          data: {
            vehicleId: null,
            notes: finalNotes || null,
            status: customPlate.trim() ? "assigned" : "draft",
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          },
        }
      );
      return;
    }

    const vId = vehicleIdVal === "" ? null : Number(vehicleIdVal);
    const selectedVehicle = vehicles.find((v) => v.id === vId);

    // Formulate plate notes to preserve crew
    let newNotes = task.notes ?? "";
    const cleanNotes = newNotes.includes(" | Plaka:") ? newNotes.split(" | Plaka:")[0] : (newNotes.includes(" | İPTAL") ? newNotes.split(" | İPTAL")[0] : (newNotes === "İPTAL" ? "" : newNotes));

    if (selectedVehicle) {
      newNotes = cleanNotes ? `${cleanNotes} | Plaka: ${selectedVehicle.plate}` : `Plaka: ${selectedVehicle.plate}`;
    } else {
      newNotes = cleanNotes;
    }

    updateTaskMutation.mutate(
      {
        id: task.id,
        data: {
          vehicleId: vId,
          notes: newNotes || null,
          status: vId ? "assigned" : "draft",
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        },
      }
    );
  };

  const handleKmChange = (taskId: number, kmVal: string) => {
    const kmNum = kmVal === "" ? null : Number(kmVal);
    updateTaskMutation.mutate(
      {
        id: taskId,
        data: {
          km: kmNum,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        },
      }
    );
  };

  const handleDownloadExcel = () => {
    window.open(`/api/excel/download?date=${selectedDate}`, "_blank");
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight leading-tight flex items-center gap-2">
              <FileSpreadsheet className="text-emerald-600" />
              Excel Sefer Görünümü
            </h1>
            <p className="text-muted-foreground text-xs md:text-sm">
              Sürücü plaka ve KM girişini doğrudan tanıdık spreadsheet ızgarasında yapın
            </p>
          </div>
          <div className="flex items-center gap-2 ml-0 md:ml-4 bg-muted/30 p-1.5 rounded-md border border-slate-100 dark:border-slate-800">
            <span className="text-xs font-semibold text-muted-foreground pl-1">Vardiya Tarihi:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border bg-card px-3 text-xs font-medium focus-visible:ring-2 hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center gap-2 rounded-md"
                >
                  <CalendarIcon className="w-3.5 h-3.5 text-emerald-600" />
                  {selectedDate ? format(new Date(selectedDate), "dd MMMM yyyy", { locale: tr }) : ""}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border shadow-md rounded-md bg-popover z-50" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate ? new Date(selectedDate) : undefined}
                  onSelect={handleDateSelect}
                  modifiers={calendarModifiers}
                  modifiersClassNames={{
                    completed: "!bg-emerald-500 !text-white hover:!bg-emerald-600 dark:!bg-emerald-600 dark:hover:!bg-emerald-700 font-semibold rounded-md",
                    uncompleted: "!bg-amber-400 !text-amber-950 hover:!bg-amber-500 dark:!bg-amber-500 dark:hover:!bg-amber-600 font-semibold rounded-md",
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={tasksPending}>
            <RefreshCw className={`w-4 h-4 ${tasksPending ? "animate-spin" : ""}`} />
            <span className="hidden md:inline ml-1.5">Yenile</span>
          </Button>
          <Button
            size="sm"
            onClick={handleDownloadExcel}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Excel İndir
          </Button>
        </div>
      </div>

      {/* ── Regular side-by-side spreadsheet ──────────────────────────── */}
      <Card className="flex-1 overflow-hidden flex flex-col min-h-0 border-slate-200/80 shadow-sm">
        <div className="p-3 border-b bg-card shrink-0 flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              GELİR (GELEN UÇUŞLAR)
            </Badge>
            <span className="text-muted-foreground text-xs">&bull;</span>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              GİDER (GİDEN UÇUŞLAR)
            </Badge>
          </h3>
          <span className="text-xs font-mono text-muted-foreground">
            Toplam: {dayTasks.length} Sefer ({leftRegular.length} Gelir / {rightRegular.length} Gider)
          </span>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-xs font-mono select-none">
            <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-20 border-b shadow-[0_1px_0_rgba(0,0,0,0.05)]">
              <tr className="divide-x divide-y divide-border">
                {/* Left (Gelir) Header */}
                <th className="bg-blue-500/5 text-blue-700 font-bold p-2 text-center w-12">S.NO</th>
                <th className="bg-blue-500/5 text-blue-700 font-bold p-2 text-left min-w-[80px]">UÇUŞ KODU</th>
                <th className="bg-blue-500/5 text-blue-700 font-bold p-2 text-left min-w-[150px]">PLAKA (SÜRÜCÜ)</th>
                <th className="bg-blue-500/5 text-blue-700 font-bold p-2 text-center w-16">SAAT</th>
                <th className="bg-blue-500/5 text-blue-700 font-bold p-2 text-left min-w-[180px]">OTEL ADI / NEREDEN</th>
                <th className="bg-blue-500/5 text-blue-700 font-bold p-2 text-left min-w-[100px]">EKİP (KİŞİ)</th>
                <th className="bg-blue-500/5 text-blue-700 font-bold p-2 text-center w-20">KM</th>

                {/* Separation Column */}
                <th className="bg-slate-100 dark:bg-slate-800 p-2 w-2"></th>

                {/* Right (Gider) Header */}
                <th className="bg-amber-500/5 text-amber-700 font-bold p-2 text-left min-w-[80px]">UÇUŞ KODU</th>
                <th className="bg-amber-500/5 text-amber-700 font-bold p-2 text-left min-w-[150px]">PLAKA (SÜRÜCÜ)</th>
                <th className="bg-amber-500/5 text-amber-700 font-bold p-2 text-center w-16">SAAT</th>
                <th className="bg-amber-500/5 text-amber-700 font-bold p-2 text-left min-w-[180px]">OTEL ADI / NEREYE</th>
                <th className="bg-amber-500/5 text-amber-700 font-bold p-2 text-left min-w-[100px]">EKİP (KİŞİ)</th>
                <th className="bg-amber-500/5 text-amber-700 font-bold p-2 text-center w-20">KM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Array.from({ length: maxRegularRows }).map((_, idx) => {
                const leftTask = leftRegular[idx] as ExtendedTask | undefined;
                const rightTask = rightRegular[idx] as ExtendedTask | undefined;
                const leftCancelled = leftTask?.status === "cancelled";
                const rightCancelled = rightTask?.status === "cancelled";

                return (
                  <tr key={idx} className="divide-x divide-border hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                    {/* Left (Gelir) Task Cells */}
                    {leftTask ? (
                      <>
                        <td className={`p-1.5 text-center font-bold ${leftCancelled ? "bg-rose-50/40 text-rose-700/60 line-through dark:bg-rose-950/20 dark:text-rose-400/50" : "text-muted-foreground bg-slate-50/50 dark:bg-slate-900/10"}`}>{idx + 1}</td>
                        <td className={`p-1.5 font-bold uppercase truncate max-w-[80px] ${leftCancelled ? "opacity-60 line-through text-rose-900/80 bg-rose-50/20 dark:text-rose-400/60 dark:bg-rose-950/10" : ""}`} title={leftTask.flightCode ?? ""}>
                          {leftTask.flightCode || "-"}
                        </td>
                        <td className={`p-1 ${leftCancelled ? "bg-rose-50/20 dark:bg-rose-950/10" : ""}`}>
                          <select
                            className={`w-full bg-transparent p-1 font-semibold focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 cursor-pointer rounded transition-all duration-150 ${leftCancelled ? "text-rose-700 dark:text-rose-400 opacity-80" : "text-primary"}`}
                            value={leftTask.status === "cancelled" ? "cancelled" : (leftTask.vehicleId ?? (getPlateFromNotes(leftTask.notes) ? `custom:${getPlateFromNotes(leftTask.notes)}` : ""))}
                            onChange={(e) => handlePlateChange(leftTask, e.target.value)}
                          >
                            <option value="">Plaka Seçin...</option>
                            <option value="cancelled" className="text-red-600 font-bold">İPTAL</option>
                            <option value="custom_prompt" className="text-blue-600 font-bold">✍️ Özel Plaka Yaz...</option>
                            {leftTask.vehicleId === null && getPlateFromNotes(leftTask.notes) && (
                              <option value={`custom:${getPlateFromNotes(leftTask.notes)}`} className="font-bold text-blue-600">
                                {getPlateFromNotes(leftTask.notes)} (Özel)
                              </option>
                            )}
                            {vehicles.map((v: any) => (
                              <option key={v.id} value={v.id}>
                                {v.plate} — {v.driverName}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={`p-1.5 text-center font-bold bg-blue-50/10 dark:bg-blue-950/10 ${leftCancelled ? "text-rose-700/60 bg-rose-50/20 line-through dark:text-rose-400/50 dark:bg-rose-950/10" : "text-blue-600 dark:text-blue-400"}`}>
                          {format(new Date(leftTask.scheduledTime), "HH:mm")}
                        </td>
                        <td className={`p-1.5 font-medium truncate max-w-[180px] ${leftCancelled ? "opacity-60 line-through text-rose-900/80 bg-rose-50/20 dark:text-rose-400/60 dark:bg-rose-950/10" : ""}`} title={leftTask.pickupLocation}>
                          {leftTask.pickupLocation}
                        </td>
                        <td className={`p-1.5 font-medium truncate max-w-[100px] ${leftCancelled ? "opacity-60 line-through text-rose-900/80 bg-rose-50/20 dark:text-rose-400/60 dark:bg-rose-950/10" : "text-muted-foreground"}`} title={leftTask.notes ?? ""}>
                          {leftTask.notes && (leftTask.notes.includes("CPT") || leftTask.notes.includes("KBN") || leftTask.notes.toLowerCase().includes("cpt") || leftTask.notes.toLowerCase().includes("kbn"))
                            ? (leftTask.notes.includes(" | Plaka:") ? leftTask.notes.split(" | Plaka:")[0] : leftTask.notes)
                            : `${leftTask.passengerCount} kişi`}
                        </td>
                        <td className={`p-1 ${leftCancelled ? "bg-rose-50/10 dark:bg-rose-950/10 opacity-60" : ""}`}>
                          <input
                            type="number"
                            min={0}
                            disabled={leftCancelled}
                            className="w-full bg-transparent p-1 text-center font-bold focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 rounded transition-all duration-150"
                            defaultValue={leftTask.km != null ? Number(leftTask.km) : ""}
                            placeholder="KM"
                            onBlur={(e) => handleKmChange(leftTask.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                            }}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-1.5 text-center text-muted-foreground bg-slate-50/50 dark:bg-slate-900/10 font-bold">{idx + 1}</td>
                        <td colSpan={6} className="bg-slate-50/10"></td>
                      </>
                    )}

                    {/* Separator Column */}
                    <td className="bg-slate-100 dark:bg-slate-800 p-0"></td>

                    {/* Right (Gider) Task Cells */}
                    {rightTask ? (
                      <>
                        <td className={`p-1.5 font-bold uppercase truncate max-w-[80px] ${rightCancelled ? "opacity-60 line-through text-rose-900/80 bg-rose-50/20 dark:text-rose-400/60 dark:bg-rose-950/10" : ""}`} title={rightTask.flightCode ?? ""}>
                          {rightTask.flightCode || "-"}
                        </td>
                        <td className={`p-1 ${rightCancelled ? "bg-rose-50/20 dark:bg-rose-950/10" : ""}`}>
                          <select
                            className={`w-full bg-transparent p-1 font-semibold focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 cursor-pointer rounded transition-all duration-150 ${rightCancelled ? "text-rose-700 dark:text-rose-400 opacity-80" : "text-primary"}`}
                            value={rightTask.status === "cancelled" ? "cancelled" : (rightTask.vehicleId ?? (getPlateFromNotes(rightTask.notes) ? `custom:${getPlateFromNotes(rightTask.notes)}` : ""))}
                            onChange={(e) => handlePlateChange(rightTask, e.target.value)}
                          >
                            <option value="">Plaka Seçin...</option>
                            <option value="cancelled" className="text-red-600 font-bold">İPTAL</option>
                            <option value="custom_prompt" className="text-blue-600 font-bold">✍️ Özel Plaka Yaz...</option>
                            {rightTask.vehicleId === null && getPlateFromNotes(rightTask.notes) && (
                              <option value={`custom:${getPlateFromNotes(rightTask.notes)}`} className="font-bold text-blue-600">
                                {getPlateFromNotes(rightTask.notes)} (Özel)
                              </option>
                            )}
                            {vehicles.map((v: any) => (
                              <option key={v.id} value={v.id}>
                                {v.plate} — {v.driverName}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={`p-1.5 text-center font-bold bg-amber-50/10 dark:bg-amber-950/10 ${rightCancelled ? "text-rose-700/60 bg-rose-50/20 line-through dark:text-rose-400/50 dark:bg-rose-950/10" : "text-amber-600"}`}>
                          {format(new Date(rightTask.scheduledTime), "HH:mm")}
                        </td>
                        <td className={`p-1.5 font-medium truncate max-w-[180px] ${rightCancelled ? "opacity-60 line-through text-rose-900/80 bg-rose-50/20 dark:text-rose-400/60 dark:bg-rose-950/10" : ""}`} title={rightTask.dropoffLocation}>
                          {rightTask.dropoffLocation}
                        </td>
                        <td className={`p-1.5 font-medium truncate max-w-[100px] ${rightCancelled ? "opacity-60 line-through text-rose-900/80 bg-rose-50/20 dark:text-rose-400/60 dark:bg-rose-950/10" : "text-muted-foreground"}`} title={rightTask.notes ?? ""}>
                          {rightTask.notes && (rightTask.notes.includes("CPT") || rightTask.notes.includes("KBN") || rightTask.notes.toLowerCase().includes("cpt") || rightTask.notes.toLowerCase().includes("kbn"))
                            ? (rightTask.notes.includes(" | Plaka:") ? rightTask.notes.split(" | Plaka:")[0] : rightTask.notes)
                            : `${rightTask.passengerCount} kişi`}
                        </td>
                        <td className={`p-1 ${rightCancelled ? "bg-rose-50/10 dark:bg-rose-950/10 opacity-60" : ""}`}>
                          <input
                            type="number"
                            min={0}
                            disabled={rightCancelled}
                            className="w-full bg-transparent p-1 text-center font-bold focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 rounded transition-all duration-150"
                            defaultValue={rightTask.km != null ? Number(rightTask.km) : ""}
                            placeholder="KM"
                            onBlur={(e) => handleKmChange(rightTask.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                            }}
                          />
                        </td>
                      </>
                    ) : (
                      <td colSpan={6} className="bg-slate-50/10"></td>
                    )}
                  </tr>
                );
              })}
              {maxRegularRows === 0 && (
                <tr>
                  <td colSpan={14} className="p-8 text-center text-muted-foreground">
                    Seçilen güne ait düzenli sefer kaydı bulunmamaktadır.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Extras side-by-side spreadsheet ───────────────────────────── */}
      <Card className="overflow-hidden border-slate-200/80 shadow-sm max-h-[300px] flex flex-col">
        <div className="p-3 border-b bg-card shrink-0 flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
              EKSTRA GİDER (OTEL / AÇIKLAMA)
            </Badge>
            <span className="text-muted-foreground text-xs">&bull;</span>
            <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300">
              EKSTRA GELİR (OTEL / AÇIKLAMA)
            </Badge>
          </h3>
          <span className="text-xs font-mono text-muted-foreground">
            Toplam: {leftExtras.length + rightExtras.length} Ekstra
          </span>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-xs font-mono">
            <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-20 border-b shadow-[0_1px_0_rgba(0,0,0,0.05)]">
              <tr className="divide-x divide-y divide-border">
                {/* Left Extras Header */}
                <th className="bg-amber-500/5 text-amber-800 font-bold p-2 text-center w-12">S.NO</th>
                <th className="bg-amber-500/5 text-amber-800 font-bold p-2 text-center w-16">SAAT</th>
                <th className="bg-amber-500/5 text-amber-800 font-bold p-2 text-left min-w-[150px]">PLAKA (SÜRÜCÜ)</th>
                <th className="bg-amber-500/5 text-amber-800 font-bold p-2 text-left min-w-[280px]">OTEL / AÇIKLAMA</th>

                {/* Separation Column */}
                <th className="bg-slate-100 dark:bg-slate-800 p-2 w-2"></th>

                {/* Right Extras Header */}
                <th className="bg-emerald-500/5 text-emerald-800 font-bold p-2 text-center w-16">SAAT</th>
                <th className="bg-emerald-500/5 text-emerald-800 font-bold p-2 text-left min-w-[150px]">PLAKA (SÜRÜCÜ)</th>
                <th className="bg-emerald-500/5 text-emerald-800 font-bold p-2 text-left min-w-[280px]">OTEL / AÇIKLAMA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Array.from({ length: maxExtraRows }).map((_, idx) => {
                const leftExtra = leftExtras[idx] as ExtendedTask | undefined;
                const rightExtra = rightExtras[idx] as ExtendedTask | undefined;
                const leftExtraCancelled = leftExtra?.status === "cancelled";
                const rightExtraCancelled = rightExtra?.status === "cancelled";

                return (
                  <tr key={idx} className="divide-x divide-border hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                    {/* Left Extras Cells */}
                    {leftExtra ? (
                      <>
                        <td className={`p-1.5 text-center font-bold ${leftExtraCancelled ? "bg-rose-50/40 text-rose-700/60 line-through dark:bg-rose-950/20 dark:text-rose-400/50" : "text-muted-foreground bg-slate-50/50 dark:bg-slate-900/10"}`}>{idx + 1}</td>
                        <td className={`p-1.5 text-center font-bold bg-amber-50/10 ${leftExtraCancelled ? "text-rose-700/60 bg-rose-50/20 line-through dark:text-rose-400/50 dark:bg-rose-950/10" : "text-amber-600"}`}>
                          {format(new Date(leftExtra.scheduledTime), "HH:mm")}
                        </td>
                        <td className={`p-1 ${leftExtraCancelled ? "bg-rose-50/20 dark:bg-rose-950/10" : ""}`}>
                          <select
                            className={`w-full bg-transparent p-1 font-semibold focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 cursor-pointer rounded transition-all duration-150 ${leftExtraCancelled ? "text-rose-700 dark:text-rose-400 opacity-80" : "text-primary"}`}
                            value={leftExtra.status === "cancelled" ? "cancelled" : (leftExtra.vehicleId ?? (getPlateFromNotes(leftExtra.notes) ? `custom:${getPlateFromNotes(leftExtra.notes)}` : ""))}
                            onChange={(e) => handlePlateChange(leftExtra, e.target.value)}
                          >
                            <option value="">Plaka Seçin...</option>
                            <option value="cancelled" className="text-red-600 font-bold">İPTAL</option>
                            <option value="custom_prompt" className="text-blue-600 font-bold">✍️ Özel Plaka Yaz...</option>
                            {leftExtra.vehicleId === null && getPlateFromNotes(leftExtra.notes) && (
                              <option value={`custom:${getPlateFromNotes(leftExtra.notes)}`} className="font-bold text-blue-600">
                                {getPlateFromNotes(leftExtra.notes)} (Özel)
                              </option>
                            )}
                            {vehicles.map((v: any) => (
                              <option key={v.id} value={v.id}>
                                {v.plate} — {v.driverName}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={`p-1.5 font-medium truncate max-w-[280px] ${leftExtraCancelled ? "opacity-60 line-through text-rose-900/80 bg-rose-50/20 dark:text-rose-400/60 dark:bg-rose-950/10" : ""}`} title={leftExtra.pickupLocation}>
                          {leftExtra.pickupLocation}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-1.5 text-center text-muted-foreground bg-slate-50/50 dark:bg-slate-900/10 font-bold">{idx + 1}</td>
                        <td colSpan={3} className="bg-slate-50/10"></td>
                      </>
                    )}

                    {/* Separator Column */}
                    <td className="bg-slate-100 dark:bg-slate-800 p-0"></td>

                    {/* Right Extras Cells */}
                    {rightExtra ? (
                      <>
                        <td className={`p-1.5 text-center font-bold bg-emerald-50/10 ${rightExtraCancelled ? "text-rose-700/60 bg-rose-50/20 line-through dark:text-rose-400/50 dark:bg-rose-950/10" : "text-emerald-600"}`}>
                          {format(new Date(rightExtra.scheduledTime), "HH:mm")}
                        </td>
                        <td className={`p-1 ${rightExtraCancelled ? "bg-rose-50/20 dark:bg-rose-950/10" : ""}`}>
                          <select
                            className={`w-full bg-transparent p-1 font-semibold focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 cursor-pointer rounded transition-all duration-150 ${rightExtraCancelled ? "text-rose-700 dark:text-rose-400 opacity-80" : "text-primary"}`}
                            value={rightExtra.status === "cancelled" ? "cancelled" : (rightExtra.vehicleId ?? (getPlateFromNotes(rightExtra.notes) ? `custom:${getPlateFromNotes(rightExtra.notes)}` : ""))}
                            onChange={(e) => handlePlateChange(rightExtra, e.target.value)}
                          >
                            <option value="">Plaka Seçin...</option>
                            <option value="cancelled" className="text-red-600 font-bold">İPTAL</option>
                            <option value="custom_prompt" className="text-blue-600 font-bold">✍️ Özel Plaka Yaz...</option>
                            {rightExtra.vehicleId === null && getPlateFromNotes(rightExtra.notes) && (
                              <option value={`custom:${getPlateFromNotes(rightExtra.notes)}`} className="font-bold text-blue-600">
                                {getPlateFromNotes(rightExtra.notes)} (Özel)
                              </option>
                            )}
                            {vehicles.map((v: any) => (
                              <option key={v.id} value={v.id}>
                                {v.plate} — {v.driverName}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={`p-1.5 font-medium truncate max-w-[280px] ${rightExtraCancelled ? "opacity-60 line-through text-rose-900/80 bg-rose-50/20" : ""}`} title={rightExtra.pickupLocation}>
                          {rightExtra.pickupLocation}
                        </td>
                      </>
                    ) : (
                      <td colSpan={3} className="bg-slate-50/10"></td>
                    )}
                  </tr>
                );
              })}
              {maxExtraRows === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    Seçilen güne ait ekstra sefer kaydı bulunmamaktadır.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
