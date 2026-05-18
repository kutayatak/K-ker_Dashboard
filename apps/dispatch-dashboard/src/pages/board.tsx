import {
  useListTasks,
  useGetVehicleQueue,
  useBatchNotifyTasks,
  useCheckFlightDelays,
  useGetFlightTrackerStatus,
  getListTasksQueryKey,
  getGetFlightTrackerStatusQueryKey,
  type Task,
  useListVehicles,
  useUpdateVehicle,
  useUpdateTask,
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
  Plus,
  GripVertical,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";

type TabKey = "queue" | "gelir" | "gider" | "completed";

const TABS: { key: TabKey; label: string; short: string }[] = [
  { key: "queue",       label: "Kuyruk",       short: "Kuyruk" },
  { key: "gelir",       label: "Gelir",        short: "Gelir" },
  { key: "gider",       label: "Gider",        short: "Gider" },
  { key: "completed",   label: "Tamamlandı",   short: "Tamam"  },
];

export function Board() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("gelir");

  const { data: queue = [] } = useGetVehicleQueue({
    query: { queryKey: ["/api/vehicles/queue"] },
  });
  const { data: vehicles = [] } = useListVehicles({}, { query: { queryKey: ["/api/vehicles"] } });
  const updateVehicleMutation = useUpdateVehicle();

  const [localQueue, setLocalQueue] = useState<any[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");

  useEffect(() => {
    setLocalQueue(queue);
  }, [queue]);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const items = [...localQueue];
    const draggedItem = items[draggedIndex];
    items.splice(draggedIndex, 1);
    items.splice(index, 0, draggedItem);

    setDraggedIndex(index);
    setLocalQueue(items);
  };

  const handleDragEnd = async () => {
    setDraggedIndex(null);
    const ids = localQueue.map((v) => v.id);

    try {
      const res = await fetch("/api/vehicles/queue/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/vehicles/queue"] });
      }
    } catch (err) {
      console.error("Queue reorder failed:", err);
    }
  };

  const handleRemoveFromQueue = (vehicleId: number) => {
    updateVehicleMutation.mutate({
      id: vehicleId,
      data: {
        status: "offline",
        queuePosition: null,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/vehicles/queue"] });
      }
    });
  };

  const handleAddToQueue = () => {
    if (!selectedVehicleId) return;
    const vId = Number(selectedVehicleId);
    const maxPos = queue.reduce((max: number, v: any) => Math.max(max, v.queuePosition ?? 0), 0);
    
    updateVehicleMutation.mutate({
      id: vId,
      data: {
        status: "empty",
        queuePosition: maxPos + 1,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/vehicles/queue"] });
        setIsAddOpen(false);
        setSelectedVehicleId("");
      }
    });
  };

  // Filter vehicles that are not in the queue and are 'fixed'
  const availableVehicles = vehicles.filter(
    (v: any) => v.type === "fixed" && (!v.queuePosition || v.status !== "empty")
  );
  const { data: tasks = [] } = useListTasks(
    {},
    { query: { queryKey: getListTasksQueryKey() } }
  );
  const { data: trackerStatus, refetch: refetchStatus } = useGetFlightTrackerStatus({
    query: { queryKey: getGetFlightTrackerStatusQueryKey(), refetchInterval: 30000 },
  });

  const activeTasks = tasks.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  const isGelirTask = (t: Task) => t.type === "airport_run" || t.dropoffLocation === "Ekstra Gelir";
  const isGiderTask = (t: Task) => t.type === "hotel_pickup" || t.dropoffLocation === "Ekstra Gider" || t.type === "extra";
  
  const sortTasksByTime = (a: Task, b: Task) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime();

  const gelirTasks     = activeTasks.filter(isGelirTask).sort(sortTasksByTime);
  const giderTasks     = activeTasks.filter(isGiderTask).sort(sortTasksByTime);
  const completedTasks = tasks.filter((t) => t.status === "completed").sort(sortTasksByTime);

  const notifyMutation      = useBatchNotifyTasks();
  const updateTaskMutation  = useUpdateTask();
  const checkDelaysMutation = useCheckFlightDelays();
  const [selectedTasks, setSelectedTasks] = useState<number[]>([]);
  const [lastUpdateCount, setLastUpdateCount] = useState<number | null>(null);
  
  const [notifyLinks, setNotifyLinks] = useState<{ driverName: string; phone: string; url: string; }[]>([]);
  const [isNotifyDialogOpen, setIsNotifyDialogOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assignVehicleId, setAssignVehicleId] = useState<string>("");

  const handleSelectTask = (id: number) =>
    setSelectedTasks((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleAssignVehicle = async () => {
    if (!assignVehicleId || !selectedTasks.length) return;
    const vId = Number(assignVehicleId);
    
    const promises = selectedTasks.map((taskId) =>
      new Promise<void>((resolve, reject) => {
        updateTaskMutation.mutate(
          {
            id: taskId,
            data: {
              vehicleId: vId,
              status: "draft",
            },
          },
          {
            onSuccess: () => resolve(),
            onError: (err) => reject(err),
          }
        );
      })
    );

    try {
      await Promise.all(promises);
      setSelectedTasks([]);
      setIsAssignOpen(false);
      setAssignVehicleId("");
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    } catch (err) {
      console.error("Batch assign vehicle failed:", err);
    }
  };

  const handleNotifySingle = (taskId: number) => {
    notifyMutation.mutate(
      { data: { taskIds: [taskId] } },
      {
        onSuccess: (response: any) => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          if (response?.links && response.links.length > 0) {
            window.open(response.links[0].url, "_blank");
          }
        },
      }
    );
  };

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
    if (key === "gelir")       return gelirTasks.length;
    if (key === "gider")       return giderTasks.length;
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
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                onClick={() => setIsAddOpen(true)}
                title="Kuyruğa Araç Ekle"
              >
                <Plus className="w-4 h-4" />
              </Button>
              <Badge variant="secondary" className="font-mono text-[11px] px-1.5">
                {queue.length}
              </Badge>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pb-4 pr-1">
            <QueueList
              queue={localQueue}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onRemove={handleRemoveFromQueue}
            />
            {queue.length === 0 && <div className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded-lg">Kuyruk boş</div>}
          </div>
        </div>

        {/* ── Desktop: 4-column kanban ──────────────────────────────── */}
        <div className="hidden md:grid flex-1 grid-cols-3 gap-4 h-full overflow-hidden">
          <TaskColumn
            title="Gelir"
            tasks={gelirTasks}
            selectable
            selectedIds={selectedTasks}
            onSelect={handleSelectTask}
            onNotifySingle={handleNotifySingle}
          />
          <TaskColumn
            title="Gider"
            tasks={giderTasks}
            selectable
            selectedIds={selectedTasks}
            onSelect={handleSelectTask}
            onNotifySingle={handleNotifySingle}
          />
          <TaskColumn
            title="Tamamlandı"
            tasks={completedTasks}
            onNotifySingle={handleNotifySingle}
          />
        </div>

        {/* ── Mobile: single active tab ─────────────────────────────── */}
        <div className="flex md:hidden flex-1 flex-col overflow-hidden min-h-0">
          {activeTab === "queue" && (
            <div className="flex-1 overflow-y-auto space-y-2 pb-24">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kuyruk Yönetimi</span>
                <Button size="sm" onClick={() => setIsAddOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Araç Ekle
                </Button>
              </div>
              <QueueList
                queue={localQueue}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onRemove={handleRemoveFromQueue}
              />
              {queue.length === 0 && <EmptyState text="Kuyruk boş" />}
            </div>
          )}
          {activeTab === "gelir" && (
            <MobileTaskList
              tasks={gelirTasks}
              selectable
              selectedIds={selectedTasks}
              onSelect={handleSelectTask}
              onNotifySingle={handleNotifySingle}
            />
          )}
          {activeTab === "gider" && (
            <MobileTaskList
              tasks={giderTasks}
              selectable
              selectedIds={selectedTasks}
              onSelect={handleSelectTask}
              onNotifySingle={handleNotifySingle}
            />
          )}
          {activeTab === "completed" && (
            <MobileTaskList
              tasks={completedTasks}
              onNotifySingle={handleNotifySingle}
            />
          )}
        </div>
      </div>

      {/* ── Notify button ─────────────────────────────────────────────
          Desktop: shown in header area (inside board body flex row)
          Mobile:  sticky floating bar at bottom                       */}
      {selectedTasks.length > 0 && (
        <>
          {/* Desktop inline button — shown above kanban via absolute positioning trick */}
          <div className="hidden md:flex fixed bottom-6 right-6 z-50 gap-2">
            <Button
              onClick={() => setIsAssignOpen(true)}
              size="lg"
              variant="secondary"
              className="shadow-xl border bg-background hover:bg-muted"
            >
              <Car className="w-4 h-4 mr-2" />
              Araç Ata ({selectedTasks.length})
            </Button>
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
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur border-t flex gap-2">
            <Button
              onClick={() => setIsAssignOpen(true)}
              variant="outline"
              className="flex-1 h-12 text-sm font-semibold"
            >
              <Car className="w-5 h-5 mr-2" />
              Araç Ata ({selectedTasks.length})
            </Button>
            <Button
              onClick={handleNotify}
              disabled={notifyMutation.isPending}
              className="flex-1 h-12 text-sm font-semibold"
            >
              <BellRing className="w-5 h-5 mr-2" />
              Bildir ({selectedTasks.length})
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

      {/* Manual Vehicle Assignment Dialog */}
      <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle>Seçili İşlere Araç Ata</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <p className="text-sm text-muted-foreground">
              Seçilen <strong>{selectedTasks.length}</strong> işe atanacak şoför ve aracı seçin:
            </p>
            
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Şoför Seçin</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={assignVehicleId}
                onChange={(e) => setAssignVehicleId(e.target.value)}
              >
                <option value="">Şoför / Araç Seçin...</option>
                {vehicles.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} — {v.driverName} ({v.name}) {v.type === "outsource" ? "[ESNAF]" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setIsAssignOpen(false); setAssignVehicleId(""); }}>İptal</Button>
              <Button onClick={handleAssignVehicle} disabled={!assignVehicleId || updateTaskMutation.isPending}>
                {updateTaskMutation.isPending ? "Atanıyor..." : "Araç Ata"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Queue Addition Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle>Kuyruğa Şoför / Araç Ekle</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <p className="text-sm text-muted-foreground">
              Kuyruğa manuel olarak eklemek istediğiniz şoförü ve aracını seçin:
            </p>
            
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Şoför Seçin</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
              >
                <option value="">Şoför / Araç Seçin...</option>
                {availableVehicles.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.plate} — {v.driverName} ({v.name})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>İptal</Button>
              <Button onClick={handleAddToQueue} disabled={!selectedVehicleId}>Kuyruğa Ekle</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Queue list (shared between desktop sidebar and mobile tab) ─────────── */
function QueueList({
  queue,
  onDragStart,
  onDragOver,
  onDragEnd,
  onRemove,
}: {
  queue: any[];
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onRemove: (id: number) => void;
}) {
  if (!queue.length) return null;
  return (
    <div className="space-y-2 select-none">
      {queue.map((v, idx) => (
        <div
          key={v.id}
          draggable
          onDragStart={() => onDragStart(idx)}
          onDragOver={(e) => onDragOver(e, idx)}
          onDragEnd={onDragEnd}
          className={`rounded-lg p-3 text-sm border cursor-grab active:cursor-grabbing transition-all duration-150 flex flex-col gap-1.5 relative group/qitem hover:border-primary/40 ${
            v.type === "outsource"
              ? "border-dashed border-amber-300 bg-amber-50/40"
              : "border bg-card hover:bg-muted/10"
          }`}
        >
          {/* Grab handle and content */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 cursor-grab" />
              <span className="font-mono text-xs tracking-wide truncate font-bold text-foreground">{v.plate}</span>
            </div>
            
            <div className="flex items-center gap-1 shrink-0">
              <Badge
                variant="secondary"
                className="font-mono bg-blue-100 text-blue-800 text-[10px] px-1 py-0 rounded shrink-0 font-extrabold"
              >
                #{idx + 1}
              </Badge>
              
              {/* Manual Remove from Queue */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(v.id);
                }}
                className="w-5 h-5 rounded hover:bg-muted text-muted-foreground hover:text-red-500 flex items-center justify-center opacity-0 group-hover/qitem:opacity-100 transition-opacity"
                title="Kuyruktan Çıkar"
              >
                <Plus className="w-3.5 h-3.5 rotate-45 text-red-500" />
              </button>
            </div>
          </div>
          
          <div className="text-xs text-muted-foreground pl-5 truncate font-medium">
            {v.name} &bull; {v.driverName}
          </div>
          {v.type === "outsource" && (
            <div className="text-[9px] text-amber-700 font-extrabold mt-0.5 pl-5 uppercase tracking-wider">
              Esnaf
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Mobile task list (full-width vertical scroll) ──────────────────────── */
function MobileTaskList({
  tasks,
  selectable = false,
  selectedIds = [],
  onSelect,
  onNotifySingle,
}: {
  tasks: Task[];
  selectable?: boolean;
  selectedIds?: number[];
  onSelect?: (id: number) => void;
  onNotifySingle?: (id: number) => void;
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
          onNotifySingle={onNotifySingle ? () => onNotifySingle(t.id) : undefined}
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
  onNotifySingle,
}: {
  title: string;
  tasks: Task[];
  selectable?: boolean;
  selectedIds?: number[];
  onSelect?: (id: number) => void;
  onNotifySingle?: (id: number) => void;
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
            onNotifySingle={onNotifySingle ? () => onNotifySingle(t.id) : undefined}
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
  onNotifySingle,
  fullWidth = false,
}: {
  task: Task;
  selected: boolean;
  onSelect: () => void;
  selectable: boolean;
  onNotifySingle?: () => void;
  fullWidth?: boolean;
}) {
  const scheduledDate = new Date(task.scheduledTime);
  const createdDate   = new Date(task.createdAt);
  const diffMs        = scheduledDate.getTime() - createdDate.getTime();
  const isDelayed     = diffMs > 2 * 60 * 1000 && !!task.flightCode && task.type !== "hotel_pickup";

  const isAssignedButNotNotified = !!task.vehicleId && task.status === "draft";
  const isNotified = task.status === "assigned";

  return (
    <div
      className={`relative overflow-hidden rounded-lg border transition-all
        ${selectable ? "cursor-pointer active:scale-[0.99]" : "cursor-default"}
        ${selected ? "ring-2 ring-primary border-transparent" : "hover:border-primary/40"}
        ${isAssignedButNotNotified ? "bg-amber-50/20 border-amber-300 border-dashed" : task.status === "draft" ? "bg-muted/40 border-dashed" : "bg-card"}
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
        {task.type === "extra" ? (
          <div className="text-xs font-semibold mb-2.5 bg-amber-50/50 dark:bg-amber-950/20 border border-dashed border-amber-300 rounded px-2.5 py-2 text-foreground/90">
            <div className="text-[10px] text-amber-600 font-bold uppercase tracking-wider mb-1">Ekstra İş Detayı</div>
            <div className="line-clamp-2 leading-relaxed" title={task.pickupLocation}>
              {task.pickupLocation}
            </div>
          </div>
        ) : (
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
        )}

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

        {/* Notification Status & Single Action */}
        {task.vehicleId ? (
          <div className="mt-2.5 pt-2 border-t flex items-center justify-between text-[11px]">
            {isNotified ? (
              <span className="flex items-center gap-1 text-emerald-600 font-semibold select-none">
                <span className="w-3.5 h-3.5 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] text-emerald-600">✓</span>
                Bildirildi
              </span>
            ) : (
              <span className="flex items-center gap-1 text-slate-500 font-semibold select-none">
                <span className="w-3.5 h-3.5 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-[10px]"></span>
                Bildirilmedi
              </span>
            )}
            
            {!isNotified && onNotifySingle && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px] bg-primary text-primary-foreground hover:bg-primary/95 border-none"
                onClick={(e) => {
                  e.stopPropagation();
                  onNotifySingle();
                }}
              >
                Bildir
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-2.5 pt-2 border-t flex items-center text-[11px] text-muted-foreground italic select-none">
            Araç atanmadı
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
