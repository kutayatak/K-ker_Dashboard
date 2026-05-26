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
import { Plane, Car, Upload, BarChart3, Moon, Sun, FileSpreadsheet } from "lucide-react";

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

export function AppSidebar() {
  const [location] = useLocation();
  const { dark, toggle } = useDarkMode();

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
