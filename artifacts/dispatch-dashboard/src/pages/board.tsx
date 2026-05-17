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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Users, ArrowRight, BellRing, Plane, RefreshCw, AlertTriangle, Wifi, WifiOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { format, formatDistanceToNow } from "date-fns";

export function Board() {
  const queryClient = useQueryClient();

  const { data: queue = [] } = useGetVehicleQueue({ query: { queryKey: ["/api/vehicles/queue"] } });
  const { data: tasks = [] } = useListTasks({}, { query: { queryKey: getListTasksQueryKey() } });
  const { data: trackerStatus, refetch: refetchStatus } = useGetFlightTrackerStatus({
    query: { queryKey: getGetFlightTrackerStatusQueryKey(), refetchInterval: 30000 },
  });

  const draftTasks = tasks.filter((t) => t.status === "draft");
  const assignedTasks = tasks.filter((t) => t.status === "assigned");
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
  const completedTasks = tasks.filter((t) => t.status === "completed");

  const notifyMutation = useBatchNotifyTasks();
  const checkDelaysMutation = useCheckFlightDelays();
  const [selectedTasks, setSelectedTasks] = useState<number[]>([]);
  const [lastCheckResult, setLastCheckResult] = useState<{
    updatedTasks: number;
    checkedFlights: number;
    simulationMode: boolean;
  } | null>(null);

  const handleSelectTask = (id: number) => {
    setSelectedTasks((prev) =>
      prev.includes(id) ? prev.filter((tId) => tId !== id) : [...prev, id]
    );
  };

  const handleNotify = () => {
    if (selectedTasks.length === 0) return;
    notifyMutation.mutate(
      { data: { taskIds: selectedTasks } },
      {
        onSuccess: () => {
          setSelectedTasks([]);
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        },
      }
    );
  };

  const handleFlightCheck = () => {
    checkDelaysMutation.mutate(
      {},
      {
        onSuccess: (result) => {
          setLastCheckResult({
            updatedTasks: result.updatedTasks,
            checkedFlights: result.checkedFlights,
            simulationMode: result.simulationMode,
          });
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          refetchStatus();
        },
      }
    );
  };

  // Auto-refresh tasks every 60s
  useEffect(() => {
    const handle = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    }, 60000);
    return () => clearInterval(handle);
  }, [queryClient]);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dispatch Board</h1>
          <p className="text-muted-foreground text-sm">Real-time terminal view</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Flight Tracker Panel */}
          <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-card text-sm">
            <Plane className="w-4 h-4 text-blue-500 shrink-0" />
            <div className="flex flex-col leading-tight min-w-0">
              <div className="flex items-center gap-1.5">
                {trackerStatus?.simulationMode ? (
                  <span className="text-amber-600 font-medium text-xs">Simülasyon Modu</span>
                ) : (
                  <span className="text-emerald-600 font-medium text-xs flex items-center gap-1">
                    <Wifi className="w-3 h-3" /> AviationStack
                  </span>
                )}
                {lastCheckResult && (
                  <span className="text-muted-foreground text-xs">
                    — {lastCheckResult.updatedTasks} uçuş güncellendi
                  </span>
                )}
              </div>
              <span className="text-muted-foreground text-[11px]">
                {trackerStatus?.lastCheckedAt
                  ? `Son kontrol: ${formatDistanceToNow(new Date(trackerStatus.lastCheckedAt), { addSuffix: true })}`
                  : "Henüz kontrol edilmedi"}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs ml-1"
              onClick={handleFlightCheck}
              disabled={checkDelaysMutation.isPending}
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${checkDelaysMutation.isPending ? "animate-spin" : ""}`} />
              Kontrol Et
            </Button>
          </div>

          {selectedTasks.length > 0 && (
            <Button onClick={handleNotify} disabled={notifyMutation.isPending}>
              <BellRing className="w-4 h-4 mr-2" />
              Seçilileri Bildir ({selectedTasks.length})
            </Button>
          )}
        </div>
      </div>

      {/* Board body */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Vehicle Queue */}
        <div className="w-64 shrink-0 flex flex-col gap-2 h-full">
          <h2 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Kuyruk ({queue.length})
          </h2>
          <div className="flex-1 overflow-y-auto pr-1 space-y-2 pb-4">
            {queue.map((v) => (
              <div
                key={v.id}
                className={`rounded-lg p-3 text-sm border ${
                  v.type === "outsource"
                    ? "border-dashed border-amber-300 bg-amber-50/40 dark:bg-amber-900/10"
                    : "border bg-card"
                }`}
              >
                <div className="flex items-center justify-between font-medium">
                  <span className="truncate font-mono text-xs tracking-wide">{v.plate}</span>
                  <Badge
                    variant="secondary"
                    className="font-mono bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-[11px] px-1.5"
                  >
                    #{v.queuePosition}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {v.name} &bull; {v.driverName}
                </div>
                {v.type === "outsource" && (
                  <div className="text-[10px] text-amber-600 font-medium mt-0.5 uppercase tracking-wide">
                    Esnaf
                  </div>
                )}
              </div>
            ))}
            {queue.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6 border rounded-lg border-dashed bg-card/30">
                Kuyruk boş
              </div>
            )}
          </div>
        </div>

        {/* Kanban */}
        <div className="flex-1 grid grid-cols-4 gap-4 overflow-hidden h-full">
          <TaskColumn
            title="Taslak"
            tasks={draftTasks}
            selectable
            selectedIds={selectedTasks}
            onSelect={handleSelectTask}
          />
          <TaskColumn title="Atandı" tasks={assignedTasks} />
          <TaskColumn title="Yolda" tasks={inProgressTasks} />
          <TaskColumn title="Tamamlandı" tasks={completedTasks} />
        </div>
      </div>
    </div>
  );
}

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
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{title}</h2>
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
        {tasks.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-8 border rounded-lg border-dashed bg-card/30">
            Görev yok
          </div>
        )}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  selected,
  onSelect,
  selectable,
}: {
  task: Task;
  selected: boolean;
  onSelect: () => void;
  selectable: boolean;
}) {
  // Detect if the scheduledTime was recently updated (within last 10 min) by comparing
  // to a baseline — we use the createdAt as a proxy: if scheduledTime > createdAt by more
  // than a small buffer it was likely updated by the flight tracker
  const scheduledDate = new Date(task.scheduledTime);
  const createdDate = new Date(task.createdAt);
  const diffMs = scheduledDate.getTime() - createdDate.getTime();
  const isDelayed = diffMs > 2 * 60 * 1000 && task.flightCode; // >2 min difference means delay was applied

  return (
    <div
      className={`relative overflow-hidden rounded-lg border cursor-pointer transition-all
        ${selected ? "ring-2 ring-primary border-transparent" : "hover:border-primary/40"}
        ${task.status === "draft" ? "bg-muted/40 border-dashed" : "bg-card"}
        ${selectable ? "cursor-pointer" : "cursor-default"}
      `}
      onClick={selectable ? onSelect : undefined}
    >
      <div className="p-3">
        {/* Time + flight code row */}
        <div className="flex items-center justify-between mb-2 gap-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className={isDelayed ? "text-amber-600" : ""}>
              {format(scheduledDate, "HH:mm")}
            </span>
            {isDelayed && (
              <AlertTriangle className="w-3 h-3 text-amber-500" title="Rötar güncellendi" />
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {task.flightCode && (
              <Badge
                variant="outline"
                className={`text-[10px] uppercase font-semibold px-1.5 ${
                  isDelayed ? "border-amber-400 text-amber-600 bg-amber-50/60" : ""
                }`}
              >
                {task.flightCode}
              </Badge>
            )}
            {!task.flightCode && (
              <Badge variant="outline" className="text-[10px] uppercase font-semibold px-1.5">
                {task.type === "hotel_pickup" ? "Otel" : task.type === "airport_run" ? "Havalimanı" : "Ekstra"}
              </Badge>
            )}
          </div>
        </div>

        {/* Route */}
        <div className="flex items-center gap-1.5 text-xs font-medium mb-2.5 bg-muted/50 px-2 py-1.5 rounded border border-border/50">
          <span className="truncate flex-1 text-foreground" title={task.pickupLocation}>
            {task.pickupLocation}
          </span>
          <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="truncate flex-1 text-right text-foreground" title={task.dropoffLocation}>
            {task.dropoffLocation}
          </span>
        </div>

        {/* Pax + vehicle */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span>{task.passengerCount} kişi</span>
          </div>
          {task.vehicleName && (
            <span className="font-semibold text-primary truncate max-w-[100px]" title={task.vehicleName}>
              {task.vehicleName}
            </span>
          )}
        </div>

        {/* Delay callout */}
        {isDelayed && (
          <div className="mt-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center gap-1">
            <Plane className="w-3 h-3 shrink-0" />
            Uçus rotari guncellendi
          </div>
        )}
      </div>

      {/* Status bar */}
      <div
        className={`h-0.5 w-full absolute bottom-0 left-0
          ${
            task.status === "draft"
              ? "bg-slate-300"
              : task.status === "assigned"
              ? "bg-blue-400"
              : task.status === "in_progress"
              ? "bg-amber-400"
              : "bg-emerald-400"
          }`}
      />
    </div>
  );
}
