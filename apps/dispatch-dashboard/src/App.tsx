import { Suspense, lazy } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Layout } from "@/components/layout";

const Board = lazy(() => import("@/pages/board").then(m => ({ default: m.Board })));
const Vehicles = lazy(() => import("@/pages/vehicles").then(m => ({ default: m.Vehicles })));
const ImportTasks = lazy(() => import("@/pages/import").then(m => ({ default: m.ImportTasks })));
const Reports = lazy(() => import("@/pages/reports").then(m => ({ default: m.Reports })));
const ExcelView = lazy(() => import("@/pages/excel-view").then(m => ({ default: m.ExcelView })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30 sn önbellek — aynı sayfada tekrar fetch yok
      gcTime: 300_000,         // 5 dk bellekte tut
      retry: 1,                // hata durumunda yalnızca 1 tekrar
      retryDelay: 1000,        // 1 sn bekle
      refetchOnWindowFocus: false, // sekmeye geçince tekrar istek yapmasın
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ErrorBoundary fallback={<div className="p-4 text-red-500">Bir hata oluştu. Lütfen sayfayı yenileyin.</div>}>
            <SidebarProvider>
              <Layout>
                <Suspense fallback={<div className="flex h-full items-center justify-center p-8">Yükleniyor...</div>}>
                  <Switch>
                    <Route path="/" component={Board} />
                    <Route path="/excel-view" component={ExcelView} />
                    <Route path="/vehicles" component={Vehicles} />
                    <Route path="/import" component={ImportTasks} />
                    <Route path="/reports" component={Reports} />
                    <Route component={NotFound} />
                  </Switch>
                </Suspense>
              </Layout>
            </SidebarProvider>
          </ErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
