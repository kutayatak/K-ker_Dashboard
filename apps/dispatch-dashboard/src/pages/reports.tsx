import { useState, useMemo, useRef } from "react";
import {
  useListAccountingRecords,
  useGetAccountingSummary,
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
  Car,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Milestone,
  Award,
  Calendar,
  PieChart,
  ArrowRightLeft,
  X,
  Trash2,
  ListChecks,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// Read HH:mm from the UTC ISO string to avoid local-timezone (+3h) offset.
const utcTime = (iso: string) => iso?.substring(11, 16) ?? "--:--";

const formatDisplayPlate = (plate: string): string => {
  const clean = plate.trim();
  // If it starts with S or C followed immediately by digits (allowing spaces), e.g. S25393 or S 25393 -> S 25393
  const match = clean.match(/^([SC])\s*(\d+)$/i);
  if (match) {
    return `${match[1].toUpperCase()} ${match[2]}`;
  }
  return clean.toUpperCase();
};

const normalizeForMap = (plate: string): string => {
  return plate.replace(/[\s\-\.]/g, "").toUpperCase();
};

export function Reports() {
  const [activeTab, setActiveTab] = useState<
    "analytics" | "accounting" | "technical"
  >("analytics");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [retypeTask, setRetypeTask] = useState<any | null>(null); // task pending retype confirm
  const [taskToDelete, setTaskToDelete] = useState<any | null>(null);
  const [confirmDeleteCheckbox, setConfirmDeleteCheckbox] = useState(false);
  const [platesToDelete, setPlatesToDelete] = useState<string[]>([]);
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);
  const [cleanupMode, setCleanupMode] = useState(false);
  const [selectedPlates, setSelectedPlates] = useState<string[]>([]);
  const [activeEsnafFilter, setActiveEsnafFilter] = useState<string | null>(null);
  const [excludedPlates, setExcludedPlates] = useState<string[]>(() => {
    try {
      const val = localStorage.getItem("excluded_esnaf_plates");
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  });

  const pressTimerRef = useRef<any>(null);
  const isLongPressRef = useRef(false);

  const handlePressStart = (plate: string) => {
    if (cleanupMode) return;
    isLongPressRef.current = false;
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setPlatesToDelete([plate]);
      setConfirmCheckbox(false);
    }, 700);
  };

  const togglePlateSelection = (plate: string) => {
    setSelectedPlates((prev) =>
      prev.includes(plate)
        ? prev.filter((p) => p !== plate)
        : [...prev, plate]
    );
  };

  const handlePressEnd = (plate: string) => {
    if (cleanupMode) {
      togglePlateSelection(plate);
      return;
    }
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (!isLongPressRef.current) {
      setActiveEsnafFilter(activeEsnafFilter === plate ? null : plate);
    }
  };

  const handleExcludePlates = (plates: string[]) => {
    const updated = [...excludedPlates, ...plates];
    setExcludedPlates(updated);
    localStorage.setItem("excluded_esnaf_plates", JSON.stringify(updated));
    setPlatesToDelete([]);
    setConfirmCheckbox(false);
    setSelectedPlates([]);
    
    const normalizedPlatesToExclude = new Set(plates.map((p) => normalizeForMap(p)));
    if (activeEsnafFilter && normalizedPlatesToExclude.has(normalizeForMap(activeEsnafFilter))) {
      setActiveEsnafFilter(null);
    }
  };

  const handleResetExcluded = () => {
    setExcludedPlates([]);
    localStorage.removeItem("excluded_esnaf_plates");
  };

  const queryClient = useQueryClient();
  const updateTaskMutation = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();

  // Fetch detailed accounting records
  const {
    data: records = [],
    isLoading,
    refetch: refetchAccounting,
  } = useListAccountingRecords(
    {},
    { query: { queryKey: ["/api/accounting"] } },
  );

  // Fetch summary by vehicle
  const { data: summary = [] } = useGetAccountingSummary({
    query: { queryKey: ["/api/accounting/summary"] },
  });

  // Fetch all tasks for dynamic client-side analytics
  const {
    data: tasks = [],
    isPending: tasksPending,
    refetch: refetchTasks,
  } = useListTasks({}, { query: { queryKey: getListTasksQueryKey() } });

  const { data: vehicles = [] } = useListVehicles(
    {},
    { query: { queryKey: ["/api/vehicles"] } },
  );

  /**
   * Resolve a task's "effective" vehicle name and plate.
   * Priority: vehicleName from DB → match plate in notes against vehicle list → raw note plate → fallback.
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
      // Known plate text but couldn't match → show the raw plate (not "Plakasız")
      return { name: notePlate, plate: notePlate, driver: "Belirtilmedi" };
    }
    return { name: "Plakasız / Diğer", plate: "—", driver: "Belirtilmedi" };
  };

  const handleRefresh = () => {
    refetchAccounting();
    refetchTasks();
  };

  // ── Analytics & KPI calculations ──────────────────────────────────────────
  const completedTasks = tasks.filter((t) => t.status === "completed");
  const cancelledTasks = tasks.filter((t) => t.status === "cancelled");

  const totalCompleted = completedTasks.length;
  const totalCancelled = cancelledTasks.length;
  const cancellationRate =
    tasks.length > 0 ? (totalCancelled / tasks.length) * 100 : 0;

  const totalKm = completedTasks.reduce(
    (sum, t) => sum + Number((t as any).km ?? 0),
    0,
  );
  const avgKm =
    totalCompleted > 0 ? (totalKm / totalCompleted).toFixed(1) : "0";

  // Task type breakdown
  const typeCounts = completedTasks.reduce(
    (acc, t) => {
      acc[t.type] = (acc[t.type] ?? 0) + 1;
      return acc;
    },
    { hotel_pickup: 0, airport_run: 0, extra: 0, technical: 0 } as Record<
      string,
      number
    >,
  );

  const typePercentages = {
    hotel_pickup:
      totalCompleted > 0
        ? ((typeCounts.hotel_pickup || 0) / totalCompleted) * 100
        : 0,
    airport_run:
      totalCompleted > 0
        ? ((typeCounts.airport_run || 0) / totalCompleted) * 100
        : 0,
    extra:
      totalCompleted > 0 ? ((typeCounts.extra || 0) / totalCompleted) * 100 : 0,
    technical:
      totalCompleted > 0
        ? ((typeCounts.technical || 0) / totalCompleted) * 100
        : 0,
  };

  // Leaderboard: Vehicles with the most completed trips
  const vehicleStats = completedTasks.reduce(
    (acc, t) => {
      const { name, driver } = resolveVehicle(t);
      const key = name;
      if (!acc[key]) {
        acc[key] = { tripCount: 0, totalKm: 0, driver };
      }
      acc[key].tripCount += 1;
      acc[key].totalKm += Number((t as any).km ?? 0);
      return acc;
    },
    {} as Record<
      string,
      { tripCount: number; totalKm: number; driver: string }
    >,
  );

  const vehicleLeaderboard = Object.entries(vehicleStats)
    .map(([plate, stats]) => ({ plate, ...stats }))
    .sort((a, b) => b.tripCount - a.tripCount)
    .slice(0, 5); // top 5 vehicles

  const topVehicle = vehicleLeaderboard[0];

  // Daily statistics for completed trips & distance (last 7 active days)
  const dailyStats = completedTasks.reduce(
    (acc, t) => {
      const day = t.scheduledTime.substring(0, 10); // UTC date, e.g. "2026-05-01"
      if (!acc[day]) {
        acc[day] = { tripCount: 0, totalKm: 0 };
      }
      acc[day].tripCount += 1;
      acc[day].totalKm += Number((t as any).km ?? 0);
      return acc;
    },
    {} as Record<string, { tripCount: number; totalKm: number }>,
  );

  const dailyHistory = Object.entries(dailyStats)
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7);

  // Maximum daily KM for scaling visual bar charts
  const maxDailyKm = Math.max(...dailyHistory.map((d) => d.totalKm), 1);
  const maxVehicleTrips = Math.max(
    ...vehicleLeaderboard.map((v) => v.tripCount),
    1,
  );

  // Helpers and filters for technical tasks
  const getExpenseCode = (task: any) => {
    const text = `${task.pickupLocation || ""} ${task.notes || ""}`;
    const match = text.match(
      /(msrf-?\d+)|(?:masraf\s+kodu|masraf\s+kod|masraf|kod)[\s:]*([A-Za-z0-9-]+)/i,
    );
    if (match) {
      return (match[1] || match[2] || match[0]).toUpperCase();
    }
    return "-";
  };

  const technicalTasks = tasks.filter((t) => t.type === "technical");

  const months = Array.from(
    new Set(
      tasks.map((t) => t.scheduledTime.substring(0, 7)), // UTC month "YYYY-MM"
    ),
  ).sort((a, b) => b.localeCompare(a));

  const isEsnafTask = (t: any) => {
    if (t.type === "technical") return false;

    // Check if vehicle type is outsource
    if (t.vehicleId) {
      const v = vehicles.find((veh) => veh.id === t.vehicleId);
      if (v?.type === "outsource") return true;
    }

    const resolved = resolveVehicle(t);
    const plate = resolved.plate ? resolved.plate.trim().toUpperCase() : "";
    const name = resolved.name ? resolved.name.trim().toUpperCase() : "";

    const normalizedPlate = plate.replace(/[\s\-\.]/g, "");
    const normalizedName = name.replace(/[\s\-\.]/g, "");

    const startsWithSOrC = (str: string) => {
      return /^[SC]/i.test(str);
    };

    if (startsWithSOrC(normalizedPlate) || startsWithSOrC(normalizedName)) {
      return true;
    }

    const notePlate = extractPlateFromNotes(t.notes);
    if (notePlate) {
      const normalizedNotePlate = notePlate.replace(/[\s\-\.]/g, "").toUpperCase();
      if (startsWithSOrC(normalizedNotePlate)) {
        return true;
      }
    }

    return false;
  };

  const normalizedExcludedPlates = useMemo(() => {
    return new Set(excludedPlates.map((p) => normalizeForMap(p)));
  }, [excludedPlates]);

  const esnafRecords = useMemo(() => {
    return tasks
      .filter((t) => t.status === "completed" && isEsnafTask(t))
      .map((t) => {
        const rv = resolveVehicle(t);
        return {
          id: t.id,
          date: t.scheduledTime,
          vehicleId: t.vehicleId ?? -1,
          vehicleName: rv.plate || rv.name || "Esnaf",
          taskId: t.id,
          amount: Number(t.fee || 0),
          notes: t.notes,
        };
      })
      .filter((r) => !normalizedExcludedPlates.has(normalizeForMap(r.vehicleName)));
  }, [tasks, vehicles, normalizedExcludedPlates]);

  const filteredRecords = useMemo(() => {
    return esnafRecords.filter((r) => {
      const monthStr = r.date.substring(0, 7); // YYYY-MM
      const matchesMonth = selectedMonth === "all" || monthStr === selectedMonth;

      const query = searchQuery.toLowerCase().trim();
      const vInfo = vehicles.find((v) => v.id === r.vehicleId);
      const textToSearch = `${r.vehicleName || ""} ${vInfo?.driverName || ""} ${r.notes || ""} #görev_${r.taskId}`.toLowerCase();
      const matchesQuery = !query || textToSearch.includes(query);

      return matchesMonth && matchesQuery;
    });
  }, [esnafRecords, selectedMonth, searchQuery, vehicles]);

  const outsourceVehicleSummaries = useMemo(() => {
    const map = new Map<string, { vehicleId: number; vehicleName: string; driverName: string; totalRevenue: number; tripCount: number }>();
    
    // Populate from filtered records
    filteredRecords.forEach((r) => {
      const normalizedKey = normalizeForMap(r.vehicleName);
      const displayPlate = formatDisplayPlate(r.vehicleName);
      
      const existing = map.get(normalizedKey);
      if (existing) {
        existing.totalRevenue += Number(r.amount);
        existing.tripCount += 1;
      } else {
        const vInfo = vehicles.find((v) => v.id === r.vehicleId);
        map.set(normalizedKey, {
          vehicleId: r.vehicleId,
          vehicleName: displayPlate,
          driverName: vInfo?.driverName || "Esnaf Sürücü",
          totalRevenue: Number(r.amount),
          tripCount: 1,
        });
      }
    });

    // Convert to array and sort by tripCount descending
    return Array.from(map.values())
      .sort((a, b) => b.tripCount - a.tripCount);
  }, [filteredRecords, vehicles]);

  const tableRecords = useMemo(() => {
    let result = filteredRecords;
    if (activeEsnafFilter) {
      const normFilter = normalizeForMap(activeEsnafFilter);
      result = result.filter((r) => normalizeForMap(r.vehicleName) === normFilter);
    }
    return [...result].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredRecords, activeEsnafFilter]);

  const filteredTechnicalTasks = technicalTasks
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

  // CSV Export for Esnaf Sefer Listesi
  const exportToCSV = () => {
    if (!filteredRecords.length) return;
    const headers = ["ID", "Tarih", "Araç / Plaka", "Sürücü", "Görev ID", "Özel Notlar"];
    const rows = filteredRecords.map((r) => {
      const vInfo = vehicles.find((v) => v.id === r.vehicleId);
      const displayPlate = formatDisplayPlate(r.vehicleName);
      return [
        r.id,
        format(new Date(r.date), "yyyy-MM-dd HH:mm"),
        displayPlate,
        vInfo?.driverName || "Belirtilmedi",
        r.taskId,
        r.notes || "",
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
      `esnaf_sefer_listesi_${selectedMonth}_${format(new Date(), "yyyyMMdd")}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Export for technical tasks
  const exportTechnicalToCSV = () => {
    if (!filteredTechnicalTasks.length) return;
    const headers = [
      "Tarih",
      "Saat",
      "Araç / Plaka",
      "Sürücü",
      "Nereden",
      "Nereye",
      "Kişi Bilgisi",
      "Masraf Kodu",
      "Durum",
    ];
    const rows = filteredTechnicalTasks.map((t) => {
      const rv = resolveVehicle(t);
      return [
        t.scheduledTime.substring(0, 10), // UTC date for CSV
        utcTime(t.scheduledTime),
        rv.plate || "Atanmadı",
        rv.driver || "Belirtilmedi",
        t.pickupLocation,
        t.dropoffLocation,
        t.notes &&
        (t.notes.includes("CPT") ||
          t.notes.includes("KBN") ||
          t.notes.toLowerCase().includes("cpt") ||
          t.notes.toLowerCase().includes("kbn"))
          ? t.notes.includes(" | Plaka:")
            ? t.notes.split(" | Plaka:")[0]
            : t.notes
          : `${t.passengerCount} Kişi`,
        getExpenseCode(t),
        t.status === "draft"
          ? "Taslak"
          : t.status === "assigned"
            ? "Bildirildi"
            : t.status === "in_progress"
              ? "Yolda"
              : t.status === "completed"
                ? "Tamamlandı"
                : "İptal",
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
      `teknik_isler_raporu_${selectedMonth}_${format(new Date(), "yyyyMMdd")}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-full w-full min-w-0 flex flex-col gap-4 overflow-x-hidden">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight leading-tight">
            Muhasebe & Analitik Raporlar
          </h1>
          <p className="text-muted-foreground text-xs md:text-sm">
            Filo verimlilik istatistikleri, sefer rasyoları ve finansal çıktılar
          </p>
        </div>

        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2 w-full lg:w-auto">
          <div className="flex items-center gap-2 w-full lg:w-auto justify-between lg:justify-start">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={tasksPending || isLoading}
            >
              <RefreshCw
                className={`w-4 h-4 ${tasksPending || isLoading ? "animate-spin" : ""}`}
              />
              <span className="hidden md:inline ml-1.5">Yenile</span>
            </Button>

            {activeTab === "accounting" && (
              <Button
                onClick={exportToCSV}
                variant="outline"
                size="sm"
                className="shadow-sm border-slate-200"
              >
                <Download className="w-4 h-4 mr-2" /> Esnaf CSV Aktar
              </Button>
            )}

            {activeTab === "technical" && (
              <Button
                onClick={exportTechnicalToCSV}
                variant="outline"
                size="sm"
                className="shadow-sm border-slate-200"
              >
                <Download className="w-4 h-4 mr-2" /> Teknik CSV Aktar
              </Button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row bg-muted p-1 rounded-lg border border-slate-100 dark:border-slate-800 shrink-0 w-full lg:w-auto gap-1">
            <Button
              variant={activeTab === "analytics" ? "default" : "ghost"}
              size="sm"
              className="h-8 sm:h-7 px-3 text-xs w-full sm:w-auto shrink-0"
              onClick={() => setActiveTab("analytics")}
            >
              Analitik Görünüm
            </Button>
            <Button
              variant={activeTab === "accounting" ? "default" : "ghost"}
              size="sm"
              className="h-8 sm:h-7 px-3 text-xs w-full sm:w-auto shrink-0"
              onClick={() => setActiveTab("accounting")}
            >
              Esnaf Sefer Listesi
            </Button>
            <Button
              variant={activeTab === "technical" ? "default" : "ghost"}
              size="sm"
              className="h-8 sm:h-7 px-3 text-xs w-full sm:w-auto shrink-0"
              onClick={() => setActiveTab("technical")}
            >
              Teknik İşler Raporu
            </Button>
          </div>
        </div>
      </div>

      {activeTab !== "analytics" && (
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between mb-2 bg-muted/40 p-3 rounded-lg border border-border/50 shrink-0 shadow-xs select-none">
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
      )}

      {activeTab === "analytics" ? (
        <div className="flex-1 space-y-4 overflow-y-auto pr-1 pb-12 select-none scrollbar-none">
          {/* ── KPI Grid ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Toplam Yapılan Yol */}
            <Card className="shadow-xs hover:shadow-md transition-all duration-200 border-slate-100 dark:border-slate-800">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Toplam Mesafe
                  </p>
                  <h3 className="text-2xl font-bold tracking-tight text-foreground">
                    {totalKm}{" "}
                    <span className="text-sm font-medium text-muted-foreground">
                      KM
                    </span>
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Ort. sefer mesafesi:{" "}
                    <span className="font-semibold text-primary">
                      {avgKm} KM
                    </span>
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                  <Milestone className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            {/* KPI 2: En Aktif Araç */}
            <Card className="shadow-xs hover:shadow-md transition-all duration-200 border-slate-100 dark:border-slate-800">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    En Çok Sefer Yapan
                  </p>
                  <h3
                    className="text-lg font-bold tracking-tight truncate max-w-[150px]"
                    title={topVehicle ? topVehicle.plate : "Bulunmuyor"}
                  >
                    {topVehicle ? topVehicle.plate : "Bulunmuyor"}
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Sefer adedi:{" "}
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {topVehicle ? `${topVehicle.tripCount} sefer` : "-"}
                    </span>
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                  <Award className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            {/* KPI 3: Tamamlanan Seferler */}
            <Card className="shadow-xs hover:shadow-md transition-all duration-200 border-slate-100 dark:border-slate-800">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Tamamlanan Seferler
                  </p>
                  <h3 className="text-2xl font-bold tracking-tight text-foreground">
                    {totalCompleted}{" "}
                    <span className="text-sm font-medium text-muted-foreground">
                      sefer
                    </span>
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Aktif ve biten toplam iş adedi
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>

            {/* KPI 4: İptal Sıklığı */}
            <Card className="shadow-xs hover:shadow-md transition-all duration-200 border-slate-100 dark:border-slate-800">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    İptal Sefer Oranı
                  </p>
                  <h3 className="text-2xl font-bold tracking-tight text-foreground">
                    %{cancellationRate.toFixed(1)}
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    İptal olan toplam iş:{" "}
                    <span className="font-semibold text-red-500">
                      {totalCancelled} sefer
                    </span>
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/40 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                  <XCircle className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Two-Column Main Analytics ────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Daily History Chart Card */}
            <Card className="border-slate-100 dark:border-slate-800 shadow-sm">
              <CardHeader className="p-4 border-b">
                <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-wide text-muted-foreground">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  Günlük KM Analizi & Sefer Geçmişi
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {dailyHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-12">
                    Yeterli geçmiş gün verisi bulunmamaktadır.
                  </p>
                ) : (
                  dailyHistory.map((d, i) => {
                    const percentage = (d.totalKm / maxDailyKm) * 100;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between items-center text-xs font-mono">
                          <span className="font-semibold">
                            {format(new Date(d.date), "dd MMMM yyyy")}
                          </span>
                          <span className="text-muted-foreground">
                            {d.tripCount} sefer &bull;{" "}
                            <strong className="text-foreground">
                              {d.totalKm} KM
                            </strong>
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                          <div
                            className="bg-blue-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Vehicle Leaderboard Card */}
            <Card className="border-slate-100 dark:border-slate-800 shadow-sm">
              <CardHeader className="p-4 border-b">
                <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-wide text-muted-foreground">
                  <Car className="w-4 h-4 text-amber-500" />
                  En Çok İş Yapan Araçlar Liderlik Tablosu
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {vehicleLeaderboard.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-12">
                    Tabloyu oluşturmak için sefer verisi bulunmamaktadır.
                  </p>
                ) : (
                  vehicleLeaderboard.map((v, i) => {
                    const percentage = (v.tripCount / maxVehicleTrips) * 100;
                    return (
                      <div key={i} className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono bg-slate-100 dark:bg-slate-800 text-[10px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center">
                              #{i + 1}
                            </span>
                            <span className="font-mono font-bold tracking-wide text-primary">
                              {v.plate}
                            </span>
                            <span className="text-muted-foreground text-[10px]">
                              ({v.driver})
                            </span>
                          </div>
                          <span className="text-muted-foreground font-mono">
                            {v.tripCount} sefer &bull;{" "}
                            <strong>{v.totalKm} KM</strong>
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                          <div
                            className="bg-amber-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Task Type Distribution Card ────────────────────────────── */}
          <Card className="border-slate-100 dark:border-slate-800 shadow-sm">
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-wide text-muted-foreground">
                <PieChart className="w-4 h-4 text-emerald-500" />
                Sefer Türleri Dağılım Oranları
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <div className="flex flex-col gap-4">
                {/* Visual horizontal stack bar */}
                <div className="w-full h-4 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
                  {totalCompleted === 0 ? (
                    <div className="w-full h-full bg-slate-200 dark:bg-slate-800" />
                  ) : (
                    <>
                      <div
                        className="bg-blue-500 h-full transition-all duration-500"
                        style={{ width: `${typePercentages.hotel_pickup}%` }}
                        title={`Gelir Seferleri: %${typePercentages.hotel_pickup.toFixed(1)}`}
                      />
                      <div
                        className="bg-emerald-500 h-full transition-all duration-500"
                        style={{ width: `${typePercentages.airport_run}%` }}
                        title={`Gider Seferleri: %${typePercentages.airport_run.toFixed(1)}`}
                      />
                      <div
                        className="bg-amber-500 h-full transition-all duration-500"
                        style={{ width: `${typePercentages.extra}%` }}
                        title={`Ekstralar Seferleri: %${typePercentages.extra.toFixed(1)}`}
                      />
                      <div
                        className="bg-yellow-500 h-full transition-all duration-500"
                        style={{ width: `${typePercentages.technical}%` }}
                        title={`Teknik Seferler: %${typePercentages.technical.toFixed(1)}`}
                      />
                    </>
                  )}
                </div>

                {/* Legend list */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-mono mt-1">
                  {/* Gelir */}
                  <div className="flex items-center gap-2.5 p-2 border rounded-lg bg-card/40">
                    <span className="w-3 h-3 rounded bg-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Gelir (Havaalanına)
                      </div>
                      <div className="font-bold">
                        {typeCounts.hotel_pickup} sefer (%
                        {typePercentages.hotel_pickup.toFixed(1)})
                      </div>
                    </div>
                  </div>
                  {/* Gider */}
                  <div className="flex items-center gap-2.5 p-2 border rounded-lg bg-card/40">
                    <span className="w-3 h-3 rounded bg-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Gider (Havaalanından)
                      </div>
                      <div className="font-bold">
                        {typeCounts.airport_run} sefer (%
                        {typePercentages.airport_run.toFixed(1)})
                      </div>
                    </div>
                  </div>
                  {/* Ekstralar */}
                  <div className="flex items-center gap-2.5 p-2 border rounded-lg bg-card/40">
                    <span className="w-3 h-3 rounded bg-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Ekstralar Seferi
                      </div>
                      <div className="font-bold">
                        {typeCounts.extra} sefer (%
                        {typePercentages.extra.toFixed(1)})
                      </div>
                    </div>
                  </div>
                  {/* Teknik İşler */}
                  <div className="flex items-center gap-2.5 p-2 border rounded-lg bg-card/40">
                    <span className="w-3 h-3 rounded bg-yellow-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Teknik İşler
                      </div>
                      <div className="font-bold">
                        {typeCounts.technical || 0} sefer (%
                        {(typePercentages.technical || 0).toFixed(1)})
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : activeTab === "accounting" ? (
        <>
          {/* ── Excluded Plates & Filter resets & Cleanup Mode ── */}
          <div className="flex flex-wrap gap-2 items-center justify-between text-xs bg-muted/30 p-2.5 rounded-lg border select-none shrink-0 mb-1">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="font-semibold text-muted-foreground">Aktif Görünüm:</span>
              {activeEsnafFilter ? (
                <Badge variant="secondary" className="flex items-center gap-1.5 font-bold bg-primary/10 text-primary hover:bg-primary/15 border-none">
                  {formatDisplayPlate(activeEsnafFilter)} Gösteriliyor
                  <button
                    onClick={() => setActiveEsnafFilter(null)}
                    className="hover:text-red-500 rounded-full font-bold ml-1 text-[10px]"
                    title="Filtreyi Temizle"
                  >
                    ✕
                  </button>
                </Badge>
              ) : (
                <span className="text-muted-foreground italic font-normal text-[11px]">Tüm Esnaflar Listeleniyor</span>
              )}
              {excludedPlates.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] py-1 px-2 border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-red-950 dark:hover:bg-red-950/20 text-red-600 font-semibold"
                  onClick={handleResetExcluded}
                >
                  Gizlenen Plakaları Sıfırla ({excludedPlates.length} araç gizli)
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant={cleanupMode ? "default" : "outline"}
                size="sm"
                className={`h-7 px-3 text-xs font-semibold ${
                  cleanupMode
                    ? "bg-red-600 hover:bg-red-700 text-white border-none"
                    : "border-slate-200"
                }`}
                onClick={() => {
                  setCleanupMode(!cleanupMode);
                  setSelectedPlates([]);
                }}
              >
                <ListChecks className="w-3.5 h-3.5 mr-1" />
                {cleanupMode ? "Temizliği Kapat" : "Araç Temizleme Modu"}
              </Button>

              {cleanupMode && selectedPlates.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 px-3 text-xs font-bold bg-red-600 hover:bg-red-700 text-white animate-pulse"
                  onClick={() => {
                    setPlatesToDelete(selectedPlates);
                    setConfirmCheckbox(false);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Seçilenleri Gizle ({selectedPlates.length})
                </Button>
              )}
            </div>
          </div>

          {/* ── Esnaf Sefer Listesi Summary Cards ── */}
          <div className="flex overflow-x-auto md:grid md:grid-cols-4 lg:grid-cols-6 gap-3 shrink-0 select-none pb-2.5 md:pb-0 scrollbar-none snap-x snap-mandatory">
            {outsourceVehicleSummaries.map((s) => (
              <Card
                key={s.vehicleName}
                onMouseDown={() => handlePressStart(s.vehicleName)}
                onMouseUp={() => handlePressEnd(s.vehicleName)}
                onMouseLeave={() => {
                  if (pressTimerRef.current) {
                    clearTimeout(pressTimerRef.current);
                    pressTimerRef.current = null;
                  }
                }}
                onTouchStart={() => handlePressStart(s.vehicleName)}
                onTouchEnd={() => handlePressEnd(s.vehicleName)}
                className={`relative w-[135px] shrink-0 snap-start md:w-auto border-slate-100 dark:border-slate-800 shadow-sm bg-card hover:border-slate-200 dark:hover:border-slate-700 transition-all duration-200 cursor-pointer active:scale-95 touch-none ${
                  activeEsnafFilter === s.vehicleName
                    ? "ring-2 ring-primary bg-primary/5 border-primary/20"
                    : ""
                } ${
                  cleanupMode && selectedPlates.includes(s.vehicleName)
                    ? "ring-2 ring-red-500 bg-red-500/5 border-red-500/20"
                    : ""
                }`}
                title={
                  cleanupMode
                    ? "Seçmek/Seçimi kaldırmak için tıklayın"
                    : "Detaylı liste için tek tık, gizlemek için uzun basın"
                }
              >
                {cleanupMode && (
                  <div className="absolute top-2.5 right-2.5 pointer-events-none">
                    <Checkbox
                      checked={selectedPlates.includes(s.vehicleName)}
                      className="border-red-500 data-[state=checked]:bg-red-500 data-[state=checked]:text-white h-4 w-4"
                    />
                  </div>
                )}
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div>
                    <div
                      className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mb-1 truncate"
                      title={s.vehicleName}
                    >
                      {s.vehicleName}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-medium truncate">
                      {s.driverName}
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="text-xl font-extrabold text-primary tracking-tight">
                      {s.tripCount} Sefer
                    </div>
                    <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">
                      Tamamlanan Toplam İş
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── Esnaf Sefer List Table ── */}
          <Card className="flex-1 overflow-hidden flex flex-col border-slate-200/80 shadow-sm mt-2">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-auto flex-1 select-none">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Tarih
                    </TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Esnaf / Plaka
                    </TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Sürücü
                    </TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Görev ID
                    </TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Özel Notlar
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-12 text-muted-foreground"
                      >
                        Kayıtlar yükleniyor...
                      </TableCell>
                    </TableRow>
                  ) : tableRecords.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-12 text-muted-foreground"
                      >
                        Seçilen ayda tamamlanmış esnaf sefer kaydı bulunamadı.
                      </TableCell>
                    </TableRow>
                  ) : (
                    tableRecords.map((r) => {
                      const vInfo = vehicles.find((v) => v.id === r.vehicleId);
                      const displayPlate = formatDisplayPlate(r.vehicleName);
                      return (
                        <TableRow
                          key={r.id}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
                        >
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {format(new Date(r.date), "yyyy-MM-dd HH:mm")}
                          </TableCell>
                          <TableCell className="font-bold text-foreground">
                            {displayPlate}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {vInfo?.driverName || "Belirtilmedi"}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground text-xs">
                            #görev_{r.taskId}
                          </TableCell>
                          <TableCell
                            className="text-muted-foreground text-xs font-medium truncate max-w-[200px]"
                            title={r.notes ?? ""}
                          >
                            {r.notes || "-"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Card List View */}
            <div className="block md:hidden overflow-auto flex-1 select-none p-2 space-y-2">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground text-xs font-semibold">
                  Kayıtlar yükleniyor...
                </div>
              ) : tableRecords.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs font-semibold">
                  Seçilen ayda tamamlanmış esnaf sefer kaydı bulunamadı.
                </div>
              ) : (
                tableRecords.map((r) => {
                  const vInfo = vehicles.find((v) => v.id === r.vehicleId);
                  const displayPlate = formatDisplayPlate(r.vehicleName);
                  return (
                    <div
                      key={r.id}
                      className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-card hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-all space-y-1.5"
                    >
                      <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                        <span className="font-mono bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded font-semibold">
                          {format(new Date(r.date), "dd MMM yyyy HH:mm", { locale: tr })}
                        </span>
                        <span className="font-mono">#görev_{r.taskId}</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-sm text-foreground">{displayPlate}</span>
                        <span className="text-xs text-muted-foreground font-semibold">{vInfo?.driverName || "Belirtilmedi"}</span>
                      </div>
                      
                      {r.notes && (
                        <div className="text-[11px] text-muted-foreground bg-slate-50 dark:bg-slate-900/50 p-2 rounded leading-relaxed border border-slate-100/50 dark:border-slate-800/50 italic">
                          {r.notes}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </>
      ) : (
        <>

          {/* ── Teknik İşler Raporu Tablosu ── */}
          <Card className="flex-1 overflow-hidden flex flex-col border-slate-200/80 shadow-sm mt-1">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-auto flex-1 select-none">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Tarih
                    </TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Saat
                    </TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Araç / Plaka
                    </TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Sürücü
                    </TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Nereden (Açıklama)
                    </TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Nereye
                    </TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Kişi Bilgisi
                    </TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Masraf Kodu
                    </TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Durum
                    </TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase w-[100px]">
                      İşlem
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasksPending ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-center py-12 text-muted-foreground"
                      >
                        Görevler yükleniyor...
                      </TableCell>
                    </TableRow>
                  ) : filteredTechnicalTasks.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-center py-12 text-muted-foreground"
                      >
                        Kriterlere uygun teknik iş kaydı bulunamadı.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTechnicalTasks.map((t) => {
                      const costCode = getExpenseCode(t);
                      // Determine which extra category this task would move to
                      const extraDest = t.dropoffLocation?.includes("Gelir")
                        ? "Ekstra Gelir"
                        : "Ekstra Gider";
                      return (
                        <TableRow
                          key={t.id}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
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
                            {t.vehicleName || (
                              <span className="text-muted-foreground italic font-normal text-[11px]">
                                Atanmadı
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="font-medium text-foreground text-xs">
                            {t.driverName || (
                              <span className="text-muted-foreground italic font-normal text-[11px]">
                                Belirtilmedi
                              </span>
                            )}
                          </TableCell>
                          <TableCell
                            className="font-semibold text-foreground text-xs max-w-[200px] truncate"
                            title={t.pickupLocation}
                          >
                            {t.pickupLocation}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs font-semibold">
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-yellow-50/50 border-yellow-200 text-yellow-800 dark:bg-yellow-950/20 dark:border-yellow-900/40 dark:text-yellow-400"
                            >
                              {t.dropoffLocation}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className="text-muted-foreground text-xs font-medium max-w-[150px] truncate"
                            title={t.notes || ""}
                          >
                            {t.notes &&
                            (t.notes.includes("CPT") ||
                              t.notes.includes("KBN") ||
                              t.notes.toLowerCase().includes("cpt") ||
                              t.notes.toLowerCase().includes("kbn"))
                              ? t.notes.includes(" | Plaka:")
                                ? t.notes.split(" | Plaka:")[0]
                                : t.notes
                              : `${t.passengerCount} Kişi`}
                          </TableCell>
                          <TableCell className="font-mono font-bold text-xs">
                            {costCode !== "-" ? (
                              <Badge className="bg-amber-100 border border-amber-300 text-amber-800 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-400 font-extrabold text-[10px]">
                                {costCode}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground font-normal text-xs">
                                -
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {t.status === "draft" && (
                              <Badge className="bg-slate-100 hover:bg-slate-100 border border-slate-300 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 text-[10px] font-bold">
                                Taslak
                              </Badge>
                            )}
                            {t.status === "assigned" && (
                              <Badge className="bg-blue-50 hover:bg-blue-50 border border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-900 dark:text-blue-400 text-[10px] font-bold">
                                Bildirildi
                              </Badge>
                            )}
                            {t.status === "in_progress" && (
                              <Badge className="bg-amber-50 hover:bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-400 text-[10px] font-bold">
                                Yolda
                              </Badge>
                            )}
                            {t.status === "completed" && (
                              <Badge className="bg-emerald-50 hover:bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-900 dark:text-emerald-400 text-[10px] font-bold">
                                Tamamlandı
                              </Badge>
                            )}
                            {t.status === "cancelled" && (
                              <Badge className="bg-rose-50 hover:bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950 dark:border-rose-900 dark:text-rose-400 text-[10px] font-bold">
                                İptal
                              </Badge>
                            )}
                          </TableCell>
                          {/* ── Actions (Retype & Delete) ── */}
                          <TableCell className="text-xs">
                            <div className="flex gap-2 items-center">
                              <button
                                title="Ekstraya taşı"
                                onClick={() => setRetypeTask({ ...t, extraDest })}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40 transition-colors shrink-0"
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                                Ekstraya Taşı
                              </button>
                              <button
                                title="Görevi sil"
                                onClick={() => {
                                  setTaskToDelete(t);
                                  setConfirmDeleteCheckbox(false);
                                }}
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

            {/* Mobile Card List View */}
            <div className="block md:hidden overflow-auto flex-1 select-none p-2 space-y-2">
              {tasksPending ? (
                <div className="text-center py-8 text-muted-foreground text-xs font-semibold">
                  Görevler yükleniyor...
                </div>
              ) : filteredTechnicalTasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs font-semibold">
                  Kriterlere uygun teknik iş kaydı bulunamadı.
                </div>
              ) : (
                filteredTechnicalTasks.map((t) => {
                  const costCode = getExpenseCode(t);
                  const extraDest = t.dropoffLocation?.includes("Gelir")
                    ? "Ekstra Gelir"
                    : "Ekstra Gider";
                  return (
                    <div
                      key={t.id}
                      className="p-3.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-card hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-all space-y-2.5"
                    >
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="font-mono bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded font-semibold text-muted-foreground">
                          {format(new Date(t.scheduledTime), "dd MMM yyyy", { locale: tr })} &bull; <strong className="text-primary">{utcTime(t.scheduledTime)}</strong>
                        </span>
                        <div>
                          {t.status === "draft" && (
                            <Badge className="bg-slate-100 hover:bg-slate-100 border border-slate-300 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 text-[9px] font-bold py-0 h-4">
                              Taslak
                            </Badge>
                          )}
                          {t.status === "assigned" && (
                            <Badge className="bg-blue-50 hover:bg-blue-50 border border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-900 dark:text-blue-400 text-[9px] font-bold py-0 h-4">
                              Bildirildi
                            </Badge>
                          )}
                          {t.status === "in_progress" && (
                            <Badge className="bg-amber-50 hover:bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-400 text-[9px] font-bold py-0 h-4">
                              Yolda
                            </Badge>
                          )}
                          {t.status === "completed" && (
                            <Badge className="bg-emerald-50 hover:bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-900 dark:text-emerald-400 text-[9px] font-bold py-0 h-4">
                              Tamamlandı
                            </Badge>
                          )}
                          {t.status === "cancelled" && (
                            <Badge className="bg-rose-50 hover:bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950 dark:border-rose-900 dark:text-rose-400 text-[9px] font-bold py-0 h-4">
                              İptal
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-muted-foreground">Plaka / Sürücü:</span>
                          <span className="font-bold text-foreground font-mono">
                            {t.vehicleName || "Atanmadı"} ({t.driverName || "Belirtilmedi"})
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-start">
                          <span className="font-semibold text-muted-foreground shrink-0 mr-2">Nereden (Açıklama):</span>
                          <span className="font-semibold text-foreground text-right truncate max-w-[170px]" title={t.pickupLocation}>
                            {t.pickupLocation}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-muted-foreground">Nereye:</span>
                          <Badge variant="outline" className="text-[9px] bg-yellow-50/50 border-yellow-200 text-yellow-800 dark:bg-yellow-950/20 dark:border-yellow-900/40 dark:text-yellow-400 font-bold py-0 h-4">
                            {t.dropoffLocation}
                          </Badge>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-muted-foreground">Kişi / Masraf:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium text-muted-foreground">
                              {t.notes && (t.notes.includes("CPT") || t.notes.includes("KBN") || t.notes.toLowerCase().includes("cpt") || t.notes.toLowerCase().includes("kbn")) ? (t.notes.includes(" | Plaka:") ? t.notes.split(" | Plaka:")[0] : t.notes) : `${t.passengerCount} Kişi`}
                            </span>
                            {costCode !== "-" && (
                              <Badge className="bg-amber-100 border border-amber-300 text-amber-800 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-400 font-extrabold text-[9px] py-0 h-4">
                                {costCode}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 justify-end">
                        <button
                          onClick={() => setRetypeTask({ ...t, extraDest })}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400 transition-colors"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          Ekstraya Taşı
                        </button>
                        <button
                          onClick={() => {
                            setTaskToDelete(t);
                            setConfirmDeleteCheckbox(false);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/20 dark:border-rose-800 dark:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          Sil
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </>
      )}

      {/* ── Retype Confirm Dialog ─────────────────────────────────────────── */}
      <Dialog open={!!retypeTask} onOpenChange={(open) => { if (!open) setRetypeTask(null); }}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-amber-600" />
              Teknikten Ekstraya Taşı
            </DialogTitle>
          </DialogHeader>
          {retypeTask && (
            <div className="py-2 space-y-3">
              <p className="text-sm text-muted-foreground">
                Bu iş <span className="font-semibold text-foreground">Teknik</span>'ten{" "}
                <span className="font-semibold text-amber-700 dark:text-amber-400">Ekstra</span>'ya taşınacak.
                Bu işlem tüm raporları ve excel görünümünü etkiler.
              </p>
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div className="font-semibold truncate">{retypeTask.pickupLocation}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(retypeTask.scheduledTime), "dd MMMM yyyy", { locale: tr })}{" "}
                  {utcTime(retypeTask.scheduledTime)}
                </div>
                <div className="text-xs">
                  Teknik Gider/Gelir →{" "}
                  <span className="font-semibold text-amber-700 dark:text-amber-400">{retypeTask.extraDest}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRetypeTask(null)}>
              İptal
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={updateTaskMutation.isPending}
              onClick={() => {
                if (!retypeTask) return;
                updateTaskMutation.mutate(
                  {
                    id: retypeTask.id,
                    data: {
                      type: "extra",
                      dropoffLocation: retypeTask.extraDest,
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
              {updateTaskMutation.isPending ? "Güncelleniyor..." : "Evet, Ekstraya Taşı"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Plate Hide/Exclude Confirm Dialog ────────────────────────────── */}
      <Dialog
        open={platesToDelete.length > 0}
        onOpenChange={(open) => {
          if (!open) {
            setPlatesToDelete([]);
          } else {
            setConfirmCheckbox(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <X className="w-4 h-4 text-red-600" />
              {platesToDelete.length === 1 ? "Plakayı Görünümden Gizle" : "Plakaları Görünümden Gizle"}
            </DialogTitle>
          </DialogHeader>
          {platesToDelete.length > 0 && (
            <div className="py-2 space-y-4">
              <p className="text-sm text-muted-foreground">
                {platesToDelete.length === 1 ? (
                  <>
                    <span className="font-bold text-foreground">
                      {formatDisplayPlate(platesToDelete[0])}
                    </span>{" "}
                    plakalı araç Esnaf Sefer Listesi'nden tamamen gizlenecektir.
                  </>
                ) : (
                  <>
                    Seçilen <span className="font-bold text-foreground">{platesToDelete.length} adet araç</span> Esnaf Sefer Listesi'nden tamamen gizlenecektir.
                  </>
                )}
              </p>

              {platesToDelete.length > 1 && (
                <div className="max-h-24 overflow-y-auto border rounded bg-slate-50 dark:bg-slate-900/50 p-2 flex flex-wrap gap-1.5 scrollbar-thin">
                  {platesToDelete.map((p) => (
                    <Badge key={p} variant="outline" className="font-mono font-bold bg-white dark:bg-slate-800 text-[10px]">
                      {formatDisplayPlate(p)}
                    </Badge>
                  ))}
                </div>
              )}

              <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded p-2 font-semibold">
                ⚠️ Vardiya araçlarını veya istemediğiniz diğer esnaf gruplarını bu şekilde temizleyebilirsiniz. Gizlenen plakaları dilediğiniz zaman üstteki buton ile geri getirebilirsiniz.
              </p>

              <div className="flex items-center space-x-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Checkbox
                  id="confirm-hide-checkbox"
                  checked={confirmCheckbox}
                  onCheckedChange={(checked) => setConfirmCheckbox(!!checked)}
                />
                <Label
                  htmlFor="confirm-hide-checkbox"
                  className="text-xs font-semibold text-foreground cursor-pointer select-none leading-none"
                >
                  {platesToDelete.length === 1
                    ? "Bu plakayı listeden gizlemek istediğimi onaylıyorum"
                    : "Bu plakaları listeden gizlemek istediğimi onaylıyorum"
                  }
                </Label>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPlatesToDelete([])}>
              Vazgeç
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50"
              disabled={!confirmCheckbox}
              onClick={() => {
                if (platesToDelete.length > 0 && confirmCheckbox) {
                  handleExcludePlates(platesToDelete);
                }
              }}
            >
              Evet, Gizle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Technical Task Delete Confirm Dialog ─────────────────────────── */}
      <Dialog
        open={!!taskToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setTaskToDelete(null);
          } else {
            setConfirmDeleteCheckbox(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-600" />
              Teknik Görevi Sil
            </DialogTitle>
          </DialogHeader>
          {taskToDelete && (
            <div className="py-2 space-y-4">
              <p className="text-sm text-muted-foreground">
                Bu teknik görevi sistemden <span className="font-bold text-red-600 dark:text-red-400">kalıcı olarak silmek</span> istediğinize emin misiniz? Bu işlem geri alınamaz.
              </p>
              
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div className="font-semibold truncate">{taskToDelete.pickupLocation}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(taskToDelete.scheduledTime), "dd MMMM yyyy", { locale: tr })}{" "}
                  {utcTime(taskToDelete.scheduledTime)}
                </div>
                {taskToDelete.vehicleName && (
                  <div className="text-xs font-mono text-primary font-bold">
                    Plaka: {taskToDelete.vehicleName}
                  </div>
                )}
                {taskToDelete.notes && (
                  <div className="text-xs text-muted-foreground italic truncate">
                    Açıklama: {taskToDelete.notes}
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Checkbox
                  id="confirm-task-delete-checkbox"
                  checked={confirmDeleteCheckbox}
                  onCheckedChange={(checked) => setConfirmDeleteCheckbox(!!checked)}
                />
                <Label
                  htmlFor="confirm-task-delete-checkbox"
                  className="text-xs font-semibold text-foreground cursor-pointer select-none leading-none"
                >
                  Bu teknik görevi kalıcı olarak silmek istediğimi onaylıyorum
                </Label>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTaskToDelete(null)}>
              Vazgeç
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-50"
              disabled={!confirmDeleteCheckbox || deleteTaskMutation.isPending}
              onClick={() => {
                if (taskToDelete && confirmDeleteCheckbox) {
                  deleteTaskMutation.mutate(
                    { id: taskToDelete.id },
                    {
                      onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
                        setTaskToDelete(null);
                      },
                    },
                  );
                }
              }}
            >
              {deleteTaskMutation.isPending ? "Siliniyor..." : "Evet, Görevi Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
