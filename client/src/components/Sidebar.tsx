import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ChartLine, 
  FolderOpen, 
  Calculator, 
  MapPin, 
  Calendar, 
  Users, 
  CheckSquare, 
  HardHat, 
  User, 
  LogOut 
} from "lucide-react";

export default function Sidebar() {
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState("dashboard");

  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 30000,
  });

  const navigation = [
    { name: "Dashboard", href: "/", icon: ChartLine, key: "dashboard" },
    { name: "Projects", href: "/projects", icon: FolderOpen, key: "projects" },
    { name: "Budgets", href: "/budgets", icon: Calculator, key: "budgets" },
    { name: "Locations", href: "/locations", icon: MapPin, key: "locations" },
    { name: "Schedule", href: "/schedule", icon: Calendar, key: "schedule" },
    { name: "Employees", href: "/employees", icon: Users, key: "employees" },
    { name: "Assignments", href: "/assignments", icon: CheckSquare, key: "assignments" },
  ];

  const isActive = (key: string) => {
    if (key === "dashboard") return location === "/";
    return location.startsWith(`/${key}`);
  };

  return (
    <div className="w-64 bg-sidebar-background text-sidebar-foreground flex flex-col">
      {/* Logo & Company */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <HardHat className="text-white text-lg" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-sidebar-foreground">BuildTracker</h1>
            <p className="text-sidebar-foreground/70 text-sm">Public Works Construction</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto sidebar-scrollbar">
        <nav className="p-4 space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.key} href={item.href}>
                <Button
                  variant={isActive(item.key) ? "default" : "ghost"}
                  className={`w-full justify-start space-x-3 ${
                    isActive(item.key)
                      ? "bg-primary text-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}
                  onClick={() => setActiveTab(item.key)}
                >
                  <Icon className="w-5 h-5 text-current" />
                  <span className="text-current">{item.name}</span>
                </Button>
              </Link>
            );
          })}
        </nav>

        {/* Current Projects */}
        <div className="p-4 border-t border-sidebar-border">
          <h3 className="text-sidebar-foreground/70 text-sm font-medium mb-3">Active Projects</h3>
          <div className="space-y-2">
            {projects.slice(0, 3).map((project: any) => (
              <div
                key={project.id}
                className="flex items-center space-x-3 p-2 rounded hover:bg-sidebar-accent cursor-pointer"
              >
                <div className="w-3 h-3 bg-accent rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-sidebar-foreground">{project.name}</p>
                  <p className="text-xs text-sidebar-foreground/70">{project.projectId}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* User Profile */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-sidebar-accent rounded-full flex items-center justify-center">
            <User className="text-sidebar-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-sidebar-foreground">John Smith</p>
            <p className="text-xs text-sidebar-foreground/70">Superintendent</p>
          </div>
          <Button variant="ghost" size="sm" className="text-sidebar-foreground hover:bg-sidebar-accent">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
