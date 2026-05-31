import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, Download, Trash2, Eye, RefreshCw, Calendar } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

interface DbFile {
  id: number;
  date: string;
  filename: string;
  uploadedAt: string;
}

export function StoredFiles() {
  const [files, setFiles] = useState<DbFile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/excel/files");
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch (e) {
      console.error("Error fetching files:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleDelete = async (id: number, filename: string) => {
    if (!confirm(`"${filename}" dosyasını veritabanından kalıcı olarak silmek istediğinize emin misiniz?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/excel/files/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        alert("Dosya başarıyla silindi!");
        fetchFiles();
        // Refresh sidebar
        window.dispatchEvent(new CustomEvent("excel-imported"));
      } else {
        alert("Dosya silinirken bir hata oluştu.");
      }
    } catch (e) {
      console.error(e);
      alert("Bağlantı hatası oluştu.");
    }
  };

  const handleOpen = (displayDate: string) => {
    let targetUrlDate = displayDate;
    if (displayDate.length === 6 && !displayDate.includes("-")) {
      const d = displayDate.slice(0, 2);
      const m = displayDate.slice(2, 4);
      const y = "20" + displayDate.slice(4, 6);
      targetUrlDate = `${y}-${m}-${d}`;
    }
    window.location.href = `/excel-view?date=${targetUrlDate}`;
  };

  const handleDownload = (displayDate: string) => {
    let targetUrlDate = displayDate;
    if (displayDate.length === 6 && !displayDate.includes("-")) {
      const d = displayDate.slice(0, 2);
      const m = displayDate.slice(2, 4);
      const y = "20" + displayDate.slice(4, 6);
      targetUrlDate = `${y}-${m}-${d}`;
    }
    window.open(`/api/excel/download?date=${targetUrlDate}`, "_blank");
  };

  const formatDateText = (displayDate: string) => {
    if (displayDate.length === 6 && !displayDate.includes("-")) {
      const d = displayDate.slice(0, 2);
      const m = displayDate.slice(2, 4);
      const y = "20" + displayDate.slice(4, 6);
      try {
        return format(new Date(`${y}-${m}-${d}`), "dd MMMM yyyy", { locale: tr });
      } catch {
        return displayDate;
      }
    }
    try {
      return format(new Date(displayDate), "dd MMMM yyyy", { locale: tr });
    } catch {
      return displayDate;
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="text-blue-500" />
            Yüklenen Dosyalar
          </h1>
          <p className="text-muted-foreground text-sm">
            Veritabanında kayıtlı olan sevkiyat listelerini ve Excel dosyalarını yönetin
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchFiles} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Yenile
        </Button>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 shrink-0">
        <Card className="p-4 flex items-center gap-4 bg-blue-50/50 dark:bg-blue-950/15 border-blue-100 dark:border-blue-900/30">
          <div className="w-10 h-10 rounded-lg bg-blue-500 text-white flex items-center justify-center">
            <FileSpreadsheet size={20} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-semibold">Toplam Kayıtlı Excel</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{files.length} Dosya</div>
          </div>
        </Card>
      </div>

      {/* File Explorer list */}
      <Card className="flex-1 overflow-hidden flex flex-col border-slate-200/80 shadow-sm min-h-0 bg-card">
        <div className="p-3 border-b bg-muted/40 font-semibold text-sm flex items-center justify-between shrink-0">
          <span>Veritabanı Dosya Listesi</span>
          <span className="text-xs text-muted-foreground font-mono">Toplam: {files.length} dosya</span>
        </div>
        
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-2">
              <RefreshCw className="animate-spin text-blue-500 w-8 h-8" />
              <p className="text-sm italic">Dosyalar yükleniyor...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground text-center">
              <FileSpreadsheet size={40} className="text-slate-300 dark:text-slate-700 mb-3" />
              <h3 className="font-semibold text-base mb-1">Hiç Dosya Bulunamadı</h3>
              <p className="text-sm max-w-sm">Veri İçe Aktar sayfasından Excel yükleyerek burada listelenmesini sağlayabilirsiniz.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 border-b z-10">
                <tr>
                  <th className="p-3 font-bold text-slate-700 dark:text-slate-300">VARDİYA TARİHİ</th>
                  <th className="p-3 font-bold text-slate-700 dark:text-slate-300">DOSYA ADI</th>
                  <th className="p-3 font-bold text-slate-700 dark:text-slate-300">YÜKLENME ZAMANI</th>
                  <th className="p-3 font-bold text-right text-slate-700 dark:text-slate-300 pr-6">İŞLEMLER</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {files.map((file) => (
                  <tr key={file.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                    <td className="p-3 font-bold">
                      <div className="flex items-center gap-2">
                        <Calendar size={13} className="text-blue-500" />
                        <span className="text-slate-900 dark:text-slate-100">{file.date}</span>
                        <span className="text-[10px] text-muted-foreground font-normal">
                          ({formatDateText(file.date)})
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground truncate max-w-xs" title={file.filename}>
                      <div className="flex items-center gap-1.5">
                        <FileSpreadsheet size={13} className="text-emerald-600 shrink-0" />
                        <span>{file.filename}</span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {format(new Date(file.uploadedAt), "dd MMMM yyyy HH:mm", { locale: tr })}
                    </td>
                    <td className="p-3 text-right pr-6">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 px-2.5 text-[11px] font-medium border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-950/20"
                          onClick={() => handleOpen(file.date)}
                        >
                          <Eye size={12} className="mr-1" /> Aç
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 px-2.5 text-[11px] font-medium border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-950/20"
                          onClick={() => handleDownload(file.date)}
                        >
                          <Download size={12} className="mr-1" /> İndir
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 px-2.5 text-[11px] font-medium border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-950/20 dark:hover:text-rose-300"
                          onClick={() => handleDelete(file.id, file.filename)}
                        >
                          <Trash2 size={12} className="mr-1" /> Sil
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
