import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTasks,
  useListVehicles,
  useUpdateTask,
  useUpdateVehicle,
  useGetVehicleQueue,
  useBatchNotifyTasks,
  getListTasksQueryKey,
  type Task,
  useCreateTask,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileSpreadsheet,
  Download,
  RefreshCw,
  Calendar as CalendarIcon,
  GripVertical,
  Plus,
  X,
  Wrench,
  Users,
  ChevronDown,
  ChevronUp,
  Pencil,
  Save,
} from "lucide-react";
import { format } from "date-fns";

// Read HH:mm directly from the UTC ISO string to avoid local-timezone offset.
// date-fns format() uses local time; in Turkey (UTC+3) it would add 3 hours.
const utcTime = (iso: string) => iso?.substring(11, 16) ?? "--:--";
import { tr } from "date-fns/locale";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

type ExtendedTask = Task & {
  rowIndex?: number | null;
  tableType?: "left" | "right" | null;
  km?: number | string | null;
};

const DEFAULT_REGULAR_WIDTHS = [
  48, // S.NO
  100, // UÇUŞ KODU
  160, // PLAKA (SÜRÜCÜ)
  64, // SAAT
  220, // OTEL ADI / NEREDEN
  120, // EKİP (KİŞİ)
  80, // KM
  8, // Separator
  100, // UÇUŞ KODU
  160, // PLAKA (SÜRÜCÜ)
  64, // SAAT
  220, // OTEL ADI / NEREYE
  120, // EKİP (KİŞİ)
  80, // KM
];

const DEFAULT_EXTRA_WIDTHS = [
  48, // S.NO
  64, // SAAT
  160, // PLAKA (SÜRÜCÜ)
  320, // OTEL / AÇIKLAMA
  8, // Separator
  64, // SAAT
  160, // PLAKA (SÜRÜCÜ)
  320, // OTEL / AÇIKLAMA
];

const DEFAULT_TECHNICAL_WIDTHS = [
  48, // S.NO
  64, // SAAT
  160, // PLAKA (SÜRÜCÜ)
  320, // AÇIKLAMA
  80, // KM
];

export function ExcelView() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get("date");
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return dateParam;
    }
    return new Date().toISOString().split("T")[0];
  });

  useEffect(() => {
    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const dateParam = params.get("date");
      if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        setSelectedDate(dateParam);
      }
    };
    handleUrlChange();
    window.addEventListener("popstate", handleUrlChange);
    return () => window.removeEventListener("popstate", handleUrlChange);
  }, [window.location.search]);

  // ── Column width persistence ────────────────────────────────────────────
  const [regularWidths, setRegularWidths] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("excel_view_regular_widths");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 14) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_REGULAR_WIDTHS;
  });

  const [extraWidths, setExtraWidths] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("excel_view_extra_widths");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 8) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_EXTRA_WIDTHS;
  });

  const [technicalWidths, setTechnicalWidths] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("excel_view_technical_widths");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 5) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_TECHNICAL_WIDTHS;
  });

  const startResize = (
    tableType: "regular" | "extra" | "technical",
    colIndex: number,
    startEvent: React.MouseEvent,
  ) => {
    startEvent.preventDefault();
    const startX = startEvent.clientX;
    const startWidths =
      tableType === "regular"
        ? [...regularWidths]
        : tableType === "extra"
          ? [...extraWidths]
          : [...technicalWidths];
    const startWidth = startWidths[colIndex];

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(30, startWidth + deltaX);
      if (tableType === "regular") {
        setRegularWidths((prev) => {
          const next = [...prev];
          next[colIndex] = newWidth;
          return next;
        });
      } else if (tableType === "extra") {
        setExtraWidths((prev) => {
          const next = [...prev];
          next[colIndex] = newWidth;
          return next;
        });
      } else {
        setTechnicalWidths((prev) => {
          const next = [...prev];
          next[colIndex] = newWidth;
          return next;
        });
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (tableType === "regular") {
        setRegularWidths((latest) => {
          localStorage.setItem(
            "excel_view_regular_widths",
            JSON.stringify(latest),
          );
          return latest;
        });
      } else if (tableType === "extra") {
        setExtraWidths((latest) => {
          localStorage.setItem(
            "excel_view_extra_widths",
            JSON.stringify(latest),
          );
          return latest;
        });
      } else {
        setTechnicalWidths((latest) => {
          localStorage.setItem(
            "excel_view_technical_widths",
            JSON.stringify(latest),
          );
          return latest;
        });
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // ── Data fetching ───────────────────────────────────────────────────────
  const { data: tasks = [], isPending: tasksPending } = useListTasks(
    {},
    { query: { queryKey: getListTasksQueryKey() } },
  );
  const { data: vehicles = [] } = useListVehicles(
    {},
    { query: { queryKey: ["/api/vehicles"] } },
  );
  const { data: queue = [] } = useGetVehicleQueue({
    query: { queryKey: ["/api/vehicles/queue"] },
  });

  const updateTaskMutation = useUpdateTask();
  const createTaskMutation = useCreateTask();
  const updateVehicleMutation = useUpdateVehicle();
  const notifyMutation = useBatchNotifyTasks();

  // ── Queue state & drag-and-drop (reorder within queue) ─────────────────
  const [localQueue, setLocalQueue] = useState<any[]>([]);
  const [draggedQueueIndex, setDraggedQueueIndex] = useState<number | null>(
    null,
  );
  const [isAddQueueOpen, setIsAddQueueOpen] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [queueCollapsed, setQueueCollapsed] = useState(false);

  useEffect(() => {
    setLocalQueue(queue);
  }, [queue]);

  const handleQueueDragStart = (index: number) => {
    setDraggedQueueIndex(index);
  };

  const handleQueueDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedQueueIndex === null || draggedQueueIndex === index) return;
    const items = [...localQueue];
    const dragged = items[draggedQueueIndex];
    items.splice(draggedQueueIndex, 1);
    items.splice(index, 0, dragged);
    setDraggedQueueIndex(index);
    setLocalQueue(items);
  };

  const handleQueueDragEnd = async () => {
    setDraggedQueueIndex(null);
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
    updateVehicleMutation.mutate(
      { id: vehicleId, data: { status: "offline", queuePosition: null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/vehicles/queue"] });
        },
      },
    );
  };

  const handleAddToQueue = () => {
    if (!selectedVehicleId) return;
    const vId = Number(selectedVehicleId);
    const maxPos = queue.reduce(
      (max: number, v: any) => Math.max(max, v.queuePosition ?? 0),
      0,
    );
    updateVehicleMutation.mutate(
      { id: vId, data: { status: "empty", queuePosition: maxPos + 1 } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/vehicles/queue"] });
          setIsAddQueueOpen(false);
          setSelectedVehicleId("");
        },
      },
    );
  };

  const availableVehicles = (vehicles as any[]).filter(
    (v) => v.type === "fixed" && (!v.queuePosition || v.status !== "empty"),
  );

  // ── Drag vehicle-to-task assignment ────────────────────────────────────
  // Drag a vehicle card from the queue and drop onto a task row's plate cell.
  const [dragOverTaskId, setDragOverTaskId] = useState<number | null>(null);

  const handleVehicleDragStart = (e: React.DragEvent, vehicleId: number) => {
    e.dataTransfer.setData("text/vehicle-id", String(vehicleId));
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleTaskDrop = (e: React.DragEvent, task: Task) => {
    e.preventDefault();
    const vehicleId = e.dataTransfer.getData("text/vehicle-id");
    if (!vehicleId) return;
    const vId = Number(vehicleId);
    const selectedVehicle = (vehicles as any[]).find((v) => v.id === vId);
    if (!selectedVehicle) return;

    let newNotes = task.notes ?? "";
    const cleanNotes = newNotes.includes(" | Plaka:")
      ? newNotes.split(" | Plaka:")[0]
      : newNotes.includes(" | İPTAL")
        ? newNotes.split(" | İPTAL")[0]
        : newNotes === "İPTAL"
          ? ""
          : newNotes;
    const finalNotes = cleanNotes
      ? `${cleanNotes} | Plaka: ${selectedVehicle.plate}`
      : `Plaka: ${selectedVehicle.plate}`;

    updateTaskMutation.mutate(
      {
        id: task.id,
        data: { vehicleId: vId, notes: finalNotes, status: "draft" },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          setDragOverTaskId(null);
        },
      },
    );
  };

  // ── Calendar helpers ────────────────────────────────────────────────────
  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    setSelectedDate(`${yyyy}-${mm}-${dd}`);
  };

  const getShiftDateKey = (scheduledTime: string) => {
    const d = new Date(scheduledTime);
    if (isNaN(d.getTime())) return "";
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };

  const { completedDays, uncompletedDays } = useMemo(() => {
    const byDate = new Map<string, { hasActive: boolean }>();
    if (Array.isArray(tasks)) {
      for (const t of tasks as any[]) {
        if (!t?.scheduledTime) continue;
        const key = getShiftDateKey(t.scheduledTime);
        if (!key) continue;
        const prev = byDate.get(key);
        const isActive =
          t.status !== "completed" &&
          t.status !== "cancelled" &&
          t.type !== "technical";
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

  const calendarModifiers = {
    completed: completedDays,
    uncompleted: uncompletedDays,
  };

  // ── Task filtering ──────────────────────────────────────────────────────
  const [y, m, ddVal] = selectedDate.split("-").map(Number);
  const shiftStart = new Date(Date.UTC(y, m - 1, ddVal, 0, 0, 0, 0));
  const shiftEnd = new Date(Date.UTC(y, m - 1, ddVal + 1, 0, 0, 0, 0));

  const dayTasks = (tasks as ExtendedTask[]).filter((t) => {
    const time = new Date(t.scheduledTime);
    return time >= shiftStart && time < shiftEnd;
  });

  const getPlateFromNotes = (notes: string | null | undefined) => {
    if (!notes) return null;
    const match = notes.match(/Plaka:\s*([^|]+)/i);
    return match ? match[1].trim() : null;
  };

  const sortTasks = (a: ExtendedTask, b: ExtendedTask) => {
    const timeA = new Date(a.scheduledTime).getTime();
    const timeB = new Date(b.scheduledTime).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return (a.rowIndex ?? 9999) - (b.rowIndex ?? 9999);
  };

  const leftRegular = dayTasks
    .filter(
      (t) =>
        t.tableType === "left" && t.type !== "extra" && t.type !== "technical",
    )
    .sort(sortTasks);
  const rightRegular = dayTasks
    .filter(
      (t) =>
        t.tableType === "right" && t.type !== "extra" && t.type !== "technical",
    )
    .sort(sortTasks);
  const leftExtras = dayTasks
    .filter((t) => t.tableType === "left" && t.type === "extra")
    .sort(sortTasks);
  const rightExtras = dayTasks
    .filter((t) => t.tableType === "right" && t.type === "extra")
    .sort(sortTasks);
  const technicalTasks = dayTasks
    .filter((t) => t.type === "technical")
    .sort(sortTasks);

  const maxRegularRows = Math.max(leftRegular.length, rightRegular.length);
  const maxExtraRows = Math.max(leftExtras.length, rightExtras.length);

  // ── In-line task updates ────────────────────────────────────────────────

  // ── Double-click edit state ─────────────────────────────────────────────
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState<{
    flightCode: string;
    time: string; // HH:mm in UTC
    notes: string;
    km: string;
    hotelName: string;
  }>({ flightCode: "", time: "", notes: "", km: "", hotelName: "" });
  const [editSaving, setEditSaving] = useState(false);

  // ── Double-click add state ──────────────────────────────────────────────
  const [addingTaskState, setAddingTaskState] = useState<{
    tableType: "left" | "right" | null;
    type: "hotel_pickup" | "airport_run" | "extra" | "technical";
  } | null>(null);

  const [addForm, setAddForm] = useState<{
    flightCode: string;
    time: string; // HH:mm in UTC
    notes: string;
    km: string;
    hotelName: string;
  }>({ flightCode: "", time: "09:00", notes: "", km: "", hotelName: "" });

  const openEdit = (task: Task) => {
    setEditingTask(task);
    // notes: strip the "| Plaka: xxx" suffix for display, keep crew info
    let displayNotes = task.notes ?? "";
    if (displayNotes.includes(" | Plaka:")) {
      displayNotes = displayNotes.split(" | Plaka:")[0];
    }

    // Resolve hotel name
    const isRight = (task as ExtendedTask).tableType === "right";
    const hotel = isRight ? (task.dropoffLocation ?? "") : (task.pickupLocation ?? "");

    setEditForm({
      flightCode: task.flightCode ?? "",
      time: utcTime(task.scheduledTime), // HH:mm already UTC
      notes: displayNotes,
      km:
        (task as ExtendedTask).km != null
          ? String(Number((task as ExtendedTask).km))
          : "",
      hotelName: hotel,
    });
  };

  const handleEditSave = async () => {
    if (!editingTask) return;
    setEditSaving(true);
    try {
      // Build new scheduledTime: keep the UTC date, replace HH:mm
      const [hh, mm] = editForm.time.split(":").map(Number);
      const baseDateUTC = editingTask.scheduledTime.substring(0, 10); // YYYY-MM-DD
      const newScheduledTime = `${baseDateUTC}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00.000Z`;

      // Preserve plate notes, update crew notes part
      let existingNotes = editingTask.notes ?? "";
      const plateSection = existingNotes.includes(" | Plaka:")
        ? " | Plaka:" + existingNotes.split(" | Plaka:")[1]
        : "";
      const newNotes = editForm.notes.trim()
        ? editForm.notes.trim() + plateSection
        : plateSection.trim() || null;

      // Update appropriate location fields based on tableType
      const isRight = (editingTask as ExtendedTask).tableType === "right";
      const isTechnical = editingTask.type === "technical";

      let pickupLoc = editingTask.pickupLocation;
      let dropoffLoc = editingTask.dropoffLocation;

      if (isTechnical) {
        pickupLoc = editForm.hotelName.trim() || "Teknik İş";
      } else if (isRight) {
        pickupLoc = editingTask.pickupLocation || "Esenboğa Havalimanı";
        dropoffLoc = editForm.hotelName.trim() || "Otel";
      } else {
        pickupLoc = editForm.hotelName.trim() || "Otel";
        dropoffLoc = editingTask.dropoffLocation || "Esenboğa Havalimanı";
      }

      await new Promise<void>((resolve, reject) => {
        updateTaskMutation.mutate(
          {
            id: editingTask.id,
            data: {
              flightCode: editForm.flightCode.trim() || undefined,
              scheduledTime: newScheduledTime,
              notes: newNotes ?? undefined,
              km: editForm.km === "" ? null : Number(editForm.km),
              pickupLocation: pickupLoc,
              dropoffLocation: dropoffLoc,
            },
          },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({
                queryKey: getListTasksQueryKey(),
              });
              resolve();
            },
            onError: (err) => reject(err),
          },
        );
      });
      setEditingTask(null);
    } catch (e) {
      console.error("Edit save failed:", e);
    } finally {
      setEditSaving(false);
    }
  };

  const handleAddSave = async () => {
    if (!addingTaskState) return;
    setEditSaving(true);
    try {
      const [hh, mm] = addForm.time.split(":").map(Number);
      const scheduledTime = `${selectedDate}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00.000Z`;

      const isRight = addingTaskState.tableType === "right";
      const isTechnical = addingTaskState.type === "technical";

      let pickupLoc = "";
      let dropoffLoc = "";

      if (isTechnical) {
        pickupLoc = addForm.hotelName.trim() || "Teknik İş";
        dropoffLoc = "Teknik İş";
      } else if (isRight) {
        pickupLoc = "Esenboğa Havalimanı";
        dropoffLoc = addForm.hotelName.trim() || "Otel";
      } else {
        pickupLoc = addForm.hotelName.trim() || "Otel";
        dropoffLoc = "Esenboğa Havalimanı";
      }

      await new Promise<void>((resolve, reject) => {
        createTaskMutation.mutate(
          {
            data: {
              type: addingTaskState.type,
              flightCode: addForm.flightCode.trim() || undefined,
              pickupLocation: pickupLoc,
              dropoffLocation: dropoffLoc,
              scheduledTime,
              passengerCount: 1,
              notes: addForm.notes.trim() || undefined,
              km: addForm.km === "" ? null : Number(addForm.km),
              tableType: addingTaskState.tableType,
            },
          },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({
                queryKey: getListTasksQueryKey(),
              });
              resolve();
            },
            onError: (err) => reject(err),
          },
        );
      });
      setAddingTaskState(null);
    } catch (e) {
      console.error("Create task failed:", e);
    } finally {
      setEditSaving(false);
    }
  };

  const handlePlateChange = (task: Task, vehicleIdVal: string) => {
    if (vehicleIdVal === "cancelled") {
      let newNotes = task.notes ?? "";
      const cleanNotes = newNotes.includes(" | Plaka:")
        ? newNotes.split(" | Plaka:")[0]
        : newNotes.includes(" | İPTAL")
          ? newNotes.split(" | İPTAL")[0]
          : newNotes === "İPTAL"
            ? ""
            : newNotes;
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
          onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
        },
      );
      return;
    }
    if (vehicleIdVal === "custom_prompt") {
      const customPlate = prompt(
        "Lütfen özel plaka veya plakaları girin (Örn: 06 ABC 123 veya 06 ABC 123 / 06 DEF 456):",
      );
      if (customPlate === null) return;
      let newNotes = task.notes ?? "";
      const cleanNotes = newNotes.includes(" | Plaka:")
        ? newNotes.split(" | Plaka:")[0]
        : newNotes.includes(" | İPTAL")
          ? newNotes.split(" | İPTAL")[0]
          : newNotes === "İPTAL"
            ? ""
            : newNotes;
      const finalNotes = customPlate.trim()
        ? cleanNotes
          ? `${cleanNotes} | Plaka: ${customPlate.trim()}`
          : `Plaka: ${customPlate.trim()}`
        : cleanNotes;
      updateTaskMutation.mutate(
        {
          id: task.id,
          data: {
            vehicleId: null,
            notes: finalNotes || null,
            status: "draft",
          },
        },
        {
          onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
        },
      );
      return;
    }
    const vId = vehicleIdVal === "" ? null : Number(vehicleIdVal);
    const selectedVehicle = (vehicles as any[]).find((v) => v.id === vId);
    let newNotes = task.notes ?? "";
    const cleanNotes = newNotes.includes(" | Plaka:")
      ? newNotes.split(" | Plaka:")[0]
      : newNotes.includes(" | İPTAL")
        ? newNotes.split(" | İPTAL")[0]
        : newNotes === "İPTAL"
          ? ""
          : newNotes;
    if (selectedVehicle) {
      newNotes = cleanNotes
        ? `${cleanNotes} | Plaka: ${selectedVehicle.plate}`
        : `Plaka: ${selectedVehicle.plate}`;
    } else {
      newNotes = cleanNotes;
    }
    updateTaskMutation.mutate(
      {
        id: task.id,
        data: {
          vehicleId: vId,
          notes: newNotes || null,
          status: "draft",
        },
      },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
      },
    );
  };

  const handleKmChange = (taskId: number, kmVal: string) => {
    const kmNum = kmVal === "" ? null : Number(kmVal);
    updateTaskMutation.mutate(
      { id: taskId, data: { km: kmNum } },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
      },
    );
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
      },
    );
  };

  // ── Vehicle plate select widget (shared) ────────────────────────────────
  const PlateSelect = ({ task }: { task: Task }) => (
    <select
      className={`w-full bg-transparent p-1 font-semibold focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 cursor-pointer rounded transition-all duration-150 ${
        task.status === "cancelled"
          ? "text-rose-700 dark:text-rose-400 opacity-80"
          : "text-primary"
      }`}
      value={
        task.status === "cancelled"
          ? "cancelled"
          : (task.vehicleId ??
            (getPlateFromNotes(task.notes)
              ? `custom:${getPlateFromNotes(task.notes)}`
              : ""))
      }
      onChange={(e) => handlePlateChange(task, e.target.value)}
    >
      <option value="">Plaka Seçin...</option>
      <option value="cancelled" className="text-red-600 font-bold">
        İPTAL
      </option>
      <option value="custom_prompt" className="text-blue-600 font-bold">
        ✍️ Özel Plaka Yaz...
      </option>
      {task.vehicleId === null && getPlateFromNotes(task.notes) && (
        <option
          value={`custom:${getPlateFromNotes(task.notes)}`}
          className="font-bold text-blue-600"
        >
          {getPlateFromNotes(task.notes)}
        </option>
      )}
      {(vehicles as any[]).map((v) => (
        <option key={v.id} value={v.id}>
          {v.plate} — {v.driverName}
        </option>
      ))}
    </select>
  );

  // ── Drop zone wrapper for plate cell ───────────────────────────────────
  const PlateDropCell = ({
    task,
    className,
  }: {
    task: Task;
    className?: string;
  }) => {
    const isExcelCompleted = task.status === "completed";
    const isAssigned = !!task.vehicleId;
    const isNotified = task.status === "assigned";
    const isDraft = task.status === "draft";

    return (
      <td
        className={`p-1.5 transition-colors relative ${
          dragOverTaskId === task.id
            ? "bg-primary/10 ring-1 ring-inset ring-primary/40 rounded"
            : ""
        } ${isExcelCompleted ? "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-semibold" : ""} ${className ?? ""}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("text/vehicle-id")) {
            e.preventDefault();
            setDragOverTaskId(task.id);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragOverTaskId(null);
          }
        }}
        onDrop={(e) => handleTaskDrop(e, task)}
      >
        <div className="flex flex-col gap-1 w-full">
          <PlateSelect task={task} />
          {isAssigned && !isExcelCompleted && (
            <div className="flex items-center justify-between px-1 text-[10px] select-none">
              {isNotified ? (
                <span className="flex items-center gap-0.5 text-emerald-600 font-semibold">
                  <span className="w-3 h-3 rounded-full bg-emerald-100 flex items-center justify-center text-[9px] text-emerald-600 font-bold">
                    ✓
                  </span>
                  Bildirildi
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-0.5 text-slate-500 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-[8px]"></span>
                    Bildirilmedi
                  </span>
                  <button
                    onClick={() => handleNotifySingle(task.id)}
                    disabled={notifyMutation.isPending}
                    className="px-1.5 py-0.5 bg-primary text-primary-foreground hover:bg-primary/95 text-[9px] font-bold rounded shadow-xs transition-all"
                  >
                    {notifyMutation.isPending ? "..." : "Bildir"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </td>
    );
  };

  const handleDownloadExcel = () => {
    window.open(`/api/excel/download?date=${selectedDate}`, "_blank");
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
  };

  // ── Shared resize-handle cell ───────────────────────────────────────────
  const ResizeTh = ({
    tableType,
    colIndex,
    className,
    children,
  }: {
    tableType: "regular" | "extra" | "technical";
    colIndex: number;
    className?: string;
    children?: React.ReactNode;
  }) => (
    <th
      className={`relative font-bold p-2 overflow-visible ${className ?? ""}`}
    >
      {children}
      <div
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-emerald-500/50 active:bg-emerald-500 select-none z-30 transition-colors"
        onMouseDown={(e) => startResize(tableType, colIndex, e)}
      />
    </th>
  );

  return (
    <div className="flex flex-col h-full gap-4">
      {/* ── Double-click edit modal ──────────────────────────────────────── */}
      {editingTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingTask(null);
          }}
        >
          <div className="bg-card border rounded-xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Pencil className="w-4 h-4 text-primary" />
                Görevi Düzenle
              </h2>
              <button
                onClick={() => setEditingTask(null)}
                className="w-7 h-7 rounded hover:bg-muted flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  UÇUŞ KODU
                </label>
                <input
                  type="text"
                  className="border rounded px-2 py-1.5 text-sm font-mono bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 uppercase"
                  value={editForm.flightCode}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, flightCode: e.target.value.toUpperCase() }))
                  }
                  placeholder="Örn: TK123"
                />
              </div>

              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  {editingTask.type === "technical" ? "TEKNİK AÇIKLAMA" : "OTEL ADI"}
                </label>
                <input
                  type="text"
                  className="border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                  value={editForm.hotelName}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, hotelName: e.target.value }))
                  }
                  placeholder={editingTask.type === "technical" ? "Örn: Araç Bakımı" : "Örn: Rixos"}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  SAAT (UTC)
                </label>
                <input
                  type="time"
                  className="border rounded px-2 py-1.5 text-sm font-mono bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                  value={editForm.time}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, time: e.target.value }))
                  }
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  KM
                </label>
                <input
                  type="number"
                  min={0}
                  className="border rounded px-2 py-1.5 text-sm font-mono bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                  value={editForm.km}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, km: e.target.value }))
                  }
                  placeholder="KM"
                />
              </div>

              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  EKİP / NOTLAR
                </label>
                <input
                  type="text"
                  className="border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="Örn: 2CPT 1KBN"
                />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              💡 Saati değiştirirseniz sıralama otomatik güncellenir. Gece
              yarısını geçen işler için saati <strong>20:00 üzeri UTC</strong>{" "}
              olarak bırakın.
            </p>

            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingTask(null)}
              >
                İptal
              </Button>
              <Button
                size="sm"
                onClick={handleEditSave}
                disabled={editSaving}
                className="gap-1.5"
              >
                {editSaving ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Kaydet
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Double-click add modal ───────────────────────────────────────── */}
      {addingTaskState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAddingTaskState(null);
          }}
        >
          <div className="bg-card border rounded-xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" />
                Yeni İş Ekle
              </h2>
              <button
                onClick={() => setAddingTaskState(null)}
                className="w-7 h-7 rounded hover:bg-muted flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  UÇUŞ KODU
                </label>
                <input
                  type="text"
                  className="border rounded px-2 py-1.5 text-sm font-mono bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 uppercase"
                  value={addForm.flightCode}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, flightCode: e.target.value.toUpperCase() }))
                  }
                  placeholder="Örn: TK123"
                />
              </div>

              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  {addingTaskState.type === "technical" ? "TEKNİK AÇIKLAMA" : "OTEL ADI"}
                </label>
                <input
                  type="text"
                  className="border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                  value={addForm.hotelName}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, hotelName: e.target.value }))
                  }
                  placeholder={addingTaskState.type === "technical" ? "Örn: Araç Bakımı" : "Örn: Rixos"}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  SAAT (UTC)
                </label>
                <input
                  type="time"
                  className="border rounded px-2 py-1.5 text-sm font-mono bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                  value={addForm.time}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, time: e.target.value }))
                  }
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  KM
                </label>
                <input
                  type="number"
                  min={0}
                  className="border rounded px-2 py-1.5 text-sm font-mono bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                  value={addForm.km}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, km: e.target.value }))
                  }
                  placeholder="KM"
                />
              </div>

              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  EKİP / NOTLAR
                </label>
                <input
                  type="text"
                  className="border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                  value={addForm.notes}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  placeholder="Örn: 2CPT 1KBN"
                />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              💡 Eklenen iş, girilen saate göre otomatik olarak diğer işlerin arasına sıralanacaktır.
            </p>

            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAddingTaskState(null)}
              >
                İptal
              </Button>
              <Button
                size="sm"
                onClick={handleAddSave}
                disabled={editSaving}
                className="gap-1.5"
              >
                {editSaving ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                Kaydet
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Title — hidden on mobile (layout header serves that role) */}
          <div className="hidden md:block">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight leading-tight flex items-center gap-2">
              <FileSpreadsheet className="text-emerald-600" />
              Excel Sefer Görünümü
            </h1>
            <p className="text-muted-foreground text-xs md:text-sm">
              Sürücü plaka ve KM girişini doğrudan tanıdık spreadsheet
              ızgarasında yapın
            </p>
          </div>
          <div className="flex items-center gap-2 bg-muted/30 p-1.5 rounded-md border border-slate-100 dark:border-slate-800">
            <span className="text-xs font-semibold text-muted-foreground pl-1 hidden md:inline">
              Vardiya Tarihi:
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border bg-card px-3 text-xs font-medium focus-visible:ring-2 hover:bg-slate-50 dark:hover:bg-slate-900 flex items-center gap-2 rounded-md"
                >
                  <CalendarIcon className="w-3.5 h-3.5 text-emerald-600" />
                  {selectedDate
                    ? format(new Date(selectedDate), "dd MMM yyyy", {
                        locale: tr,
                      })
                    : ""}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0 border shadow-md rounded-md bg-popover z-50"
                align="start"
              >
                <Calendar
                  mode="single"
                  selected={selectedDate ? new Date(selectedDate) : undefined}
                  onSelect={handleDateSelect}
                  modifiers={calendarModifiers}
                  modifiersClassNames={{
                    completed:
                      "!bg-emerald-500 !text-white hover:!bg-emerald-600 dark:!bg-emerald-600 dark:hover:!bg-emerald-700 font-semibold rounded-md",
                    uncompleted:
                      "!bg-amber-400 !text-amber-950 hover:!bg-amber-500 dark:!bg-amber-500 dark:hover:!bg-amber-600 font-semibold rounded-md",
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
            size="sm"
            onClick={handleDownloadExcel}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
          >
            <Download className="w-4 h-4 md:mr-1.5" />
            <span className="hidden md:inline">Excel İndir</span>
          </Button>
        </div>
      </div>

      {/* ── Main layout: queue panel + tables (DESKTOP only) ─────────────── */}
      <div className="hidden md:flex gap-4 flex-1 min-h-0">
        {/* ── Vehicle Queue Panel ────────────────────────────────────────── */}
        <Card
          className="flex flex-col shrink-0 border-slate-200/80 shadow-sm overflow-hidden"
          style={{ width: queueCollapsed ? 44 : 220 }}
        >
          {/* Queue header */}
          <div className="p-2 border-b bg-card flex items-center justify-between shrink-0 gap-1">
            {!queueCollapsed && (
              <div className="flex items-center gap-1.5 min-w-0">
                <Users className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-xs font-bold truncate">ARAÇ SIRASI</span>
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1 py-0 ml-0.5 shrink-0"
                >
                  {localQueue.length}
                </Badge>
              </div>
            )}
            <button
              className="w-7 h-7 rounded hover:bg-muted flex items-center justify-center shrink-0 transition-colors"
              onClick={() => setQueueCollapsed((c) => !c)}
              title={queueCollapsed ? "Sırayı göster" : "Sırayı gizle"}
            >
              {queueCollapsed ? (
                <ChevronDown className="w-4 h-4 rotate-[-90deg]" />
              ) : (
                <ChevronUp className="w-4 h-4 rotate-[-90deg]" />
              )}
            </button>
          </div>

          {!queueCollapsed && (
            <>
              {/* Queue items */}
              <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5 min-h-0">
                {localQueue.length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-4">
                    Sırada araç yok
                  </p>
                )}
                {localQueue.map((v: any, idx) => (
                  <div
                    key={v.id}
                    draggable
                    onDragStart={(e) => {
                      handleQueueDragStart(idx);
                      handleVehicleDragStart(e, v.id);
                    }}
                    onDragOver={(e) => handleQueueDragOver(e, idx)}
                    onDragEnd={handleQueueDragEnd}
                    className={`rounded-md p-2 text-[11px] border cursor-grab active:cursor-grabbing transition-all duration-100 flex flex-col gap-0.5 group relative
                      ${
                        v.type === "outsource"
                          ? "border-dashed border-amber-300 bg-amber-50/40 dark:bg-amber-950/10"
                          : "border bg-card hover:bg-muted/10"
                      } ${draggedQueueIndex === idx ? "opacity-40 scale-95" : ""}`}
                  >
                    <div className="flex items-center gap-1">
                      <GripVertical className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                      <Badge
                        variant="secondary"
                        className="font-mono bg-blue-100 text-blue-800 text-[9px] px-1 py-0 rounded shrink-0 font-extrabold dark:bg-blue-950 dark:text-blue-300"
                      >
                        #{idx + 1}
                      </Badge>
                      <span className="font-mono font-bold text-[11px] truncate text-foreground">
                        {v.plate}
                      </span>
                      <button
                        className="ml-auto opacity-0 group-hover:opacity-100 w-4 h-4 rounded hover:bg-rose-100 text-muted-foreground hover:text-rose-500 flex items-center justify-center transition-all shrink-0"
                        onClick={() => handleRemoveFromQueue(v.id)}
                        title="Sıradan çıkar"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate pl-4">
                      {v.driverName || "—"}
                    </span>
                  </div>
                ))}
              </div>

              {/* Add to queue */}
              <div className="shrink-0 border-t p-2">
                {isAddQueueOpen ? (
                  <div className="flex flex-col gap-1.5">
                    <select
                      className="w-full text-[11px] border rounded px-1.5 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                      value={selectedVehicleId}
                      onChange={(e) => setSelectedVehicleId(e.target.value)}
                    >
                      <option value="">Araç seç...</option>
                      {availableVehicles.map((v: any) => (
                        <option key={v.id} value={v.id}>
                          {v.plate} — {v.driverName}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="flex-1 h-6 text-[10px] px-1"
                        onClick={handleAddToQueue}
                        disabled={!selectedVehicleId}
                      >
                        Ekle
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] px-1"
                        onClick={() => {
                          setIsAddQueueOpen(false);
                          setSelectedVehicleId("");
                        }}
                      >
                        İptal
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-[11px] gap-1"
                    onClick={() => setIsAddQueueOpen(true)}
                  >
                    <Plus className="w-3 h-3" /> Sıraya Ekle
                  </Button>
                )}
              </div>
            </>
          )}
        </Card>

        {/* ── Tables column ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
          {/* ── Regular tasks table ───────────────────────────────────────── */}
          <Card className="flex-1 overflow-hidden flex flex-col min-h-0 border-slate-200/80 shadow-sm">
            <div className="p-3 border-b bg-card shrink-0 flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="bg-blue-50 text-blue-700 border-blue-200"
                >
                  GELİR (GELEN UÇUŞLAR)
                </Badge>
                <span className="text-muted-foreground text-xs">&bull;</span>
                <Badge
                  variant="outline"
                  className="bg-amber-50 text-amber-700 border-amber-200"
                >
                  GİDER (GİDEN UÇUŞLAR)
                </Badge>
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground">
                  {leftRegular.length} Gelir / {rightRegular.length} Gider
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-2 py-0 font-bold border-blue-200 bg-blue-50/10 text-blue-700 hover:bg-blue-50 gap-1 rounded"
                    onClick={() => {
                      setAddingTaskState({ tableType: "left", type: "hotel_pickup" });
                      setAddForm({ flightCode: "", time: "09:00", notes: "", km: "", hotelName: "" });
                    }}
                  >
                    <Plus className="w-3 h-3 text-blue-600" />
                    + Sol Ekle
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-2 py-0 font-bold border-amber-200 bg-amber-50/10 text-amber-700 hover:bg-amber-50 gap-1 rounded"
                    onClick={() => {
                      setAddingTaskState({ tableType: "right", type: "airport_run" });
                      setAddForm({ flightCode: "", time: "09:00", notes: "", km: "", hotelName: "" });
                    }}
                  >
                    <Plus className="w-3 h-3 text-amber-600" />
                    + Sağ Ekle
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse text-xs font-mono select-none table-fixed">
                <colgroup>
                  {regularWidths.map((w, idx) => (
                    <col key={idx} style={{ width: w }} />
                  ))}
                </colgroup>
                <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-20 border-b shadow-[0_1px_0_rgba(0,0,0,0.05)]">
                  <tr className="divide-x divide-y divide-border">
                    <ResizeTh
                      tableType="regular"
                      colIndex={0}
                      className="bg-blue-500/5 text-blue-700 text-center"
                    >
                      S.NO
                    </ResizeTh>
                    <ResizeTh
                      tableType="regular"
                      colIndex={1}
                      className="bg-blue-500/5 text-blue-700 text-left"
                    >
                      UÇUŞ KODU
                    </ResizeTh>
                    <ResizeTh
                      tableType="regular"
                      colIndex={2}
                      className="bg-blue-500/5 text-blue-700 text-left"
                    >
                      PLAKA (SÜRÜCÜ)
                    </ResizeTh>
                    <ResizeTh
                      tableType="regular"
                      colIndex={3}
                      className="bg-blue-500/5 text-blue-700 text-center"
                    >
                      SAAT
                    </ResizeTh>
                    <ResizeTh
                      tableType="regular"
                      colIndex={4}
                      className="bg-blue-500/5 text-blue-700 text-left"
                    >
                      OTEL ADI / NEREDEN
                    </ResizeTh>
                    <ResizeTh
                      tableType="regular"
                      colIndex={5}
                      className="bg-blue-500/5 text-blue-700 text-left"
                    >
                      EKİP (KİŞİ)
                    </ResizeTh>
                    <ResizeTh
                      tableType="regular"
                      colIndex={6}
                      className="bg-blue-500/5 text-blue-700 text-center"
                    >
                      KM
                    </ResizeTh>
                    <ResizeTh
                      tableType="regular"
                      colIndex={7}
                      className="bg-slate-100 dark:bg-slate-800"
                    />
                    <ResizeTh
                      tableType="regular"
                      colIndex={8}
                      className="bg-amber-500/5 text-amber-700 text-left"
                    >
                      UÇUŞ KODU
                    </ResizeTh>
                    <ResizeTh
                      tableType="regular"
                      colIndex={9}
                      className="bg-amber-500/5 text-amber-700 text-left"
                    >
                      PLAKA (SÜRÜCÜ)
                    </ResizeTh>
                    <ResizeTh
                      tableType="regular"
                      colIndex={10}
                      className="bg-amber-500/5 text-amber-700 text-center"
                    >
                      SAAT
                    </ResizeTh>
                    <ResizeTh
                      tableType="regular"
                      colIndex={11}
                      className="bg-amber-500/5 text-amber-700 text-left"
                    >
                      OTEL ADI / NEREYE
                    </ResizeTh>
                    <ResizeTh
                      tableType="regular"
                      colIndex={12}
                      className="bg-amber-500/5 text-amber-700 text-left"
                    >
                      EKİP (KİŞİ)
                    </ResizeTh>
                    <ResizeTh
                      tableType="regular"
                      colIndex={13}
                      className="bg-amber-500/5 text-amber-700 text-center"
                    >
                      KM
                    </ResizeTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Array.from({ length: maxRegularRows }).map((_, idx) => {
                    const leftTask = leftRegular[idx] as
                      | ExtendedTask
                      | undefined;
                    const rightTask = rightRegular[idx] as
                      | ExtendedTask
                      | undefined;
                    const lc = leftTask?.status === "cancelled";
                    const rc = rightTask?.status === "cancelled";
                    return (
                      <tr
                        key={idx}
                        className="divide-x divide-border hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors cursor-default"
                      >
                        {leftTask ? (
                          <>
                            <td
                              className={`p-1.5 text-center font-bold cursor-pointer ${lc ? "bg-rose-50/40 text-rose-700/60 line-through dark:bg-rose-950/20 dark:text-rose-400/50" : "text-muted-foreground bg-slate-50/50 dark:bg-slate-900/10"}`}
                              onDoubleClick={() => openEdit(leftTask)}
                              title="Çift tıklayarak düzenle"
                            >
                              {idx + 1}
                            </td>
                            <td
                              className={`p-1.5 font-bold uppercase cursor-pointer ${lc ? "opacity-60 line-through text-rose-900/80 bg-rose-50/20 dark:text-rose-400/60 dark:bg-rose-950/10" : ""}`}
                              title={leftTask.flightCode ?? ""}
                              onDoubleClick={() => openEdit(leftTask)}
                            >
                              <div className="truncate w-full">
                                {leftTask.flightCode || "-"}
                              </div>
                            </td>
                            <PlateDropCell
                              task={leftTask}
                              className={
                                lc ? "bg-rose-50/20 dark:bg-rose-950/10" : ""
                              }
                            />
                            <td
                              className={`p-1.5 text-center font-bold bg-blue-50/10 dark:bg-blue-950/10 cursor-pointer ${lc ? "text-rose-700/60 bg-rose-50/20 line-through dark:text-rose-400/50 dark:bg-blue-950/10" : "text-blue-600 dark:text-blue-400"}`}
                              onDoubleClick={() => openEdit(leftTask)}
                            >
                              {utcTime(leftTask.scheduledTime)}
                            </td>
                            <td
                              className={`p-1.5 font-medium cursor-pointer ${lc ? "opacity-60 line-through text-rose-900/80 bg-rose-50/20 dark:text-rose-400/60 dark:bg-rose-950/10" : ""}`}
                              title={leftTask.pickupLocation}
                              onDoubleClick={() => openEdit(leftTask)}
                            >
                              <div className="truncate w-full">
                                {leftTask.pickupLocation}
                              </div>
                            </td>
                            <td
                              className={`p-1.5 font-medium cursor-pointer ${lc ? "opacity-60 line-through text-rose-900/80 bg-rose-50/20 dark:text-rose-400/60 dark:bg-rose-950/10" : "text-muted-foreground"}`}
                              title={leftTask.notes ?? ""}
                              onDoubleClick={() => openEdit(leftTask)}
                            >
                              <div className="truncate w-full">
                                {leftTask.notes &&
                                (leftTask.notes.includes("CPT") ||
                                  leftTask.notes.includes("KBN") ||
                                  leftTask.notes
                                    .toLowerCase()
                                    .includes("cpt") ||
                                  leftTask.notes.toLowerCase().includes("kbn"))
                                  ? leftTask.notes.includes(" | Plaka:")
                                    ? leftTask.notes.split(" | Plaka:")[0]
                                    : leftTask.notes
                                  : `${leftTask.passengerCount} kişi`}
                              </div>
                            </td>
                            <td
                              className={`p-1 ${lc ? "bg-rose-50/10 dark:bg-rose-950/10 opacity-60" : ""}`}
                            >
                              <input
                                type="number"
                                min={0}
                                disabled={lc}
                                className="w-full bg-transparent p-1 text-center font-bold focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 rounded transition-all duration-150"
                                defaultValue={
                                  leftTask.km != null ? Number(leftTask.km) : ""
                                }
                                placeholder="KM"
                                onBlur={(e) =>
                                  handleKmChange(leftTask.id, e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                }}
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-1.5 text-center text-muted-foreground bg-slate-50/50 dark:bg-slate-900/10 font-bold">
                              {idx + 1}
                            </td>
                            <td
                              colSpan={6}
                              className="bg-slate-50/10 hover:bg-slate-100/30 cursor-pointer transition-colors"
                              onDoubleClick={() => {
                                setAddingTaskState({ tableType: "left", type: "hotel_pickup" });
                                setAddForm({ flightCode: "", time: "09:00", notes: "", km: "", hotelName: "" });
                              }}
                              title="Çift tıklayarak yeni Gelir (Sol) işi ekle"
                            />
                          </>
                        )}
                        <td className="bg-slate-100 dark:bg-slate-800 p-0" />
                        {rightTask ? (
                          <>
                            <td
                              className={`p-1.5 font-bold uppercase cursor-pointer ${rc ? "opacity-60 line-through text-rose-900/80 bg-rose-50/20 dark:text-rose-400/60 dark:bg-rose-950/10" : ""}`}
                              title={rightTask.flightCode ?? ""}
                              onDoubleClick={() => openEdit(rightTask)}
                            >
                              <div className="truncate w-full">
                                {rightTask.flightCode || "-"}
                              </div>
                            </td>
                            <PlateDropCell
                              task={rightTask}
                              className={
                                rc ? "bg-rose-50/20 dark:bg-rose-950/10" : ""
                              }
                            />
                            <td
                              className={`p-1.5 text-center font-bold bg-amber-50/10 dark:bg-amber-950/10 cursor-pointer ${rc ? "text-rose-700/60 bg-rose-50/20 line-through dark:text-rose-400/50 dark:bg-rose-950/10" : "text-amber-600"}`}
                              onDoubleClick={() => openEdit(rightTask)}
                            >
                              {utcTime(rightTask.scheduledTime)}
                            </td>
                            <td
                              className={`p-1.5 font-medium cursor-pointer ${rc ? "opacity-60 line-through text-rose-900/80 bg-rose-50/20 dark:text-rose-400/60 dark:bg-rose-950/10" : ""}`}
                              title={rightTask.dropoffLocation}
                              onDoubleClick={() => openEdit(rightTask)}
                            >
                              <div className="truncate w-full">
                                {rightTask.dropoffLocation}
                              </div>
                            </td>
                            <td
                              className={`p-1.5 font-medium cursor-pointer ${rc ? "opacity-60 line-through text-rose-900/80 bg-rose-50/20 dark:text-rose-400/60 dark:bg-rose-950/10" : "text-muted-foreground"}`}
                              title={rightTask.notes ?? ""}
                              onDoubleClick={() => openEdit(rightTask)}
                            >
                              <div className="truncate w-full">
                                {rightTask.notes &&
                                (rightTask.notes.includes("CPT") ||
                                  rightTask.notes.includes("KBN") ||
                                  rightTask.notes
                                    .toLowerCase()
                                    .includes("cpt") ||
                                  rightTask.notes.toLowerCase().includes("kbn"))
                                  ? rightTask.notes.includes(" | Plaka:")
                                    ? rightTask.notes.split(" | Plaka:")[0]
                                    : rightTask.notes
                                  : `${rightTask.passengerCount} kişi`}
                              </div>
                            </td>
                            <td
                              className={`p-1 ${rc ? "bg-rose-50/10 dark:bg-rose-950/10 opacity-60" : ""}`}
                            >
                              <input
                                type="number"
                                min={0}
                                disabled={rc}
                                className="w-full bg-transparent p-1 text-center font-bold focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 rounded transition-all duration-150"
                                defaultValue={
                                  rightTask.km != null
                                    ? Number(rightTask.km)
                                    : ""
                                }
                                placeholder="KM"
                                onBlur={(e) =>
                                  handleKmChange(rightTask.id, e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                }}
                              />
                            </td>
                          </>
                        ) : (
                          <td
                            colSpan={6}
                            className="bg-slate-50/10 hover:bg-slate-100/30 cursor-pointer transition-colors"
                            onDoubleClick={() => {
                              setAddingTaskState({ tableType: "right", type: "airport_run" });
                              setAddForm({ flightCode: "", time: "09:00", notes: "", km: "", hotelName: "" });
                            }}
                            title="Çift tıklayarak yeni Gider (Sağ) işi ekle"
                          />
                        )}
                      </tr>
                    );
                  })}
                  {maxRegularRows === 0 && (
                    <tr>
                      <td
                        colSpan={14}
                        className="p-8 text-center text-muted-foreground hover:bg-slate-50/50 cursor-pointer transition-colors"
                        onDoubleClick={() => {
                          setAddingTaskState({ tableType: "left", type: "hotel_pickup" });
                          setAddForm({ flightCode: "", time: "09:00", notes: "", km: "", hotelName: "" });
                        }}
                        title="Çift tıklayarak yeni iş ekle"
                      >
                        Seçilen güne ait düzenli sefer kaydı bulunmamaktadır. Yeni eklemek için çift tıklayın.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── Extras table ──────────────────────────────────────────────── */}
          <Card className="overflow-hidden border-slate-200/80 shadow-sm max-h-[240px] flex flex-col shrink-0">
            <div className="p-3 border-b bg-card shrink-0 flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="bg-amber-100 text-amber-800 border-amber-300"
                >
                  EKSTRA GİDER
                </Badge>
                <span className="text-muted-foreground text-xs">&bull;</span>
                <Badge
                  variant="outline"
                  className="bg-emerald-100 text-emerald-800 border-emerald-300"
                >
                  EKSTRA GELİR
                </Badge>
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground">
                  {leftExtras.length + rightExtras.length} Ekstra
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-2 py-0 font-bold border-amber-200 bg-amber-50/10 text-amber-700 hover:bg-amber-50 gap-1 rounded"
                    onClick={() => {
                      setAddingTaskState({ tableType: "left", type: "extra" });
                      setAddForm({ flightCode: "", time: "09:00", notes: "", km: "", hotelName: "" });
                    }}
                  >
                    <Plus className="w-3 h-3 text-amber-600" />
                    + Ekstra Gider Ekle
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-2 py-0 font-bold border-emerald-200 bg-emerald-50/10 text-emerald-700 hover:bg-emerald-50 gap-1 rounded"
                    onClick={() => {
                      setAddingTaskState({ tableType: "right", type: "extra" });
                      setAddForm({ flightCode: "", time: "09:00", notes: "", km: "", hotelName: "" });
                    }}
                  >
                    <Plus className="w-3 h-3 text-emerald-600" />
                    + Ekstra Gelir Ekle
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse text-xs font-mono table-fixed">
                <colgroup>
                  {extraWidths.map((w, idx) => (
                    <col key={idx} style={{ width: w }} />
                  ))}
                </colgroup>
                <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-20 border-b shadow-[0_1px_0_rgba(0,0,0,0.05)]">
                  <tr className="divide-x divide-y divide-border">
                    <ResizeTh
                      tableType="extra"
                      colIndex={0}
                      className="bg-amber-500/5 text-amber-800 text-center"
                    >
                      S.NO
                    </ResizeTh>
                    <ResizeTh
                      tableType="extra"
                      colIndex={1}
                      className="bg-amber-500/5 text-amber-800 text-center"
                    >
                      SAAT
                    </ResizeTh>
                    <ResizeTh
                      tableType="extra"
                      colIndex={2}
                      className="bg-amber-500/5 text-amber-800 text-left"
                    >
                      PLAKA (SÜRÜCÜ)
                    </ResizeTh>
                    <ResizeTh
                      tableType="extra"
                      colIndex={3}
                      className="bg-amber-500/5 text-amber-800 text-left"
                    >
                      OTEL / AÇIKLAMA
                    </ResizeTh>
                    <ResizeTh
                      tableType="extra"
                      colIndex={4}
                      className="bg-slate-100 dark:bg-slate-800"
                    />
                    <ResizeTh
                      tableType="extra"
                      colIndex={5}
                      className="bg-emerald-500/5 text-emerald-800 text-center"
                    >
                      SAAT
                    </ResizeTh>
                    <ResizeTh
                      tableType="extra"
                      colIndex={6}
                      className="bg-emerald-500/5 text-emerald-800 text-left"
                    >
                      PLAKA (SÜRÜCÜ)
                    </ResizeTh>
                    <ResizeTh
                      tableType="extra"
                      colIndex={7}
                      className="bg-emerald-500/5 text-emerald-800 text-left"
                    >
                      OTEL / AÇIKLAMA
                    </ResizeTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Array.from({ length: maxExtraRows }).map((_, idx) => {
                    const le = leftExtras[idx] as ExtendedTask | undefined;
                    const re = rightExtras[idx] as ExtendedTask | undefined;
                    const lec = le?.status === "cancelled";
                    const rec = re?.status === "cancelled";
                    return (
                      <tr
                        key={idx}
                        className="divide-x divide-border hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors"
                      >
                        {le ? (
                          <>
                            <td
                              className={`p-1.5 text-center font-bold cursor-pointer ${lec ? "bg-rose-50/40 text-rose-700/60 line-through dark:bg-rose-950/20 dark:text-rose-400/50" : "text-muted-foreground bg-slate-50/50 dark:bg-slate-900/10"}`}
                              onDoubleClick={() => le && openEdit(le)}
                              title="Çift tıklayarak düzenle"
                            >
                              {idx + 1}
                            </td>
                            <td
                              className={`p-1.5 text-center font-bold bg-amber-50/10 cursor-pointer ${lec ? "text-rose-700/60 bg-rose-50/20 line-through dark:text-rose-400/50 dark:bg-rose-950/10" : "text-amber-600"}`}
                              onDoubleClick={() => le && openEdit(le)}
                            >
                              {utcTime(le.scheduledTime)}
                            </td>
                            <PlateDropCell
                              task={le}
                              className={
                                lec ? "bg-rose-50/20 dark:bg-rose-950/10" : ""
                              }
                            />
                            <td
                              className={`p-1.5 font-medium cursor-pointer ${lec ? "opacity-60 line-through text-rose-900/80 bg-rose-50/20 dark:text-rose-400/60 dark:bg-rose-950/10" : ""}`}
                              title={le.pickupLocation}
                              onDoubleClick={() => le && openEdit(le)}
                            >
                              <div className="truncate w-full">
                                {le.pickupLocation}
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-1.5 text-center text-muted-foreground bg-slate-50/50 dark:bg-slate-900/10 font-bold">
                              {idx + 1}
                            </td>
                            <td
                              colSpan={3}
                              className="bg-slate-50/10 hover:bg-slate-100/30 cursor-pointer transition-colors"
                              onDoubleClick={() => {
                                setAddingTaskState({ tableType: "left", type: "extra" });
                                setAddForm({ flightCode: "", time: "09:00", notes: "", km: "", hotelName: "" });
                              }}
                              title="Çift tıklayarak yeni Ekstra Gider (Sol) işi ekle"
                            />
                          </>
                        )}
                        <td className="bg-slate-100 dark:bg-slate-800 p-0" />
                        {re ? (
                          <>
                            <td
                              className={`p-1.5 text-center font-bold bg-emerald-50/10 cursor-pointer ${rec ? "text-rose-700/60 bg-rose-50/20 line-through dark:text-rose-400/50 dark:bg-rose-950/10" : "text-emerald-600"}`}
                              onDoubleClick={() => re && openEdit(re)}
                            >
                              {utcTime(re.scheduledTime)}
                            </td>
                            <PlateDropCell
                              task={re}
                              className={
                                rec ? "bg-rose-50/20 dark:bg-rose-950/10" : ""
                              }
                            />
                            <td
                              className={`p-1.5 font-medium cursor-pointer ${rec ? "opacity-60 line-through text-rose-900/80 bg-rose-50/20" : ""}`}
                              title={re.pickupLocation}
                              onDoubleClick={() => re && openEdit(re)}
                            >
                              <div className="truncate w-full">
                                {re.pickupLocation}
                              </div>
                            </td>
                          </>
                        ) : (
                          <td
                            colSpan={3}
                            className="bg-slate-50/10 hover:bg-slate-100/30 cursor-pointer transition-colors"
                            onDoubleClick={() => {
                              setAddingTaskState({ tableType: "right", type: "extra" });
                              setAddForm({ flightCode: "", time: "09:00", notes: "", km: "", hotelName: "" });
                            }}
                            title="Çift tıklayarak yeni Ekstra Gelir (Sağ) işi ekle"
                          />
                        )}
                      </tr>
                    );
                  })}
                  {maxExtraRows === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="p-6 text-center text-muted-foreground hover:bg-slate-50/50 cursor-pointer transition-colors"
                        onDoubleClick={() => {
                          setAddingTaskState({ tableType: "left", type: "extra" });
                          setAddForm({ flightCode: "", time: "09:00", notes: "", km: "", hotelName: "" });
                        }}
                        title="Çift tıklayarak yeni Ekstra işi ekle"
                      >
                        Seçilen güne ait ekstra sefer kaydı bulunmamaktadır. Yeni eklemek için çift tıklayın.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── Technical tasks table ─────────────────────────────────────── */}
          <Card className="overflow-hidden border-amber-200/80 shadow-sm max-h-[200px] flex flex-col shrink-0">
            <div className="p-3 border-b bg-amber-50/30 dark:bg-amber-950/10 shrink-0 flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-600" />
                <Badge
                  variant="outline"
                  className="bg-amber-100 text-amber-900 border-amber-300"
                >
                  TEKNİK İŞLER
                </Badge>
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground">
                  {technicalTasks.length} iş
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] px-2 py-0 font-bold border-amber-200 bg-amber-50/10 text-amber-700 hover:bg-amber-100 gap-1 rounded"
                  onClick={() => {
                    setAddingTaskState({ tableType: null, type: "technical" });
                    setAddForm({ flightCode: "", time: "09:00", notes: "", km: "", hotelName: "" });
                  }}
                >
                  <Plus className="w-3 h-3 text-amber-600" />
                  + Teknik İş Ekle
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse text-xs font-mono table-fixed">
                <colgroup>
                  {technicalWidths.map((w, idx) => (
                    <col key={idx} style={{ width: w }} />
                  ))}
                </colgroup>
                <thead className="bg-amber-50/60 dark:bg-amber-950/20 sticky top-0 z-20 border-b">
                  <tr className="divide-x divide-border">
                    <ResizeTh
                      tableType="technical"
                      colIndex={0}
                      className="text-amber-800 text-center"
                    >
                      S.NO
                    </ResizeTh>
                    <ResizeTh
                      tableType="technical"
                      colIndex={1}
                      className="text-amber-800 text-center"
                    >
                      SAAT
                    </ResizeTh>
                    <ResizeTh
                      tableType="technical"
                      colIndex={2}
                      className="text-amber-800 text-left"
                    >
                      PLAKA (SÜRÜCÜ)
                    </ResizeTh>
                    <ResizeTh
                      tableType="technical"
                      colIndex={3}
                      className="text-amber-800 text-left"
                    >
                      AÇIKLAMA
                    </ResizeTh>
                    <ResizeTh
                      tableType="technical"
                      colIndex={4}
                      className="text-amber-800 text-center"
                    >
                      KM
                    </ResizeTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {technicalTasks.map((task, idx) => {
                    const cancelled = task.status === "cancelled";
                    return (
                      <tr
                        key={task.id}
                        className="divide-x divide-border bg-amber-50/20 dark:bg-amber-950/5 hover:bg-amber-50/50 dark:hover:bg-amber-950/10 transition-colors"
                      >
                        <td
                          className={`p-1.5 text-center font-bold cursor-pointer ${cancelled ? "text-rose-700/60 line-through" : "text-amber-800/70"}`}
                          onDoubleClick={() => openEdit(task)}
                          title="Çift tıklayarak düzenle"
                        >
                          {idx + 1}
                        </td>
                        <td
                          className={`p-1.5 text-center font-bold cursor-pointer ${cancelled ? "text-rose-700/60 line-through" : "text-amber-700"}`}
                          onDoubleClick={() => openEdit(task)}
                        >
                          {utcTime(task.scheduledTime)}
                        </td>
                        <PlateDropCell
                          task={task}
                          className={cancelled ? "opacity-60" : ""}
                        />
                        <td
                          className={`p-1.5 font-medium cursor-pointer ${cancelled ? "opacity-60 line-through text-rose-900/80" : "text-foreground"}`}
                          title={task.pickupLocation}
                          onDoubleClick={() => openEdit(task)}
                        >
                          <div className="truncate w-full">
                            {task.pickupLocation}
                          </div>
                        </td>
                        <td className={`p-1 ${cancelled ? "opacity-60" : ""}`}>
                          <input
                            type="number"
                            min={0}
                            disabled={cancelled}
                            className="w-full bg-transparent p-1 text-center font-bold focus:outline-none focus:bg-background focus:ring-1 focus:ring-primary/30 hover:bg-amber-100/40 dark:hover:bg-amber-950/20 rounded transition-all duration-150"
                            defaultValue={
                              task.km != null ? Number(task.km) : ""
                            }
                            placeholder="KM"
                            onBlur={(e) =>
                              handleKmChange(task.id, e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur();
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {technicalTasks.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-6 text-center text-muted-foreground hover:bg-amber-50/50 cursor-pointer transition-colors"
                        onDoubleClick={() => {
                          setAddingTaskState({ tableType: null, type: "technical" });
                          setAddForm({ flightCode: "", time: "09:00", notes: "", km: "", hotelName: "" });
                        }}
                        title="Çift tıklayarak yeni Teknik işi ekle"
                      >
                        Seçilen güne ait teknik iş kaydı bulunmamaktadır. Yeni eklemek için çift tıklayın.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
           MOBILE VIEW — tab-based card layout (visible only on small screens)
         ══════════════════════════════════════════════════════════════════ */}
      <MobileExcelView
        dayTasks={dayTasks}
        leftRegular={leftRegular}
        rightRegular={rightRegular}
        leftExtras={leftExtras}
        rightExtras={rightExtras}
        technicalTasks={technicalTasks}
        vehicles={vehicles as any[]}
        localQueue={localQueue}
        draggedQueueIndex={draggedQueueIndex}
        handleQueueDragStart={handleQueueDragStart}
        handleQueueDragOver={handleQueueDragOver}
        handleQueueDragEnd={handleQueueDragEnd}
        handleRemoveFromQueue={handleRemoveFromQueue}
        handleAddToQueue={handleAddToQueue}
        isAddQueueOpen={isAddQueueOpen}
        setIsAddQueueOpen={setIsAddQueueOpen}
        selectedVehicleId={selectedVehicleId}
        setSelectedVehicleId={setSelectedVehicleId}
        availableVehicles={availableVehicles}
        handlePlateChange={handlePlateChange}
        getPlateFromNotes={getPlateFromNotes}
        openEdit={openEdit}
        tasksPending={tasksPending}
      />
    </div>
  );
}

// ── Mobile-only view ─────────────────────────────────────────────────────────
type MobileTab = "gelir" | "gider" | "ekstra" | "teknik" | "sira";

function MobileExcelView({
  leftRegular,
  rightRegular,
  leftExtras,
  rightExtras,
  technicalTasks,
  vehicles,
  localQueue,
  draggedQueueIndex,
  handleQueueDragStart,
  handleQueueDragOver,
  handleQueueDragEnd,
  handleRemoveFromQueue,
  handleAddToQueue,
  isAddQueueOpen,
  setIsAddQueueOpen,
  selectedVehicleId,
  setSelectedVehicleId,
  availableVehicles,
  handlePlateChange,
  getPlateFromNotes,
  openEdit,
}: {
  dayTasks: ExtendedTask[];
  leftRegular: ExtendedTask[];
  rightRegular: ExtendedTask[];
  leftExtras: ExtendedTask[];
  rightExtras: ExtendedTask[];
  technicalTasks: ExtendedTask[];
  vehicles: any[];
  localQueue: any[];
  draggedQueueIndex: number | null;
  handleQueueDragStart: (i: number) => void;
  handleQueueDragOver: (e: React.DragEvent, i: number) => void;
  handleQueueDragEnd: () => void;
  handleRemoveFromQueue: (id: number) => void;
  handleAddToQueue: () => void;
  isAddQueueOpen: boolean;
  setIsAddQueueOpen: (v: boolean) => void;
  selectedVehicleId: string;
  setSelectedVehicleId: (v: string) => void;
  availableVehicles: any[];
  handlePlateChange: (task: Task, val: string) => void;
  getPlateFromNotes: (notes: string | null | undefined) => string | null;
  openEdit: (task: Task) => void;
  tasksPending: boolean;
}) {
  const [activeTab, setActiveTab] = useState<MobileTab>("gelir");

  const tabs: {
    key: MobileTab;
    label: string;
    count: number;
    color: string;
  }[] = [
    {
      key: "gelir",
      label: "Gelir",
      count: leftRegular.length,
      color: "text-blue-600",
    },
    {
      key: "gider",
      label: "Gider",
      count: rightRegular.length,
      color: "text-amber-600",
    },
    {
      key: "ekstra",
      label: "Ekstra",
      count: leftExtras.length + rightExtras.length,
      color: "text-emerald-600",
    },
    {
      key: "teknik",
      label: "Teknik",
      count: technicalTasks.length,
      color: "text-orange-600",
    },
    {
      key: "sira",
      label: "Sıra",
      count: localQueue.length,
      color: "text-purple-600",
    },
  ];

  const activeTasks: ExtendedTask[] =
    activeTab === "gelir"
      ? leftRegular
      : activeTab === "gider"
        ? rightRegular
        : activeTab === "ekstra"
          ? [...leftExtras, ...rightExtras].sort(
              (a, b) =>
                new Date(a.scheduledTime).getTime() -
                new Date(b.scheduledTime).getTime(),
            )
          : activeTab === "teknik"
            ? technicalTasks
            : [];

  // ── Mobile task card ───────────────────────────────────────────────────
  const TaskCard = ({
    task,
    tabKey,
  }: {
    task: ExtendedTask;
    tabKey: MobileTab;
  }) => {
    const cancelled = task.status === "cancelled";
    const isGelir = tabKey === "gelir";
    const isGider = tabKey === "gider";
    const isEkstra = tabKey === "ekstra";
    const isTeknik = tabKey === "teknik";

    const accentColor = isGelir
      ? "border-l-blue-400"
      : isGider
        ? "border-l-amber-400"
        : isEkstra
          ? "border-l-emerald-400"
          : "border-l-orange-400";

    const timeColor = isGelir
      ? "text-blue-600"
      : isGider
        ? "text-amber-600"
        : isEkstra
          ? "text-emerald-600"
          : "text-orange-600";

    const location =
      isGider || isTeknik
        ? task.dropoffLocation || task.pickupLocation
        : task.pickupLocation;

    return (
      <div
        className={`rounded-lg border border-l-4 ${accentColor} bg-card shadow-sm p-3 flex flex-col gap-2 ${
          cancelled ? "opacity-60" : ""
        }`}
        onDoubleClick={() => openEdit(task)}
      >
        {/* Row 1: time + flight code + badge */}
        <div className="flex items-center gap-2">
          <span
            className={`font-mono font-bold text-base ${timeColor} ${cancelled ? "line-through" : ""}`}
          >
            {utcTime(task.scheduledTime)}
          </span>
          {task.flightCode && (
            <span
              className={`font-mono text-xs font-semibold bg-muted px-1.5 py-0.5 rounded uppercase ${cancelled ? "line-through text-muted-foreground" : ""}`}
            >
              {task.flightCode}
            </span>
          )}
          {cancelled && (
            <Badge
              variant="outline"
              className="text-rose-600 border-rose-300 text-[10px] px-1 py-0 ml-auto"
            >
              İPTAL
            </Badge>
          )}
        </div>

        {/* Row 2: location */}
        {location && (
          <div
            className={`text-sm font-medium truncate ${cancelled ? "line-through text-muted-foreground" : ""}`}
          >
            {location}
          </div>
        )}

        {/* Row 3: crew / passenger count */}
        {task.notes && !task.notes.startsWith("İPTAL") && (
          <div className="text-xs text-muted-foreground truncate">
            {task.notes.includes("CPT") || task.notes.includes("KBN")
              ? task.notes.includes(" | Plaka:")
                ? task.notes.split(" | Plaka:")[0]
                : task.notes
              : `${task.passengerCount ?? ""} kişi`}
          </div>
        )}

        {/* Row 4: plate selector */}
        <div className="mt-0.5">
          <select
            className={`w-full bg-muted/30 border rounded-md px-2 py-1.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer transition-all ${
              cancelled ? "text-rose-700 opacity-80" : "text-primary"
            }`}
            value={
              cancelled
                ? "cancelled"
                : (task.vehicleId ??
                  (getPlateFromNotes(task.notes)
                    ? `custom:${getPlateFromNotes(task.notes)}`
                    : ""))
            }
            onChange={(e) => handlePlateChange(task, e.target.value)}
          >
            <option value="">Plaka Seçin...</option>
            <option value="cancelled" className="text-red-600 font-bold">
              İPTAL
            </option>
            <option value="custom_prompt" className="text-blue-600 font-bold">
              ✍️ Özel Plaka Yaz...
            </option>
            {task.vehicleId === null && getPlateFromNotes(task.notes) && (
              <option
                value={`custom:${getPlateFromNotes(task.notes)}`}
                className="font-bold text-blue-600"
              >
                {getPlateFromNotes(task.notes)}
              </option>
            )}
            {vehicles.map((v: any) => (
              <option key={v.id} value={v.id}>
                {v.plate} — {v.driverName}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3 md:hidden">
      {/* Tab bar */}
      <div className="flex bg-muted/50 rounded-lg p-1 gap-0.5 overflow-x-auto shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-md text-[10px] font-bold transition-all ${
              activeTab === tab.key
                ? "bg-background shadow-sm " + tab.color
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="text-base leading-none font-mono">
              {tab.count}
            </span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Task cards */}
      {activeTab !== "sira" && (
        <div className="flex flex-col gap-2">
          {activeTasks.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">
              Bu sekmede görev bulunmuyor.
            </div>
          ) : (
            activeTasks.map((task) => (
              <TaskCard key={task.id} task={task} tabKey={activeTab} />
            ))
          )}
        </div>
      )}

      {/* Queue panel */}
      {activeTab === "sira" && (
        <div className="flex flex-col gap-2">
          {localQueue.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Sırada araç yok.
            </p>
          )}
          {localQueue.map((v: any, idx) => (
            <div
              key={v.id}
              className={`rounded-lg border bg-card shadow-sm p-3 flex items-center gap-3 ${
                draggedQueueIndex === idx ? "opacity-40" : ""
              }`}
            >
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs shrink-0">
                #{idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono font-bold text-sm">{v.plate}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {v.driverName || "—"}
                </div>
              </div>
              <button
                className="w-8 h-8 rounded hover:bg-rose-50 text-muted-foreground hover:text-rose-500 flex items-center justify-center transition-all shrink-0"
                onClick={() => handleRemoveFromQueue(v.id)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Add to queue */}
          <div className="mt-1">
            {isAddQueueOpen ? (
              <div className="flex flex-col gap-2 p-3 border rounded-lg bg-muted/20">
                <select
                  className="w-full border rounded px-2 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                >
                  <option value="">Araç seç...</option>
                  {availableVehicles.map((v: any) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} — {v.driverName}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    size="sm"
                    onClick={handleAddToQueue}
                    disabled={!selectedVehicleId}
                  >
                    Sıraya Ekle
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsAddQueueOpen(false);
                      setSelectedVehicleId("");
                    }}
                  >
                    İptal
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full gap-2"
                size="sm"
                onClick={() => setIsAddQueueOpen(true)}
              >
                <Plus className="w-4 h-4" /> Sıraya Araç Ekle
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
