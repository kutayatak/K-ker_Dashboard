import { useState } from "react";
import {
  useListAccountingRecords,
  useGetAccountingSummary,
  useListTasks,
  getListTasksQueryKey,
} from "@workspace/api-client-react";
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
} from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

// Read HH:mm from the UTC ISO string to avoid local-timezone (+3h) offset.
const utcTime = (iso: string) => iso?.substring(11, 16) ?? "--:--";

export function Reports() {
  const [activeTab, setActiveTab] = useState<
    "analytics" | "accounting" | "technical"
  >("analytics");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

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
      const key = t.vehicleName || `Plakasız / Diğer`;
      if (!acc[key]) {
        acc[key] = {
          tripCount: 0,
          totalKm: 0,
          driver: t.driverName || "Belirtilmedi",
        };
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
      const day = format(new Date(t.scheduledTime), "yyyy-MM-dd");
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
      technicalTasks.map((t) => format(new Date(t.scheduledTime), "yyyy-MM")),
    ),
  ).sort((a, b) => b.localeCompare(a));

  const filteredTechnicalTasks = technicalTasks
    .filter((t) => {
      const taskDate = new Date(t.scheduledTime);
      const monthStr = format(taskDate, "yyyy-MM");
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

  // CSV Export for accounting records
  const exportToCSV = () => {
    if (!records.length) return;
    const headers = ["ID", "Tarih", "Araç", "Görev ID", "Tutar", "Notlar"];
    const rows = records.map((r) => [
      r.id,
      format(new Date(r.date), "yyyy-MM-dd HH:mm"),
      r.vehicleName || `Araç ${r.vehicleId}`,
      r.taskId,
      r.amount,
      r.notes || "",
    ]);

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
      `koker_muhasebe_${format(new Date(), "yyyyMMdd")}.csv`,
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
    const rows = filteredTechnicalTasks.map((t) => [
      format(new Date(t.scheduledTime), "yyyy-MM-dd"),
      utcTime(t.scheduledTime),
      t.vehicleName || "Atanmadı",
      t.driverName || "Belirtilmedi",
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
    ]);

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
    <div className="h-full flex flex-col gap-4">
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

        <div className="flex items-center gap-2">
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
              <Download className="w-4 h-4 mr-2" /> CSV Dışa Aktar
            </Button>
          )}

          {activeTab === "technical" && (
            <Button
              onClick={exportTechnicalToCSV}
              variant="outline"
              size="sm"
              className="shadow-sm border-slate-200"
            >
              <Download className="w-4 h-4 mr-2" /> Teknik Rapor CSV Aktar
            </Button>
          )}

          <div className="flex bg-muted p-1 rounded-lg border border-slate-100 dark:border-slate-800 shrink-0">
            <Button
              variant={activeTab === "analytics" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setActiveTab("analytics")}
            >
              Analitik Görünüm
            </Button>
            <Button
              variant={activeTab === "accounting" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setActiveTab("accounting")}
            >
              Finansal Sefer Listesi
            </Button>
            <Button
              variant={activeTab === "technical" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setActiveTab("technical")}
            >
              Teknik İşler Raporu
            </Button>
          </div>
        </div>
      </div>

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
                        style={{ width: `${typePercentages.airport_run}%` }}
                        title={`Gelir Seferleri: %${typePercentages.airport_run.toFixed(1)}`}
                      />
                      <div
                        className="bg-emerald-500 h-full transition-all duration-500"
                        style={{ width: `${typePercentages.hotel_pickup}%` }}
                        title={`Gider Seferleri: %${typePercentages.hotel_pickup.toFixed(1)}`}
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
                        Gelir (Havalimanı)
                      </div>
                      <div className="font-bold">
                        {typeCounts.airport_run} sefer (%
                        {typePercentages.airport_run.toFixed(1)})
                      </div>
                    </div>
                  </div>
                  {/* Gider */}
                  <div className="flex items-center gap-2.5 p-2 border rounded-lg bg-card/40">
                    <span className="w-3 h-3 rounded bg-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Gider (Otel Alım)
                      </div>
                      <div className="font-bold">
                        {typeCounts.hotel_pickup} sefer (%
                        {typePercentages.hotel_pickup.toFixed(1)})
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
          {/* ── Financial Summary Cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
            {summary.map((s) => (
              <Card
                key={s.vehicleId}
                className="border-slate-100 dark:border-slate-800 shadow-sm"
              >
                <CardContent className="p-4">
                  <div
                    className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1 truncate"
                    title={s.vehicleName}
                  >
                    {s.vehicleName}
                  </div>
                  <div className="text-xl font-extrabold text-foreground">
                    ₺
                    {s.totalRevenue.toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                    {s.tripCount} tamamlanan sefer
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── Financial Sefer List Table ── */}
          <Card className="flex-1 overflow-hidden flex flex-col border-slate-200/80 shadow-sm mt-2">
            <div className="overflow-auto flex-1 select-none">
              <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Tarih
                    </TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Araç / Plaka
                    </TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Görev ID
                    </TableHead>
                    <TableHead className="font-semibold text-xs tracking-wider uppercase">
                      Hak Ediş Tutarı
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
                  ) : records.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-12 text-muted-foreground"
                      >
                        Herhangi bir tamamlanmış finansal hak ediş kaydı
                        bulunamadı.
                      </TableCell>
                    </TableRow>
                  ) : (
                    records.map((r) => (
                      <TableRow
                        key={r.id}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {format(new Date(r.date), "yyyy-MM-dd HH:mm")}
                        </TableCell>
                        <TableCell className="font-bold text-foreground">
                          {r.vehicleName}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground text-xs">
                          #görev_{r.taskId}
                        </TableCell>
                        <TableCell className="font-extrabold text-emerald-600 dark:text-emerald-400">
                          ₺
                          {Number(r.amount).toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell
                          className="text-muted-foreground text-xs font-medium truncate max-w-[200px]"
                          title={r.notes ?? ""}
                        >
                          {r.notes || "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      ) : (
        <>
          {/* ── Teknik İşler Raporu Filtre Barı ── */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between mb-2 bg-muted/40 p-3 rounded-lg border border-border/50 shrink-0 shadow-xs">
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* ── Teknik İşler Raporu Tablosu ── */}
          <Card className="flex-1 overflow-hidden flex flex-col border-slate-200/80 shadow-sm mt-1">
            <div className="overflow-auto flex-1 select-none">
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
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
