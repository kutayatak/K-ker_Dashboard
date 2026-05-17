import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, FileSpreadsheet, X, Check, ArrowRight, User } from "lucide-react";
import { useImportTasks, useCreateVehicle } from "@workspace/api-client-react";
import * as xlsx from "xlsx";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";

// Excel serial time (0..1) → "HH:MM" string
function excelTimeToHHMM(serial: number): string {
  const totalMinutes = Math.round(serial * 24 * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Excel serial date+time or pure time → ISO datetime for today
function buildScheduledTime(rawVal: any): string {
  const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
  if (rawVal == null || rawVal === "") return `${today}T00:00:00`;
  const num = Number(rawVal);
  if (!isNaN(num)) {
    // Excel stores time as fraction of day; dates > 1 have integer part
    const timeFraction = num % 1;
    const hhmm = excelTimeToHHMM(timeFraction);
    return `${today}T${hhmm}:00`;
  }
  // String like "04:30"
  const str = String(rawVal).trim();
  if (/^\d{1,2}:\d{2}$/.test(str)) return `${today}T${str.padStart(5, "0")}:00`;
  return `${today}T00:00:00`;
}

// Parse passenger count from strings like "2CPT", "1KBN", "3CPT+1KBN", "1 CPT"
// Ignores numbers >= 10 to avoid parsing flight codes (e.g. 3001, 2189) or room numbers
function parsePassengerCount(text: any): number {
  if (!text) return 1;
  const s = String(text).replace(/\s/g, "");
  const nums = s.match(/\d+/g);
  if (!nums) return 1;
  const validNums = nums.map(n => parseInt(n, 10)).filter(num => num < 10);
  if (validNums.length === 0) return 1;
  return validNums.reduce((acc, n) => acc + n, 0);
}

// Check if value is system XML artifact or empty
function isValidValue(val: any): boolean {
  if (val == null) return false;
  const str = String(val).trim();
  if (str === "" || str === "System.Xml.XmlElement") return false;
  return true;
}

// Build task for first section (regular pages)
function buildRegularTask(row: any[], tableType: "left" | "right"): any | null {
  if (tableType === "left") {
    // Columns: A=S.NO, B=UÇUŞ KODU, C=PLAKA, D=ALINIŞ SAAT, E=OTEL ADI, F=EKİP SAYISI, G=KM
    const flightCode = String(row[1] || "").trim();
    const plate      = String(row[2] || "").trim();
    const timeRaw    = row[3];
    const hotelName  = String(row[4] || "").trim();
    const ekip       = String(row[5] || "").trim();

    if (!isValidValue(row[4]) || plate.toUpperCase() === "İPTAL" || plate.toUpperCase() === "IPTAL") return null;
    if (!isValidValue(row[1]) && !isValidValue(row[4])) return null;

    return {
      type: "hotel_pickup",
      flightCode: flightCode || undefined,
      passengerCount: parsePassengerCount(ekip),
      pickupLocation: hotelName,
      dropoffLocation: "Esenboğa Havalimanı",
      scheduledTime: buildScheduledTime(timeRaw),
      notes: [ekip ? ekip : null, plate ? `Plaka: ${plate}` : null].filter(Boolean).join(" | ") || undefined,
    };
  } else {
    // Columns: H=UÇUŞ KODU, I=PLAKA, J=ÖNÜ SAAT, K=OTEL ADI, L=EKİP SAYISI, M=KM
    const flightCode = String(row[7] || "").trim();
    const plate      = String(row[8] || "").trim();
    const timeRaw    = row[9];
    const hotelName  = String(row[10] || "").trim();
    const ekip       = String(row[11] || "").trim();

    if (!isValidValue(row[10]) || plate.toUpperCase() === "İPTAL" || plate.toUpperCase() === "IPTAL") return null;
    if (!isValidValue(row[7]) && !isValidValue(row[10])) return null;

    return {
      type: "airport_run",
      flightCode: flightCode || undefined,
      passengerCount: parsePassengerCount(ekip),
      pickupLocation: "Esenboğa Havalimanı",
      dropoffLocation: hotelName,
      scheduledTime: buildScheduledTime(timeRaw),
      notes: [ekip ? ekip : null, plate ? `Plaka: ${plate}` : null].filter(Boolean).join(" | ") || undefined,
    };
  }
}

// Build task for second section (ekstra / page 2)
function buildEkstraTask(row: any[], tableType: "left" | "right"): any | null {
  if (tableType === "left") {
    // Columns: A=S.NO, B=ALINIŞ SAAT, C=PLAKA, D=OTEL ADI / AÇIKLAMA
    const timeRaw = row[1];
    const plate   = String(row[2] || "").trim();
    const desc    = String(row[3] || "").trim();

    if (!isValidValue(row[3]) || plate.toUpperCase() === "İPTAL" || plate.toUpperCase() === "IPTAL") return null;

    return {
      type: "extra",
      flightCode: undefined,
      passengerCount: parsePassengerCount(desc),
      pickupLocation: desc,
      dropoffLocation: "Ekstra",
      scheduledTime: buildScheduledTime(timeRaw),
      notes: [desc && (desc.includes("CPT") || desc.includes("KBN") || desc.toLowerCase().includes("cpt") || desc.toLowerCase().includes("kbn")) ? desc : null, plate ? `Plaka: ${plate}` : null].filter(Boolean).join(" | ") || undefined,
    };
  } else {
    // Columns: H=ÖNÜ SAAT, I=PLAKA, J=OTEL ADI / AÇIKLAMA
    const timeRaw = row[7];
    const plate   = String(row[8] || "").trim();
    const desc    = String(row[9] || "").trim();

    if (!isValidValue(row[9]) || plate.toUpperCase() === "İPTAL" || plate.toUpperCase() === "IPTAL") return null;

    return {
      type: "extra",
      flightCode: undefined,
      passengerCount: parsePassengerCount(desc),
      pickupLocation: desc,
      dropoffLocation: "Ekstra",
      scheduledTime: buildScheduledTime(timeRaw),
      notes: [desc && (desc.includes("CPT") || desc.includes("KBN") || desc.toLowerCase().includes("cpt") || desc.toLowerCase().includes("kbn")) ? desc : null, plate ? `Plaka: ${plate}` : null].filter(Boolean).join(" | ") || undefined,
    };
  }
}

export function ImportTasks() {
  const queryClient = useQueryClient();
  const importMutation = useImportTasks();
  const createVehicleMutation = useCreateVehicle();

  const [importMode, setImportMode] = useState<"tasks" | "vehicles">("tasks");
  const [parsedTasks, setParsedTasks] = useState<any[]>([]);
  const [parsedVehicles, setParsedVehicles] = useState<any[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = xlsx.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });

        if (importMode === "tasks") {
          const tasks: any[] = [];
          let currentSection: "regular" | "ekstra" = "regular";

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every(c => c == null || c === "")) continue;

            const colA = row[0];
            if (colA == null) continue;

            const colAStr = String(colA).trim();

            if (colAStr === "1" && i > 10) {
              if (row[5] == null || String(row[5]).trim() === "" || String(row[5]).trim() === "System.Xml.XmlElement") {
                currentSection = "ekstra";
              }
            }

            if (isNaN(Number(colAStr))) continue;

            if (currentSection === "regular") {
              const leftTask = buildRegularTask(row, "left");
              if (leftTask) tasks.push(leftTask);

              const rightTask = buildRegularTask(row, "right");
              if (rightTask) tasks.push(rightTask);
            } else {
              const leftTask = buildEkstraTask(row, "left");
              if (leftTask) tasks.push(leftTask);

              const rightTask = buildEkstraTask(row, "right");
              if (rightTask) tasks.push(rightTask);
            }
          }

          if (tasks.length === 0) {
            setParseError("Dosyada işlenebilir görev bulunamadı. Sütun başlıklarını kontrol edin.");
          }
          setParsedTasks(tasks);
        } else {
          // Parse vehicles (first 15 Crew vehicles + Esnaf/outsource vehicles + VARDIYA + MEMUR)
          const vehicles: any[] = [];
          let currentSection: "crew" | "esnaf" = "crew";

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;

            // Check if we hit the Esnaf section header
            const rowStr = row.map(c => String(c || "")).join(" ");
            if (rowStr.includes("ESNAF ARAÇLARI")) {
              currentSection = "esnaf";
              continue;
            }

            if (currentSection === "crew") {
              const typeLabel = String(row[1] || "").trim();
              const basePlate = String(row[2] || "").trim();
              if (!basePlate || basePlate === "System.Xml.XmlElement") continue;

              if (typeLabel.includes("Ekip")) {
                const rawSno = row[0];
                if (rawSno == null) continue;
                const cleanSno = String(rawSno).replace(/\s/g, "");
                const sno = Number(cleanSno);

                // Only accept the first 15 crew/task vehicles (S.NO 1 to 15)
                if (!isNaN(sno) && sno >= 1 && sno <= 15) {
                  // Vardiya 1
                  const d1 = String(row[3] || "").trim();
                  const p1 = String(row[4] || "").trim();
                  if (isValidValue(row[3]) && d1 && d1 !== "null") {
                    vehicles.push({
                      name: `${typeLabel} (V1)`,
                      plate: `${basePlate} (V1)`,
                      type: "fixed",
                      driverName: d1,
                      phone: p1 || "Belirtilmedi",
                      capacity: 4,
                      notes: "Vardiya 1 Şoförü",
                    });
                  }

                  // Vardiya 2
                  const d2 = String(row[5] || "").trim();
                  const p2 = String(row[6] || "").trim();
                  if (isValidValue(row[5]) && d2 && d2 !== "null") {
                    vehicles.push({
                      name: `${typeLabel} (V2)`,
                      plate: `${basePlate} (V2)`,
                      type: "fixed",
                      driverName: d2,
                      phone: p2 || "Belirtilmedi",
                      capacity: 4,
                      notes: "Vardiya 2 Şoförü",
                    });
                  }

                  // Vardiya 3
                  const d3 = String(row[7] || "").trim();
                  const p3 = String(row[8] || "").trim();
                  if (isValidValue(row[7]) && d3 && d3 !== "null") {
                    vehicles.push({
                      name: `${typeLabel} (V3)`,
                      plate: `${basePlate} (V3)`,
                      type: "fixed",
                      driverName: d3,
                      phone: p3 || "Belirtilmedi",
                      capacity: 4,
                      notes: "Vardiya 3 Şoförü",
                    });
                  }
                }
              } else if (typeLabel === "VARDIYA") {
                // Vardiya 1
                const d1 = String(row[3] || "").trim();
                const p1 = String(row[4] || "").trim();
                if (isValidValue(row[3]) && d1 && d1 !== "null" && !d1.includes("İZİNLİ")) {
                  vehicles.push({
                    name: `Vardiya (${basePlate}) V1`,
                    plate: `${basePlate} (V1)`,
                    type: "fixed",
                    driverName: d1,
                    phone: p1 || "Belirtilmedi",
                    capacity: 4,
                    notes: "Vardiya Aracı - Vardiya 1",
                  });
                }

                // Vardiya 2
                const d2 = String(row[5] || "").trim();
                const p2 = String(row[6] || "").trim();
                if (isValidValue(row[5]) && d2 && d2 !== "null" && !d2.includes("İZİNLİ")) {
                  vehicles.push({
                    name: `Vardiya (${basePlate}) V2`,
                    plate: `${basePlate} (V2)`,
                    type: "fixed",
                    driverName: d2,
                    phone: p2 || "Belirtilmedi",
                    capacity: 4,
                    notes: "Vardiya Aracı - Vardiya 2",
                  });
                }
              } else if (typeLabel === "MEMUR") {
                const d1 = String(row[3] || "").trim();
                const p1 = String(row[4] || "").trim();
                const loc = String(row[5] || "").trim();
                if (isValidValue(row[3]) && d1 && d1 !== "null") {
                  vehicles.push({
                    name: `Memur (${basePlate})`,
                    plate: basePlate,
                    type: "fixed",
                    driverName: d1,
                    phone: p1 || "Belirtilmedi",
                    capacity: 4,
                    notes: loc && loc !== "System.Xml.XmlElement" ? `Memur Aracı - Semt: ${loc}` : "Memur Aracı",
                  });
                }
              }
            } else if (currentSection === "esnaf") {
              const plate = String(row[2] || "").trim();
              const driver = String(row[3] || "").trim();
              const phone = String(row[4] || "").trim();
              const shift = String(row[5] || "").trim();

              // Valid plate should start with a number (e.g. 06 ...) and have some length
              if (plate && /^\d/.test(plate) && isValidValue(row[3]) && driver && driver !== "null") {
                vehicles.push({
                  name: `Esnaf (${plate})`,
                  plate: plate,
                  type: "outsource",
                  driverName: driver,
                  phone: phone || "Belirtilmedi",
                  capacity: 4,
                  notes: shift ? `Esnaf Sefer Saatleri: ${shift}` : "Esnaf Araç",
                });
              }
            }
          }

          if (vehicles.length === 0) {
            setParseError("Dosyada işlenebilir şoför/araç bilgisi bulunamadı.");
          }
          setParsedVehicles(vehicles);
        }
      } catch (err: any) {
        setParseError("Dosya okunurken hata: " + (err?.message || String(err)));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmTasks = () => {
    if (parsedTasks.length === 0) return;

    importMutation.mutate(
      { data: { tasks: parsedTasks as any } },
      {
        onSuccess: (result: any) => {
          const created = result?.created ?? parsedTasks.length;
          alert(`İçe aktarma başarılı! ${created} görev oluşturuldu.`);
          setParsedTasks([]);
          setFileName(null);
          setParseError(null);
        },
        onError: (err: any) => {
          alert("İçe aktarma hatası: " + (err?.message || "Bilinmeyen hata"));
        },
      }
    );
  };

  const handleConfirmVehicles = async () => {
    if (parsedVehicles.length === 0) return;
    setIsImporting(true);
    let successCount = 0;
    let failCount = 0;

    for (const v of parsedVehicles) {
      try {
        await createVehicleMutation.mutateAsync({ data: v });
        successCount++;
      } catch (err) {
        failCount++;
      }
    }

    alert(`Şoför ve araç aktarımı tamamlandı!\nBaşarılı: ${successCount}\nHatalı: ${failCount}`);
    queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
    setParsedVehicles([]);
    setFileName(null);
    setParseError(null);
    setIsImporting(false);
  };

  const categories = {
    hotel_pickup: parsedTasks.filter((t) => t.type === "hotel_pickup"),
    airport_run:  parsedTasks.filter((t) => t.type === "airport_run"),
    extra:        parsedTasks.filter((t) => t.type === "extra"),
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Veri İçe Aktar</h1>
          <p className="text-muted-foreground text-sm">
            Toplu görev veya araç/şoför yüklemek için Excel dosyası yükleyin
          </p>
        </div>

        <div className="flex bg-muted p-1 rounded-lg self-start shrink-0 border border-slate-100 dark:border-slate-800">
          <Button
            variant={importMode === "tasks" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setImportMode("tasks");
              setFileName(null);
              setParsedTasks([]);
              setParsedVehicles([]);
              setParseError(null);
            }}
          >
            Görevleri İçe Aktar
          </Button>
          <Button
            variant={importMode === "vehicles" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setImportMode("vehicles");
              setFileName(null);
              setParsedTasks([]);
              setParsedVehicles([]);
              setParseError(null);
            }}
          >
            Araç & Şoför İçe Aktar
          </Button>
        </div>
      </div>

      {!fileName ? (
        <Card className="p-12 border-dashed border-2 flex flex-col items-center justify-center text-center bg-muted/20 flex-1 max-h-[400px]">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-4">
            <Upload size={24} />
          </div>
          <h3 className="font-semibold text-lg mb-1">Dosya Yükle</h3>
          <p className="text-sm text-muted-foreground mb-2">.xlsx dosyaları desteklenmektedir</p>
          <p className="text-xs text-muted-foreground mb-6">
            {importMode === "tasks" ? (
              <span>Desteklenen formatlar: <span className="font-mono">Normal Uçuş Seferleri & Ekstra Seferler (A-M Sütunları)</span></span>
            ) : (
              <span>Desteklenen format: <span className="font-mono">Şoför/Araç Vardiya Listesi (İlk 15 Ekip Aracı, 3 Vardiya)</span></span>
            )}
          </p>
          <label className="cursor-pointer">
            <Button asChild>
              <span>Dosyalara Göz At</span>
            </Button>
            <input
              type="file"
              className="hidden"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
            />
          </label>
        </Card>
      ) : (
        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
          <Card className="p-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="text-green-600" />
              <div>
                <div className="font-medium">{fileName}</div>
                {parseError ? (
                  <div className="text-sm text-red-500">{parseError}</div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {importMode === "tasks" ? (
                      <>
                        {parsedTasks.length} görev bulundu
                        <span className="ml-2 text-xs">
                          ({categories.hotel_pickup.length} otel alım · {categories.airport_run.length} havalimanı · {categories.extra.length} ekstra)
                        </span>
                      </>
                    ) : (
                      <>{parsedVehicles.length} şoför/vardiya kaydı bulundu (ilk 15 ekip aracı için)</>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setFileName(null);
                  setParsedTasks([]);
                  setParsedVehicles([]);
                  setParseError(null);
                }}
                disabled={isImporting}
              >
                <X className="w-4 h-4 mr-2" /> İptal
              </Button>
              {importMode === "tasks" ? (
                <Button
                  onClick={handleConfirmTasks}
                  disabled={importMutation.isPending || parsedTasks.length === 0}
                >
                  <Check className="w-4 h-4 mr-2" /> İçe Aktarmayı Onayla
                </Button>
              ) : (
                <Button
                  onClick={handleConfirmVehicles}
                  disabled={isImporting || parsedVehicles.length === 0}
                >
                  <Check className="w-4 h-4 mr-2" />
                  {isImporting ? "Aktarılıyor..." : "Şoförleri İçe Aktar"}
                </Button>
              )}
            </div>
          </Card>

          {importMode === "tasks" ? (
            <div className="grid grid-cols-3 gap-4 flex-1 overflow-hidden">
              <PreviewColumn title="Otel Alımları (→ Havalimanı)" tasks={categories.hotel_pickup} />
              <PreviewColumn title="Havalimanı Karşılamaları (→ Otel)" tasks={categories.airport_run} />
              <PreviewColumn title="Ekstralar" tasks={categories.extra} />
            </div>
          ) : (
            <Card className="flex flex-col flex-1 overflow-hidden">
              <div className="p-3 border-b bg-muted/50">
                <h3 className="font-semibold text-sm">Yüklenecek Araç ve Şoför Listesi</h3>
              </div>
              <div className="p-4 flex-1 overflow-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {parsedVehicles.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8 col-span-3">Araç bulunamadı</p>
                  )}
                  {parsedVehicles.map((v, i) => (
                    <div key={i} className="border rounded-lg p-3 bg-card shadow-sm flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-semibold text-sm">{v.name}</h4>
                          <Badge variant="outline" className="text-xs bg-slate-50 dark:bg-slate-800">
                            {v.plate}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                          <User size={14} className="text-blue-500" />
                          <span className="font-medium text-slate-800 dark:text-slate-200">{v.driverName}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          Tel: <span className="font-mono">{v.phone}</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t flex justify-between items-center text-[10px] text-muted-foreground">
                        <span>{v.notes}</span>
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 capitalize">
                          {v.type === "fixed" ? "Sabit" : "Dış Servis"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewColumn({ title, tasks }: { title: string; tasks: any[] }) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="p-3 border-b bg-muted/50 flex items-center justify-between">
        <h3 className="font-semibold text-sm">{title}</h3>
        <Badge variant="secondary">{tasks.length}</Badge>
      </div>
      <div className="p-3 flex-1 overflow-auto space-y-2">
        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">Görev yok</p>
        )}
        {tasks.map((t, i) => (
          <div key={i} className="text-sm border rounded p-2 bg-card">
            <div className="flex justify-between mb-1 gap-1">
              <span className="font-mono font-medium text-xs">
                {t.scheduledTime?.split("T")[1]?.substring(0, 5) ?? "--:--"}
              </span>
              {t.flightCode && (
                <Badge variant="outline" className="text-[10px]">
                  {t.flightCode}
                </Badge>
              )}
            </div>
            {t.type === "extra" ? (
              <div className="text-xs font-semibold bg-amber-50/50 dark:bg-amber-950/20 border border-dashed border-amber-300 rounded p-1.5 text-foreground/90 mt-1">
                <span className="text-[9px] text-amber-600 font-bold uppercase tracking-wider block mb-0.5">Ekstra İş Detayı</span>
                <span className="truncate block" title={t.pickupLocation}>{t.pickupLocation}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-muted-foreground bg-slate-50 dark:bg-slate-800 p-1 rounded mt-1">
                <span className="truncate flex-1">{t.pickupLocation}</span>
                <ArrowRight className="w-3 h-3 shrink-0" />
                <span className="truncate flex-1 text-right">{t.dropoffLocation}</span>
              </div>
            )}
            <div className="text-[10px] text-muted-foreground mt-1">
              {t.passengerCount} kişi{t.notes ? ` · ${t.notes}` : ""}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
