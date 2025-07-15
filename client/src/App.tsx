import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import ProjectManagement from "@/components/ProjectManagement";
import BudgetManagement from "@/components/BudgetManagement";
import LocationManagement from "@/components/LocationManagement";
import ScheduleManagement from "@/components/ScheduleManagement";
import EmployeeManagement from "@/components/EmployeeManagement";
import AssignmentManagement from "@/components/AssignmentManagement";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/projects" component={ProjectManagement} />
      <Route path="/budgets" component={BudgetManagement} />
      <Route path="/locations" component={LocationManagement} />
      <Route path="/schedule" component={ScheduleManagement} />
      <Route path="/employees" component={EmployeeManagement} />
      <Route path="/assignments" component={AssignmentManagement} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Layout>
          <Router />
        </Layout>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
