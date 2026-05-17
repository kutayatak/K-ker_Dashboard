import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Layout } from "@/components/layout";
import { Board } from "@/pages/board";
import { Vehicles } from "@/pages/vehicles";
import { ImportTasks } from "@/pages/import";
import { Reports } from "@/pages/reports";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <SidebarProvider>
            <Layout>
              <Switch>
                <Route path="/" component={Board} />
                <Route path="/vehicles" component={Vehicles} />
                <Route path="/import" component={ImportTasks} />
                <Route path="/reports" component={Reports} />
                <Route component={NotFound} />
              </Switch>
            </Layout>
          </SidebarProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
