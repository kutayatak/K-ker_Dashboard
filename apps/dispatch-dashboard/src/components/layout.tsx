import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarFooter,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { Plane, Car, Upload, BarChart3, Moon, Sun, FileSpreadsheet, RefreshCw, Download } from "lucide-react";

/* ── Dark mode hook ─────────────────────────────────────────────────────── */
function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

interface DbFile {
  id: number;
  date: string;
  filename: string;
  uploadedAt: string;
}

export function AppSidebar() {
  const [location] = useLocation();
  const { dark, toggle } = useDarkMode();
  const [files, setFiles] = useState<DbFile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFiles = async () => {
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
    window.addEventListener("excel-imported", fetchFiles);
    return () => window.removeEventListener("excel-imported", fetchFiles);
  }, []);

  const navigation = [
    { name: "Sevkiyat Paneli", href: "/", icon: Plane },
    { name: "Excel Görünümü", href: "/excel-view", icon: FileSpreadsheet },
    { name: "Araçlar", href: "/vehicles", icon: Car },
    { name: "Veri İçe Aktar", href: "/import", icon: Upload },
    { name: "Raporlar", href: "/reports", icon: BarChart3 },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b">
        <div className="flex items-center gap-2 font-bold text-lg text-sidebar-primary">
          <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center text-white">
            <Plane size={18} />
          </div>
          Sevkiyat Merkezi
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operasyonlar</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const isActive = location === item.href;
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.href} className="flex items-center gap-3 w-full">
                        <item.icon size={16} />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-2 border-t pt-4">
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>Yüklenen Dosyalar</span>
            <button 
              onClick={(e) => { e.preventDefault(); fetchFiles(); }} 
              className="hover:text-foreground text-muted-foreground p-0.5 rounded transition-colors" 
              title="Yenile"
            >
              <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            </button>
          </SidebarGroupLabel>
          <SidebarGroupContent className="px-2 max-h-[250px] overflow-y-auto mt-2">
            {loading ? (
              <p className="text-[11px] text-muted-foreground italic px-2">Yükleniyor...</p>
            ) : files.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic px-2">Henüz dosya yüklenmedi.</p>
            ) : (
              <div className="space-y-1.5 font-mono text-[11px]">
                {files.map((file) => {
                  const displayDate = file.date;
                  let targetUrlDate = displayDate;
                  if (displayDate.length === 6 && !displayDate.includes("-")) {
                    const d = displayDate.slice(0, 2);
                    const m = displayDate.slice(2, 4);
                    const y = "20" + displayDate.slice(4, 6);
                    targetUrlDate = `${y}-${m}-${d}`;
                  }
                  
                  return (
                    <div 
                      key={file.id} 
                      className="group/file flex items-center justify-between p-1.5 rounded hover:bg-sidebar-accent transition-colors cursor-pointer"
                      onClick={() => window.location.href = `/excel-view?date=${targetUrlDate}`}
                    >
                      <div className="flex items-center gap-1.5 truncate max-w-[140px]">
                        <FileSpreadsheet size={13} className="text-emerald-600 shrink-0" />
                        <div className="flex flex-col truncate leading-tight">
                          <span className="font-semibold text-sidebar-foreground group-hover/file:text-blue-500 transition-colors">
                            {displayDate}
                          </span>
                          <span className="text-[9px] text-muted-foreground truncate" title={file.filename}>
                            {file.filename}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`/api/excel/download?date=${targetUrlDate}`, "_blank");
                        }}
                        className="opacity-0 group-hover/file:opacity-100 p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-muted-foreground hover:text-emerald-600 transition-all"
                        title="Excel İndir"
                      >
                        <Download size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Dark mode toggle at sidebar bottom ─────────────────────────── */}
      <SidebarFooter className="p-3 border-t">
        <button
          onClick={toggle}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium
            text-sidebar-foreground/80 hover:text-sidebar-foreground
            hover:bg-sidebar-accent transition-all duration-200 group"
          title={dark ? "Açık Mod" : "Karanlık Mod"}
        >
          <div className="relative w-4 h-4 shrink-0">
            {/* Sun icon — shown in dark mode (click to go light) */}
            <Sun
              size={16}
              className={`absolute inset-0 transition-all duration-300 ${
                dark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"
              }`}
            />
            {/* Moon icon — shown in light mode (click to go dark) */}
            <Moon
              size={16}
              className={`absolute inset-0 transition-all duration-300 ${
                dark ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"
              }`}
            />
          </div>
          <span className="transition-opacity duration-200">
            {dark ? "Açık Mod" : "Karanlık Mod"}
          </span>

          {/* Pill indicator */}
          <span
            className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors duration-200 ${
              dark
                ? "bg-blue-500/20 text-blue-300"
                : "bg-slate-500/15 text-slate-400"
            }`}
          >
            {dark ? "Açık" : "Koyu"}
          </span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full h-screen overflow-hidden">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        <header className="h-14 border-b bg-card flex items-center justify-between px-4 shrink-0 md:hidden">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <div className="flex items-center gap-2 font-bold text-sm text-sidebar-primary">
              <div className="w-6 h-6 bg-blue-500 rounded flex items-center justify-center text-white">
                <Plane size={14} />
              </div>
              K-ker Dashboard
            </div>
          </div>
        </header>
        <div className="hidden md:flex h-14 border-b bg-card items-center px-4 shrink-0">
          <SidebarTrigger />
        </div>
        <div className="flex-1 overflow-auto p-3 md:p-6 pb-24 md:pb-6">
          {children}
        </div>
      </main>
    </div>
  );
}
