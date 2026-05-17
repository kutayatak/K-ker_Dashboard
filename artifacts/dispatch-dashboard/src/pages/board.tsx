import {
  useListTasks,
  useGetVehicleQueue,
  useBatchNotifyTasks,
  useCheckFlightDelays,
  useGetFlightTrackerStatus,
  getListTasksQueryKey,
  getGetFlightTrackerStatusQueryKey,
  type Task,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Clock,
  Users,
  ArrowRight,
  BellRing,
  Plane,
  RefreshCw,
  AlertTriangle,
  Wifi,
  Car,
  ExternalLink,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";

type TabKey = "queue" | "draft" | "assigned" | "in_progress" | "completed";

const TABS: { key: TabKey; label: string; short: string }[] = [
  { key: "queue",       label: "Kuyruk",     short: "Kuyruk" },
  { key: "draft",       label: "Taslak",     short: "Taslak" },
  { key: "assigned",    label: "Atandı",     short: "Atandı" },
  { key: "in_progress", label: "Yolda",      short: "Yolda"  },
  { key: "completed",   label: "Tamamlandı", short: "Tamam"  },
];

export function Board() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("draft");

  const { data: queue = [] } = useGetVehicleQueue({
    query: { queryKey: ["/api/vehicles/queue"] },
  });
  const { data: tasks = [] } = useListTasks(
    {},
    { query: { queryKey: getListTasksQueryKey() } }
  );
  const { data: trackerStatus, refetch: refetchStatus } = useGetFlightTrackerStatus({
    query: { queryKey: getGetFlightTrackerStatusQueryKey(), refetchInterval: 30000 },
  });

  const draftTasks      = tasks.filter((t) => t.status === "draft");
  const assignedTasks   = tasks.filter((t) => t.status === "assigned");
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
  const completedTasks  = tasks.filter((t) => t.status === "completed");

  const notifyMutation      = useBatchNotifyTasks();
  const checkDelaysMutation = useCheckFlightDelays();
  const [selectedTasks, setSelectedTasks] = useState<number[]>([]);
  const [lastUpdateCount, setLastUpdateCount] = useState<number | null>(null);
  
  const [notifyLinks, setNotifyLinks] = useState<{ driverName: string; phone: string; url: string; }[]>([]);
  const [isNotifyDialogOpen, setIsNotifyDialogOpen] = useState(false);

  const handleSelectTask = (id: number) =>
    setSelectedTasks((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleNotify = () => {
    if (!selectedTasks.length) return;
    notifyMutation.mutate(
      { data: { taskIds: selectedTasks } },
      {
        onSuccess: (response: any) => {
          setSelectedTasks([]);
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          if (response?.links && response.links.length > 0) {
            setNotifyLinks(response.links);
            setIsNotifyDialogOpen(true);
          }
        },
      }
    );
  };

  const handleFlightCheck = () => {
    checkDelaysMutation.mutate(
      undefined,
      {
        onSuccess: (result) => {
          setLastUpdateCount(result.updatedTasks);
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          refetchStatus();
        },
      }
    );
  };

  useEffect(() => {
    const h = setInterval(
      () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
      60_000
    );
    return () => clearInterval(h);
  }, [queryClient]);

  const tabCount = (key: TabKey) => {
    if (key === "queue")       return queue.length;
    if (key === "draft")       return draftTasks.length;
    if (key === "assigned")    return assignedTasks.length;
    if (key === "in_progress") return inProgressTasks.length;
    if (key === "completed")   return completedTasks.length;
    return 0;
  };

  return (
    <div className="flex flex-col h-full gap-0">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight leading-tight">
            Sevkiyat Paneli
          </h1>
          <p className="text-muted-foreground text-xs md:text-sm">Gerçek zamanlı terminal görünümü</p>
        </div>

        {/* Flight tracker — compact on mobile, expanded on desktop */}
        <div className="flex items-center gap-2 border rounded-lg px-2.5 py-1.5 md:px-3 md:py-2 bg-card text-sm shrink-0">
          <Plane className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-500 shrink-0" />

          {/* desktop label */}
          <div className="hidden md:flex flex-col leading-tight min-w-0">
            <div className="flex items-center gap-1.5">
              {trackerStatus?.simulationMode ? (
                <span className="text-amber-600 font-medium text-xs">Simülasyon Modu</span>
              ) : (
                <span className="text-emerald-600 font-medium text-xs flex items-center gap-1">
                  <Wifi className="w-3 h-3" /> AirLabs API
                </span>
              )}
              {lastUpdateCount !== null && (
                <span className="text-muted-foreground text-xs">
                  — {lastUpdateCount} güncellendi
                </span>
              )}
            </div>
            <span className="text-muted-foreground text-[11px]">
              {trackerStatus?.lastCheckedAt
                ? `Son: ${formatDistanceToNow(new Date(trackerStatus.lastCheckedAt), { addSuffix: true, locale: tr })}`
                : "Henüz kontrol edilmedi"}
            </span>
          </div>

          {/* mobile label */}
          <span className="md:hidden text-xs text-muted-foreground">
            {trackerStatus?.simulationMode ? "Sim" : "Canlı"}
          </span>

          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs ml-1"
            onClick={handleFlightCheck}
            disabled={checkDelaysMutation.isPending}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${checkDelaysMutation.isPending ? "animate-spin" : ""}`}
            />
            <span className="hidden md:inline ml-1">Kontrol Et</span>
          </Button>
        </div>
      </div>

      {/* ── Mobile tab bar ───────────────────────────────────────────── */}
      <div className="flex md:hidden border-b mb-3 overflow-x-auto scrollbar-none shrink-0 -mx-4 px-4">
        {TABS.map((tab) => {
          const count = tabCount(tab.key);
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors shrink-0
                ${active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
            >
              {tab.short}
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-mono px-1
                  ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex gap-4 min-h-0">

        {/* ── Desktop: queue sidebar ────────────────────────────────── */}
        <div className="hidden md:flex w-60 shrink-0 flex-col gap-2 h-full">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
              Kuyruk
            </h2>
            <Badge variant="secondary" className="font-mono text-[11px] px-1.5">
              {queue.length}
            </Badge>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pb-4 pr-1">
            <QueueList queue={queue} />
          </div>
        </div>

        {/* ── Desktop: 4-column kanban ──────────────────────────────── */}
        <div className="hidden md:grid flex-1 grid-cols-4 gap-4 h-full overflow-hidden">
          <TaskColumn
            title="Taslak"
            tasks={draftTasks}
            selectable
            selectedIds={selectedTasks}
            onSelect={handleSelectTask}
          />
          <TaskColumn title="Atandı"     tasks={assignedTasks} />
          <TaskColumn title="Yolda"      tasks={inProgressTasks} />
          <TaskColumn title="Tamamlandı" tasks={completedTasks} />
        </div>

        {/* ── Mobile: single active tab ─────────────────────────────── */}
        <div className="flex md:hidden flex-1 flex-col overflow-hidden min-h-0">
          {activeTab === "queue" && (
            <div className="flex-1 overflow-y-auto space-y-2 pb-24">
              <QueueList queue={queue} />
              {queue.length === 0 && <EmptyState text="Kuyruk boş" />}
            </div>
          )}
          {activeTab === "draft" && (
            <MobileTaskList
              tasks={draftTasks}
              selectable
              selectedIds={selectedTasks}
              onSelect={handleSelectTask}
            />
          )}
          {activeTab === "assigned" && (
            <MobileTaskList tasks={assignedTasks} />
          )}
          {activeTab === "in_progress" && (
            <MobileTaskList tasks={inProgressTasks} />
          )}
          {activeTab === "completed" && (
            <MobileTaskList tasks={completedTasks} />
          )}
        </div>
      </div>

      {/* ── Notify button ─────────────────────────────────────────────
          Desktop: shown in header area (inside board body flex row)
          Mobile:  sticky floating bar at bottom                       */}
      {selectedTasks.length > 0 && (
        <>
          {/* Desktop inline button — shown above kanban via absolute positioning trick */}
          <div className="hidden md:flex fixed bottom-6 right-6 z-50">
            <Button
              onClick={handleNotify}
              disabled={notifyMutation.isPending}
              size="lg"
              className="shadow-xl"
            >
              <BellRing className="w-4 h-4 mr-2" />
              Seçilileri Bildir ({selectedTasks.length})
            </Button>
          </div>

          {/* Mobile sticky bottom bar */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur border-t">
            <Button
              onClick={handleNotify}
              disabled={notifyMutation.isPending}
              className="w-full h-12 text-base font-semibold"
            >
              <BellRing className="w-5 h-5 mr-2" />
              Seçilileri Bildir ({selectedTasks.length})
            </Button>
          </div>
        </>
      )}

      {/* WhatsApp Links Dialog */}
      <Dialog open={isNotifyDialogOpen} onOpenChange={setIsNotifyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>WhatsApp Bildirimleri Gönder</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <p className="text-sm text-muted-foreground">
              Şoförlere otomatik atanmış mesajları göndermek için aşağıdaki bağlantılara tıklayın:
            </p>
            {notifyLinks.map((link, idx) => (
              <Button
                key={idx}
                variant="outline"
                className="justify-between h-auto py-3 px-4"
                onClick={() => window.open(link.url, "_blank")}
              >
                <div className="flex flex-col items-start gap-1">
                  <span className="font-semibold">{link.driverName}</span>
                  <span className="text-xs text-muted-foreground">{link.phone}</span>
                </div>
                <ExternalLink className="w-4 h-4 text-emerald-600" />
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Queue list (shared between desktop sidebar and mobile tab) ─────────── */
function QueueList({ queue }: { queue: any[] }) {
  if (!queue.length) return null;
  return (
    <>
      {queue.map((v) => (
        <div
          key={v.id}
          className={`rounded-lg p-3 text-sm border ${
            v.type === "outsource"
              ? "border-dashed border-amber-300 bg-amber-50/40"
              : "border bg-card"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Car className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="font-mono text-xs tracking-wide truncate">{v.plate}</span>
            </div>
            <Badge
              variant="secondary"
              className="font-mono bg-blue-100 text-blue-800 text-[11px] px-1.5 shrink-0"
            >
              #{v.queuePosition}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-1 truncate pl-5">
            {v.name} &bull; {v.driverName}
          </div>
          {v.type === "outsource" && (
            <div className="text-[10px] text-amber-600 font-semibold mt-0.5 pl-5 uppercase tracking-wide">
              Esnaf
            </div>
          )}
        </div>
      ))}
    </>
  );
}

/* ── Mobile task list (full-width vertical scroll) ──────────────────────── */
function MobileTaskList({
  tasks,
  selectable = false,
  selectedIds = [],
  onSelect,
}: {
  tasks: Task[];
  selectable?: boolean;
  selectedIds?: number[];
  onSelect?: (id: number) => void;
}) {
  if (!tasks.length)
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState text="Görev yok" />
      </div>
    );

  return (
    <div className="flex-1 overflow-y-auto space-y-3 pb-28">
      {tasks.map((t) => (
        <TaskCard
          key={t.id}
          task={t}
          selected={selectedIds.includes(t.id)}
          onSelect={() => onSelect?.(t.id)}
          selectable={selectable}
          fullWidth
        />
      ))}
    </div>
  );
}

/* ── Desktop task column ─────────────────────────────────────────────────── */
function TaskColumn({
  title,
  tasks,
  selectable = false,
  selectedIds = [],
  onSelect,
}: {
  title: string;
  tasks: Task[];
  selectable?: boolean;
  selectedIds?: number[];
  onSelect?: (id: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 h-full overflow-hidden">
      <div className="flex items-center justify-between mb-1 shrink-0">
        <h2 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        <Badge variant="secondary" className="rounded-full px-2 font-mono text-[11px]">
          {tasks.length}
        </Badge>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pb-4 pr-1">
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            selected={selectedIds.includes(t.id)}
            onSelect={() => onSelect?.(t.id)}
            selectable={selectable}
          />
        ))}
        {!tasks.length && <EmptyState text="Görev yok" />}
      </div>
    </div>
  );
}

/* ── Task card ───────────────────────────────────────────────────────────── */
function TaskCard({
  task,
  selected,
  onSelect,
  selectable,
  fullWidth = false,
}: {
  task: Task;
  selected: boolean;
  onSelect: () => void;
  selectable: boolean;
  fullWidth?: boolean;
}) {
  const scheduledDate = new Date(task.scheduledTime);
  const createdDate   = new Date(task.createdAt);
  const diffMs        = scheduledDate.getTime() - createdDate.getTime();
  const isDelayed     = diffMs > 2 * 60 * 1000 && !!task.flightCode;

  return (
    <div
      className={`relative overflow-hidden rounded-lg border transition-all
        ${selectable ? "cursor-pointer active:scale-[0.99]" : "cursor-default"}
        ${selected ? "ring-2 ring-primary border-transparent" : "hover:border-primary/40"}
        ${task.status === "draft" ? "bg-muted/40 border-dashed" : "bg-card"}
        ${fullWidth ? "w-full" : ""}
      `}
      onClick={selectable ? onSelect : undefined}
    >
      <div className="p-3">
        {/* Time + badge row */}
        <div className="flex items-center justify-between mb-2 gap-1">
          <div className="flex items-center gap-1.5 font-bold text-sm">
            <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className={isDelayed ? "text-amber-600" : ""}>
              {format(scheduledDate, "HH:mm")}
            </span>
            {isDelayed && <AlertTriangle className="w-3 h-3 text-amber-500" />}
          </div>
          <Badge
            variant="outline"
            className={`text-[10px] uppercase font-semibold px-1.5 shrink-0 ${
              isDelayed ? "border-amber-400 text-amber-600 bg-amber-50/60" : ""
            }`}
          >
            {task.flightCode ||
              (task.type === "hotel_pickup"
                ? "Otel"
                : task.type === "airport_run"
                ? "Havalimanı"
                : "Ekstra")}
          </Badge>
        </div>

        {/* Route */}
        <div className="flex items-center gap-1.5 text-xs font-medium mb-2.5 bg-muted/50 px-2 py-1.5 rounded border border-border/50">
          <span className="truncate flex-1 text-foreground" title={task.pickupLocation}>
            {task.pickupLocation}
          </span>
          <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
          <span
            className="truncate flex-1 text-right text-foreground"
            title={task.dropoffLocation}
          >
            {task.dropoffLocation}
          </span>
        </div>

        {/* Pax + vehicle */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span>
              {task.notes && (task.notes.includes("CPT") || task.notes.includes("KBN") || task.notes.toLowerCase().includes("cpt") || task.notes.toLowerCase().includes("kbn"))
                ? (task.notes.includes(" | Plaka:") ? task.notes.split(" | Plaka:")[0] : task.notes)
                : `${task.passengerCount} kişi`}
            </span>
          </div>
          {task.vehicleName && (
            <span
              className="font-semibold text-primary truncate max-w-[120px]"
              title={task.vehicleName}
            >
              {task.vehicleName}
            </span>
          )}
        </div>

        {/* Delay callout */}
        {isDelayed && (
          <div className="mt-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center gap-1">
            <Plane className="w-3 h-3 shrink-0" />
            Uçuş rötar güncellendi
          </div>
        )}
      </div>

      {/* Status stripe */}
      <div
        className={`h-0.5 w-full absolute bottom-0 left-0
          ${task.status === "draft"       ? "bg-slate-300"  : ""}
          ${task.status === "assigned"    ? "bg-blue-400"   : ""}
          ${task.status === "in_progress" ? "bg-amber-400"  : ""}
          ${task.status === "completed"   ? "bg-emerald-400": ""}
        `}
      />
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-xs text-muted-foreground text-center py-8 border rounded-lg border-dashed bg-card/30 w-full">
      {text}
    </div>
  );
}
