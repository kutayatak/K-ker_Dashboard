import { useListTasks, useGetVehicleQueue, useUpdateTask, useBatchNotifyTasks, getListTasksQueryKey, Task } from "@workspace/api-client-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Users, ArrowRight, BellRing } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";

export function Board() {
  const { data: queue = [] } = useGetVehicleQueue({ query: { queryKey: ["/api/vehicles/queue"] } });
  const { data: tasks = [] } = useListTasks({}, { query: { queryKey: ["/api/tasks"] } });
  
  const draftTasks = tasks.filter(t => t.status === "draft");
  const assignedTasks = tasks.filter(t => t.status === "assigned");
  const inProgressTasks = tasks.filter(t => t.status === "in_progress");
  const completedTasks = tasks.filter(t => t.status === "completed");

  const notifyMutation = useBatchNotifyTasks();
  const [selectedTasks, setSelectedTasks] = useState<number[]>([]);

  const handleSelectTask = (id: number) => {
    setSelectedTasks(prev => 
      prev.includes(id) ? prev.filter(tId => tId !== id) : [...prev, id]
    );
  };

  const handleNotify = () => {
    if (selectedTasks.length === 0) return;
    notifyMutation.mutate({ data: { taskIds: selectedTasks } }, {
      onSuccess: () => {
        setSelectedTasks([]);
        alert("Notified successfully");
      }
    });
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dispatch Board</h1>
          <p className="text-muted-foreground text-sm">Real-time terminal view</p>
        </div>
        <div className="flex gap-2">
          {selectedTasks.length > 0 && (
            <Button onClick={handleNotify} disabled={notifyMutation.isPending}>
              <BellRing className="w-4 h-4 mr-2" />
              Seçilileri Bildir ({selectedTasks.length})
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Vehicles Queue */}
        <div className="w-64 shrink-0 flex flex-col gap-2 h-full">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-1">Queue ({queue.length})</h2>
          <div className="flex-1 overflow-y-auto pr-2 space-y-2 pb-4">
            {queue.map((v) => (
              <Card key={v.id} className={`p-3 text-sm shadow-sm border ${v.type === 'outsource' ? 'border-dashed border-amber-300 bg-amber-50/50' : 'bg-card'}`}>
                <div className="flex items-center justify-between font-medium">
                  <span className="truncate">{v.plate}</span>
                  <Badge variant="secondary" className="font-mono bg-blue-100 text-blue-800">#{v.queuePosition}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {v.name} &bull; {v.driverName}
                </div>
              </Card>
            ))}
            {queue.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4 border rounded bg-card/50 border-dashed">
                Queue is empty
              </div>
            )}
          </div>
        </div>

        {/* Kanban Board */}
        <div className="flex-1 grid grid-cols-4 gap-4 overflow-hidden h-full">
          <TaskColumn 
            title="Draft" 
            tasks={draftTasks} 
            selectable 
            selectedIds={selectedTasks} 
            onSelect={handleSelectTask}
          />
          <TaskColumn title="Assigned" tasks={assignedTasks} />
          <TaskColumn title="In Progress" tasks={inProgressTasks} />
          <TaskColumn title="Completed" tasks={completedTasks} />
        </div>
      </div>
    </div>
  );
}

function TaskColumn({ title, tasks, selectable = false, selectedIds = [], onSelect }: { title: string, tasks: Task[], selectable?: boolean, selectedIds?: number[], onSelect?: (id: number) => void }) {
  return (
    <div className="flex flex-col gap-2 h-full overflow-hidden">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">{title}</h2>
        <Badge variant="secondary" className="rounded-full px-2 font-mono">{tasks.length}</Badge>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 pb-4 pr-1">
        {tasks.map(t => (
          <TaskCard 
            key={t.id} 
            task={t} 
            selected={selectedIds.includes(t.id)} 
            onSelect={() => onSelect?.(t.id)} 
            selectable={selectable} 
          />
        ))}
        {tasks.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8 border rounded-lg border-dashed bg-card/30">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, selected, onSelect, selectable }: { task: Task, selected: boolean, onSelect: () => void, selectable: boolean }) {
  return (
    <Card 
      className={`relative overflow-hidden cursor-pointer transition-all shadow-sm
        ${selected ? 'ring-2 ring-primary border-transparent' : 'hover:border-primary/50'}
        ${task.status === 'draft' ? 'bg-muted/50' : 'bg-card'}
      `}
      onClick={selectable ? onSelect : undefined}
    >
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            {format(new Date(task.scheduledTime), "HH:mm")}
          </div>
          <Badge variant="outline" className="text-[10px] uppercase font-semibold">
            {task.flightCode || task.type.replace('_', ' ')}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2 text-sm font-medium mb-3 bg-slate-50 p-1.5 rounded border border-slate-100">
          <span className="truncate flex-1" title={task.pickupLocation}>{task.pickupLocation}</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="truncate flex-1 text-right" title={task.dropoffLocation}>{task.dropoffLocation}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span>{task.passengerCount} pax</span>
          </div>
          {task.vehicleName && (
            <div className="font-semibold text-primary truncate max-w-[120px]" title={task.vehicleName}>
              {task.vehicleName}
            </div>
          )}
        </div>
      </div>
      
      {/* Status indicator line */}
      <div className={`h-1 w-full absolute bottom-0 left-0 
        ${task.status === 'draft' ? 'bg-slate-200' : 
          task.status === 'assigned' ? 'bg-blue-400' : 
          task.status === 'in_progress' ? 'bg-amber-400' : 
          'bg-emerald-400'}`} 
      />
    </Card>
  );
}
