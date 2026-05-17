import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, FileSpreadsheet, X, Check, ArrowRight } from "lucide-react";
import { useImportTasks } from "@workspace/api-client-react";
import * as xlsx from "xlsx";
import { Badge } from "@/components/ui/badge";

export function ImportTasks() {
  const importMutation = useImportTasks();
  const [parsedTasks, setParsedTasks] = useState<any[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const workbook = xlsx.read(data, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json = xlsx.utils.sheet_to_json(sheet);
      
      const mappedTasks = json.map((row: any) => {
        // Map columns heuristically
        const rawTime = row["Saat"] || row["Time"] || row["Zaman"];
        const time = rawTime ? new Date().toISOString().split('T')[0] + "T" + String(rawTime).padStart(5, '0') + ":00Z" : new Date().toISOString();
        const flightCode = row["Uçuş"] || row["Flight"] || row["Ucus"] || "";
        const passengerCount = parseInt(row["Kişi"] || row["Pax"] || row["Kisi"] || "1", 10) || 1;
        const pickup = row["Nereden"] || row["Pickup"] || row["Alış"] || "";
        const dropoff = row["Nereye"] || row["Dropoff"] || row["Varış"] || "";
        
        let type = "extra";
        if (String(pickup).toLowerCase().includes("airport") || String(pickup).toLowerCase().includes("havalimanı") || flightCode) {
          type = "airport_run";
        } else if (String(dropoff).toLowerCase().includes("airport") || String(dropoff).toLowerCase().includes("havalimanı")) {
          type = "airport_run";
        } else if (pickup || dropoff) {
          type = "hotel_pickup";
        }

        return {
          type,
          flightCode: String(flightCode),
          passengerCount,
          pickupLocation: String(pickup),
          dropoffLocation: String(dropoff),
          scheduledTime: time
        };
      }).filter(t => t.pickupLocation || t.dropoffLocation);

      setParsedTasks(mappedTasks);
    };
    reader.readAsBinaryString(file);
  };

  const handleConfirm = () => {
    if (parsedTasks.length === 0) return;
    
    importMutation.mutate({
      data: {
        tasks: parsedTasks as any
      }
    }, {
      onSuccess: () => {
        alert("İçe aktarma başarılı");
        setParsedTasks([]);
        setFileName(null);
      }
    });
  };

  const categories = {
    hotel_pickup: parsedTasks.filter(t => t.type === "hotel_pickup"),
    airport_run: parsedTasks.filter(t => t.type === "airport_run"),
    extra: parsedTasks.filter(t => t.type === "extra")
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Görevleri İçe Aktar</h1>
        <p className="text-muted-foreground text-sm">Toplu görev oluşturmak için Excel veya CSV dosyası yükleyin</p>
      </div>
      
      {!fileName ? (
        <Card className="p-12 border-dashed border-2 flex flex-col items-center justify-center text-center bg-muted/20 flex-1 max-h-[400px]">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-4">
            <Upload size={24} />
          </div>
          <h3 className="font-semibold text-lg mb-1">Dosya Yükle</h3>
          <p className="text-sm text-muted-foreground mb-6">.xlsx ve .csv dosyaları desteklenmektedir</p>
          <label className="cursor-pointer">
            <Button asChild>
              <span>Dosyalara Göz At</span>
            </Button>
            <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} />
          </label>
        </Card>
      ) : (
        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
          <Card className="p-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="text-green-600" />
              <div>
                <div className="font-medium">{fileName}</div>
                <div className="text-sm text-muted-foreground">{parsedTasks.length} görev bulundu</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => { setFileName(null); setParsedTasks([]); }}>
                <X className="w-4 h-4 mr-2" /> İptal
              </Button>
              <Button onClick={handleConfirm} disabled={importMutation.isPending || parsedTasks.length === 0}>
                <Check className="w-4 h-4 mr-2" /> İçe Aktarmayı Onayla
              </Button>
            </div>
          </Card>
          
          <div className="grid grid-cols-3 gap-4 flex-1 overflow-hidden">
            <PreviewColumn title="Havalimanı Seferleri" tasks={categories.airport_run} />
            <PreviewColumn title="Otel Karşılamaları" tasks={categories.hotel_pickup} />
            <PreviewColumn title="Ekstralar" tasks={categories.extra} />
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewColumn({ title, tasks }: { title: string, tasks: any[] }) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="p-3 border-b bg-muted/50 flex items-center justify-between">
        <h3 className="font-semibold text-sm">{title}</h3>
        <Badge variant="secondary">{tasks.length}</Badge>
      </div>
      <div className="p-3 flex-1 overflow-auto space-y-2">
        {tasks.map((t, i) => (
          <div key={i} className="text-sm border rounded p-2 bg-card">
            <div className="flex justify-between mb-1">
              <span className="font-medium">{t.scheduledTime.split('T')[1].substring(0,5)}</span>
              {t.flightCode && <Badge variant="outline" className="text-[10px]">{t.flightCode}</Badge>}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-slate-50 p-1 rounded">
              <span className="truncate">{t.pickupLocation}</span>
              <ArrowRight className="w-3 h-3 shrink-0" />
              <span className="truncate">{t.dropoffLocation}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
