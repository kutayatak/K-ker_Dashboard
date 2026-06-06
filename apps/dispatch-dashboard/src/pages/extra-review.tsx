import { useState, useMemo } from "react";
import {
  useListTasks,
  useListVehicles,
  useUpdateTask,
  useDeleteTask,
  getListTasksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { matchVehicleByPlate, extractPlateFromNotes } from "@/lib/plate-utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  RefreshCw,
  Sparkles,
  ArrowRightLeft,
  X,
  Trash2,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

// Read HH:mm from the UTC ISO string to avoid local-timezone (+3h) offset.
const utcTime = (iso: string) => iso?.substring(11, 16) ?? "--:--";

const formatDisplayPlate = (plate: string): string => {
  const clean = plate.trim();
  const match = clean.match(/^([SC])\s*(\d+)$/i);
  if (match) {
    return `${match[1].toUpperCase()} ${match[2]}`;
  }
  return clean.toUpperCase();
};

export function ExtraReview() {
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Dialog States
  const [retypeTask, setRetypeTask] = useState<any | null>(null); // task pending move to technical
  const [taskToDelete, setTaskToDelete] = useState<any | null>(null);

  const queryClient = useQueryClient();
  const updateTaskMutation = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();

  // Fetch all tasks and vehicles
  const {
    data: tasks = [],
    isPending: tasksPending,
    refetch: refetchTasks,
  } = useListTasks({}, { query: { queryKey: getListTasksQueryKey() } });

  const { data: vehicles = [] } = useListVehicles(
    {},
    { query: { queryKey: ["/api/vehicles"] } },
  );

  const handleRefresh = () => {
    refetchTasks();
  };

  /**
   * Resolve a task's "effective" vehicle name and plate.
   */
  const resolveVehicle = (
    t: any,
  ): { name: string; plate: string; driver: string } => {
    if (t.vehicleName) {
      return {
        name: t.vehicleName,
        plate: t.vehicleName,
        driver: t.driverName || "Belirtilmedi",
      };
    }
    const notePlate = extractPlateFromNotes(t.notes);
    if (notePlate) {
      const matched = matchVehicleByPlate(notePlate, vehicles as any[]);
      if (matched) {
        return {
          name: matched.plate,
          plate: matched.plate,
          driver: matched.driverName || "Belirtilmedi",
        };
      }
      return { name: notePlate, plate: notePlate, driver: "Belirtilmedi" };
    }
    return { name: "Plakasız / Diğer", plate: "—", driver: "Belirtilmedi" };
  };

  // Filter for Extra Tasks only, excluding blacklisted terms (VİP, AJET, YOLCU, İPTAL)
  const extraTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.type !== "extra") return false;

      const combined = `${t.pickupLocation || ""} ${t.dropoffLocation || ""} ${t.notes || ""} ${t.flightCode || ""}`.toLowerCase();
      const normalized = combined
        .replace(/i̇/g, "i") // combining dot i
        .replace(/ı/g, "i");  // dotless ı

      const blacklist = ["vip", "ajet", "yolcu", "iptal"];
      return !blacklist.some((word) => normalized.includes(word));
    });
  }, [tasks]);

  // Extract available months from extra tasks for the filter dropdown
  const months = useMemo(() => {
    return Array.from(
      new Set(
        extraTasks.map((t) => t.scheduledTime.substring(0, 7)), // UTC month "YYYY-MM"
      ),
    ).sort((a, b) => b.localeCompare(a));
  }, [extraTasks]);

  // Filtered Extra Tasks based on UI controls
  const filteredExtraTasks = useMemo(() => {
    return extraTasks
      .filter((t) => {
        const monthStr = t.scheduledTime.substring(0, 7); // UTC month "YYYY-MM"
        const matchesMonth =
          selectedMonth === "all" || monthStr === selectedMonth;

        const query = searchQuery.toLowerCase().trim();
        const textToSearch =
          `${t.pickupLocation || ""} ${t.dropoffLocation || ""} ${t.vehicleName || ""} ${t.driverName || ""} ${t.notes || ""}`.toLowerCase();
        const matchesQuery = !query || textToSearch.includes(query);

        return matchesMonth && matchesQuery;
      })
      .sort(
        (a, b) =>
          new Date(b.scheduledTime).getTime() -
          new Date(a.scheduledTime).getTime(),
      );
  }, [extraTasks, selectedMonth, searchQuery]);

  // CSV Export
  const exportToCSV = () => {
    if (!filteredExtraTasks.length) return;
    const headers = [
      "Tarih",
      "Saat",
      "Araç / Plaka",
      "Nereden",
      "Nereye (Yön)",
      "Özel Notlar",
    ];
    const rows = filteredExtraTasks.map((t) => {
      const rv = resolveVehicle(t);
      return [
        t.scheduledTime.substring(0, 10),
        utcTime(t.scheduledTime),
        rv.plate || "Atanmadı",
        t.pickupLocation,
        t.dropoffLocation,
        t.notes || "",
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    // Add UTF-8 BOM for Turkish character compatibility in Excel
    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `ekstra_isler_listesi_${selectedMonth}_${format(new Date(), "yyyyMMdd")}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-full w-full min-w-0 flex flex-col gap-4 overflow-x-hidden">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4 select-none">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight leading-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
            Ekstra İşler İnceleme Paneli
          </h1>
          <p className="text-muted-foreground text-xs md:text-sm">
            Tüm ekstra gelir ve gider seferlerinin listelenmesi, yönetimi ve tekniğe aktarılması
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={tasksPending}
          >
            <RefreshCw
              className={`w-4 h-4 ${tasksPending ? "animate-spin" : ""}`}
            />
            <span className="hidden md:inline ml-1.5">Yenile</span>
          </Button>

          <Button
            onClick={exportToCSV}
            variant="outline"
            size="sm"
            disabled={!filteredExtraTasks.length}
            className="shadow-sm border-border dark:border-slate-800"
          >
            <Download className="w-4 h-4 mr-2" /> Ekstra CSV Aktar
          </Button>
        </div>
      </div>


      {/* ── Filter Bar ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-muted/40 p-3 rounded-lg border border-border/50 shrink-0 shadow-xs select-none">
        <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1">
            Filtrele:
          </span>

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-background border border-input h-8 px-2 rounded-md text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
          >
            <option value="all">Tüm Aylar</option>
            {months.map((m) => {
              const [year, month] = m.split("-");
              const monthName = format(
                new Date(Number(year), Number(month) - 1, 1),
                "MMMM yyyy",
                { locale: tr },
              );
              return (
                <option key={m} value={m}>
                  {monthName}
                </option>
              );
            })}
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Plaka, sürücü, açıklama ara..."
            className="w-full bg-background border border-input h-8 pl-3 pr-8 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-primary placeholder-muted-foreground shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Desktop Table View ───────────────────────────────────────── */}
      <Card className="flex-1 min-h-0 border-slate-100 dark:border-slate-800 shadow-sm flex flex-col">
        <div className="hidden md:block overflow-auto flex-1 select-none">
          <div className="relative w-full">
            <Table>
              <TableHeader className="bg-slate-50/50 dark:bg-slate-900/30 sticky top-0 z-10 border-b">
                <TableRow>
                  <TableHead className="w-[120px] font-bold text-xs uppercase text-muted-foreground">Tarih</TableHead>
                  <TableHead className="w-[80px] font-bold text-xs uppercase text-muted-foreground">Saat</TableHead>
                  <TableHead className="w-[120px] font-bold text-xs uppercase text-muted-foreground">Araç / Plaka</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-muted-foreground">Nereden</TableHead>
                  <TableHead className="w-[130px] font-bold text-xs uppercase text-muted-foreground">Nereye (Yön)</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-muted-foreground">Özel Notlar</TableHead>
                  <TableHead className="w-[200px] text-right font-bold text-xs uppercase text-muted-foreground">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasksPending ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-xs font-semibold">
                      Görevler yükleniyor...
                    </TableCell>
                  </TableRow>
                ) : filteredExtraTasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                      Kriterlere uygun ekstra iş kaydı bulunamadı.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredExtraTasks.map((t) => {
                    const rv = resolveVehicle(t);
                    const techDest = t.dropoffLocation?.includes("Gelir")
                      ? "Teknik Gelir"
                      : "Teknik Gider";
                    return (
                      <TableRow
                        key={t.id}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors"
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {format(new Date(t.scheduledTime), "dd MMMM yyyy", {
                            locale: tr,
                          })}
                        </TableCell>
                        <TableCell className="font-bold text-foreground font-mono text-xs">
                          {utcTime(t.scheduledTime)}
                        </TableCell>
                        <TableCell className="font-bold text-primary font-mono text-xs">
                          {rv.plate !== "—" ? formatDisplayPlate(rv.plate) : (
                            <span className="text-muted-foreground italic font-normal text-[11px]">
                              Atanmadı
                            </span>
                          )}
                        </TableCell>
                        <TableCell
                          className="font-semibold text-foreground text-xs max-w-[160px] truncate"
                          title={t.pickupLocation}
                        >
                          {t.pickupLocation}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs font-semibold">
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-amber-50/50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/40 dark:text-amber-400"
                          >
                            {t.dropoffLocation}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="text-muted-foreground text-xs font-medium max-w-[180px] truncate"
                          title={t.notes || ""}
                        >
                          {t.notes || "-"}
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          <div className="flex gap-2 items-center justify-end">
                            <button
                              title="Tekniğe taşı"
                              onClick={() => setRetypeTask({ ...t, techDest })}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/20 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/40 transition-colors shrink-0"
                            >
                              <ArrowRightLeft className="w-3 h-3" />
                              Tekniğe Taşı
                            </button>
                            <button
                              title="Görevi sil"
                              onClick={() => setTaskToDelete(t)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/20 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/40 transition-colors shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Sil
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ── Mobile Card List View ───────────────────────────────────── */}
        <div className="block md:hidden overflow-auto flex-1 select-none p-2 space-y-2">
          {tasksPending ? (
            <div className="text-center py-8 text-muted-foreground text-xs font-semibold">
              Görevler yükleniyor...
            </div>
          ) : filteredExtraTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs font-semibold">
              Kriterlere uygun ekstra iş kaydı bulunamadı.
            </div>
          ) : (
            filteredExtraTasks.map((t) => {
              const rv = resolveVehicle(t);
              const techDest = t.dropoffLocation?.includes("Gelir")
                ? "Teknik Gelir"
                : "Teknik Gider";
              return (
                <div
                  key={t.id}
                  className="p-3.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-card hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-all space-y-2.5 shadow-xs"
                >
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-mono bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded font-semibold text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      {format(new Date(t.scheduledTime), "dd MMM yyyy", { locale: tr })} &bull; <strong className="text-primary">{utcTime(t.scheduledTime)}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs">
                    <div>
                      <span className="text-[10px] text-muted-foreground block">Nereden / Nereye:</span>
                      <span className="font-bold text-foreground truncate block">{t.pickupLocation}</span>
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold block">{t.dropoffLocation}</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-muted-foreground block">Araç / Plaka:</span>
                      <span className="font-bold text-primary block">
                        {rv.plate !== "—" ? formatDisplayPlate(rv.plate) : "Atanmadı"}
                      </span>
                    </div>

                    {t.notes && (
                      <div className="col-span-2 bg-muted/30 p-1.5 rounded text-[11px] text-muted-foreground border border-border/10">
                        <strong className="text-[10px] text-foreground block font-bold mb-0.5">Notlar:</strong>
                        {t.notes}
                      </div>
                    )}

                    <div className="col-span-2 flex justify-end items-center border-t border-dashed pt-2 mt-1">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setRetypeTask({ ...t, techDest })}
                          className="inline-flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-bold border border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:border-blue-800 dark:text-blue-400"
                        >
                          <ArrowRightLeft className="w-2.5 h-2.5" />
                          Tekniğe Taşı
                        </button>
                        <button
                          onClick={() => setTaskToDelete(t)}
                          className="inline-flex items-center justify-center p-1 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* ── Dialog: Retype Confirm (Ekstradan Tekniğe Taşı) ──────────────── */}
      <Dialog open={!!retypeTask} onOpenChange={(open) => { if (!open) setRetypeTask(null); }}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-blue-600" />
              Ekstradan Tekniğe Taşı
            </DialogTitle>
          </DialogHeader>
          {retypeTask && (
            <div className="py-2 space-y-3">
              <p className="text-sm text-muted-foreground">
                Bu iş <span className="font-semibold text-foreground">Ekstra</span>'dan{" "}
                <span className="font-semibold text-blue-600 dark:text-blue-400">Teknik</span>'e taşınacak.
                Bu işlem tüm raporları ve excel görünümünü etkiler.
              </p>
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div className="font-semibold truncate">{retypeTask.pickupLocation}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(retypeTask.scheduledTime), "dd MMMM yyyy", { locale: tr })}{" "}
                  {utcTime(retypeTask.scheduledTime)}
                </div>
                <div className="text-xs">
                  Ekstra Gider/Gelir →{" "}
                  <span className="font-semibold text-blue-600 dark:text-blue-400">{retypeTask.techDest}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRetypeTask(null)}>
              İptal
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={updateTaskMutation.isPending}
              onClick={() => {
                if (!retypeTask) return;
                updateTaskMutation.mutate(
                  {
                    id: retypeTask.id,
                    data: {
                      type: "technical",
                      dropoffLocation: retypeTask.techDest,
                    },
                  },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
                      setRetypeTask(null);
                    },
                  },
                );
              }}
            >
              {updateTaskMutation.isPending ? "Güncelleniyor..." : "Evet, Tekniğe Taşı"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Task Delete Confirm ─────────────────────────────────── */}
      <Dialog open={!!taskToDelete} onOpenChange={(open) => { if (!open) setTaskToDelete(null); }}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              Görevi Silmek İstiyor musunuz?
            </DialogTitle>
          </DialogHeader>
          {taskToDelete && (
            <div className="py-2 space-y-3">
              <p className="text-sm text-muted-foreground">
                Seçilen ekstra iş kaydı veritabanından kalıcı olarak silinecektir. Bu işlem geri alınamaz.
              </p>
              <div className="rounded-md border border-rose-100 bg-rose-50/20 p-3 text-sm space-y-1">
                <div className="font-semibold truncate text-foreground">{taskToDelete.pickupLocation}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(taskToDelete.scheduledTime), "dd MMMM yyyy", { locale: tr })}{" "}
                  {utcTime(taskToDelete.scheduledTime)}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTaskToDelete(null)}>
              Vazgeç
            </Button>
            <Button
              variant="destructive"
              className="bg-rose-600 hover:bg-rose-700 text-white"
              disabled={deleteTaskMutation.isPending}
              onClick={() => {
                if (!taskToDelete) return;
                deleteTaskMutation.mutate(
                  { id: taskToDelete.id },
                  {
                    onSuccess: () => {
                      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
                      setTaskToDelete(null);
                    },
                  },
                );
              }}
            >
              {deleteTaskMutation.isPending ? "Siliniyor..." : "Evet, Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
