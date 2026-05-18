import { ReactNode } from "react";
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
  SidebarTrigger
} from "@/components/ui/sidebar";
import { Plane, Car, Upload, BarChart3 } from "lucide-react";

export function AppSidebar() {
  const [location] = useLocation();

  const navigation = [
    { name: "Sevkiyat Paneli", href: "/", icon: Plane },
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
