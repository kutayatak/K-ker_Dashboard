import { useState, useEffect } from "react";
import { Plus, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AddTaskDialogProps {
  addingTaskState: {
    tableType: "left" | "right" | null;
    type: "hotel_pickup" | "airport_run" | "extra" | "technical";
  };
  initialValues: {
    flightCode: string;
    time: string;
    notes: string;
    km: string;
    hotelName: string;
  };
  onClose: () => void;
  onSave: (formValues: {
    flightCode: string;
    time: string;
    notes: string;
    km: string;
    hotelName: string;
  }) => Promise<void>;
  editSaving: boolean;
}

export function AddTaskDialog({
  addingTaskState,
  initialValues,
  onClose,
  onSave,
  editSaving,
}: AddTaskDialogProps) {
  const [form, setForm] = useState(initialValues);

  // Sync state if initialValues changes
  useEffect(() => {
    setForm(initialValues);
  }, [initialValues]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-card border rounded-xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            {addingTaskState.type === "extra"
              ? "Ekstra İş Ekle"
              : addingTaskState.type === "technical"
                ? "Teknik İş Ekle"
                : addingTaskState.tableType === "left"
                  ? "GELİR Ekle"
                  : "GİDER Ekle"}
            {addingTaskState.type === "extra" && (
              <span
                className={`ml-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide ${
                  addingTaskState.tableType === "left"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                }`}
              >
                {addingTaskState.tableType === "left" ? "▲ GELİR" : "▼ GİDER"}
              </span>
            )}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded hover:bg-muted flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {addingTaskState.type === "extra" && (
          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium border ${
              addingTaskState.tableType === "left"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300"
                : "bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-300"
            }`}
          >
            {addingTaskState.tableType === "left" ? (
              <>
                <span className="text-base">📥</span>
                <span>
                  Bu iş <strong>GELİR</strong> sütununa eklenecek — havalimanından otele gelen sefer.
                </span>
              </>
            ) : (
              <>
                <span className="text-base">📤</span>
                <span>
                  Bu iş <strong>GİDER</strong> sütununa eklenecek — otelden havalimanına giden sefer.
                </span>
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {addingTaskState.type !== "extra" && (
            <div className="flex flex-col gap-1 col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">
                UÇUŞ KODU
              </label>
              <input
                type="text"
                className="border rounded px-2 py-1.5 text-sm font-mono bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 uppercase"
                value={form.flightCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, flightCode: e.target.value.toUpperCase() }))
                }
                placeholder="Örn: TK123"
              />
            </div>
          )}

          <div className="flex flex-col gap-1 col-span-2">
            <label className="text-xs font-semibold text-muted-foreground">
              {addingTaskState.type === "technical"
                ? "TEKNİK AÇIKLAMA"
                : addingTaskState.type === "extra"
                  ? "AÇIKLAMA"
                  : "OTEL ADI"}
            </label>
            <input
              type="text"
              className="border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
              value={form.hotelName}
              onChange={(e) =>
                setForm((f) => ({ ...f, hotelName: e.target.value }))
              }
              placeholder={
                addingTaskState.type === "technical"
                  ? "Örn: Araç Bakımı"
                  : addingTaskState.type === "extra"
                    ? "Örn: Ekstra Sefer Açıklaması"
                    : "Örn: Rixos"
              }
            />
          </div>

          <div className={`flex flex-col gap-1 ${addingTaskState.type === "extra" ? "col-span-2" : ""}`}>
            <label className="text-xs font-semibold text-muted-foreground">
              SAAT (UTC)
            </label>
            <input
              type="time"
              className="border rounded px-2 py-1.5 text-sm font-mono bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
              value={form.time}
              onChange={(e) =>
                setForm((f) => ({ ...f, time: e.target.value }))
              }
            />
          </div>

          {addingTaskState.type !== "extra" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground">
                KM
              </label>
              <input
                type="number"
                min={0}
                className="border rounded px-2 py-1.5 text-sm font-mono bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.km}
                onChange={(e) =>
                  setForm((f) => ({ ...f, km: e.target.value }))
                }
                placeholder="KM"
              />
            </div>
          )}

          {addingTaskState.type !== "extra" && (
            <div className="flex flex-col gap-1 col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">
                EKİP / NOTLAR
              </label>
              <input
                type="text"
                className="border rounded px-2 py-1.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Örn: 2CPT 1KBN"
              />
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          💡 Eklenen iş, girilen saate göre otomatik olarak diğer işlerin arasına sıralanacaktır.
        </p>

        <div className="flex gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            İptal
          </Button>
          <Button
            size="sm"
            onClick={() => onSave(form)}
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
  );
}
