import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import { NavigationProtectionProvider } from "@/contexts/NavigationProtectionContext";
import Home from "@/pages/Home";
import ProjectManagement from "@/components/ProjectManagement";
import ProjectDetails from "@/components/ProjectDetails";
import ProjectBudgets from "@/components/ProjectBudgets";
import BudgetManagement from "@/components/BudgetManagement";
import LocationManagement from "@/components/LocationManagement";
import LocationDetails from "@/components/LocationDetails";
import ScheduleManagement from "@/components/ScheduleManagement";
import DailyJobReports from "@/components/DailyJobReports";
import EmployeeManagement from "@/components/EmployeeManagement";
import AssignmentManagement from "@/components/AssignmentManagement";
import UserManagement from "@/components/UserManagement";
import Reports from "@/components/Reports";
import PasswordReset from "@/components/PasswordReset";
import Login from "@/components/Login";
import ChangePassword from "@/components/ChangePassword";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/projects" component={ProjectManagement} />
      <Route path="/projects/:projectId">
        {(params) => <ProjectDetails projectId={params.projectId} />}
      </Route>
      <Route path="/project-budgets" component={ProjectBudgets} />
      <Route path="/budgets" component={BudgetManagement} />
      <Route path="/locations" component={LocationManagement} />
      <Route path="/locations/:locationId">
        {(params) => <LocationDetails locationId={params.locationId} />}
      </Route>
      <Route path="/schedule" component={ScheduleManagement} />
      {!import.meta.env.PROD && <Route path="/daily-reports" component={DailyJobReports} />}
      <Route path="/employees" component={EmployeeManagement} />
      <Route path="/assignments" component={AssignmentManagement} />
      <Route path="/reports" component={Reports} />
      <Route path="/users" component={UserManagement} />
      <Route path="/reset-password">
        {() => {
          const urlParams = new URLSearchParams(window.location.search);
          const token = urlParams.get('token');
          return token ? <PasswordReset token={token} /> : <NotFound />;
        }}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [user, setUser] = useState<any>(null);
  const [requirePasswordChange, setRequirePasswordChange] = useState(false);

  // Check for existing session on app load
  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        setRequirePasswordChange(!parsedUser.isPasswordSet);
      } catch (error) {
        localStorage.removeItem('currentUser');
      }
    }
  }, []);

  const handleLoginSuccess = (loggedInUser: any, needsPasswordChange: boolean) => {
    setUser(loggedInUser);
    setRequirePasswordChange(needsPasswordChange);
    localStorage.setItem('currentUser', JSON.stringify(loggedInUser));
  };

  const handlePasswordChanged = () => {
    setRequirePasswordChange(false);
    if (user) {
      const updatedUser = { ...user, isPasswordSet: true };
      setUser(updatedUser);
      localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    }
  };

  const handleLogout = () => {
    setUser(null);
    setRequirePasswordChange(false);
    localStorage.removeItem('currentUser');
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <NavigationProtectionProvider>
          <Toaster />
          {!user ? (
            <Login onLoginSuccess={handleLoginSuccess} />
          ) : requirePasswordChange ? (
            <ChangePassword 
              user={user} 
              onPasswordChanged={handlePasswordChanged} 
              onLogout={handleLogout}
              isFirstLogin={true}
            />
          ) : (
            <Layout onLogout={handleLogout} user={user}>
              <Router />
            </Layout>
          )}
        </NavigationProtectionProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
