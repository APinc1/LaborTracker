import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useNavigationProtection } from "@/contexts/NavigationProtectionContext";
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
  LogOut,
  ClipboardList,
} from "lucide-react";

// Protected navigation component
const ProtectedNavLink = ({ 
  href, 
  children, 
  onNavigate 
}: { 
  href: string; 
  children: React.ReactNode; 
  onNavigate: (path: string) => void; 
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onNavigate(href);
  };

  return (
    <a href={href} onClick={handleClick}>
      {children}
    </a>
  );
};

interface SidebarProps {
  onLogout?: () => void;
  user?: any;
}

export default function Sidebar({ onLogout, user }: SidebarProps) {
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState("dashboard");

  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 30000,
  });

  const { protectedNavigate } = useNavigationProtection();

  const allNavigation = [
    { name: "Dashboard", href: "/", icon: ChartLine, key: "dashboard" },
    { name: "Projects", href: "/projects", icon: FolderOpen, key: "projects" },
    { name: "Project Budgets", href: "/project-budgets", icon: Calculator, key: "project-budgets" },
    { name: "Locations", href: "/locations", icon: MapPin, key: "locations" },
    { name: "Location Budgets", href: "/budgets", icon: Calculator, key: "budgets" },
    { name: "Schedule", href: "/schedule", icon: Calendar, key: "schedule" },
    { name: "Daily Job Reports", href: "/daily-reports", icon: ClipboardList, key: "daily-reports", devOnly: true },
    {
      name: "Assignments",
      href: "/assignments",
      icon: CheckSquare,
      key: "assignments",
    },
    { name: "Employees", href: "/employees", icon: Users, key: "employees" },
    { name: "Users", href: "/users", icon: User, key: "users" },
  ];

  const navigation = import.meta.env.PROD 
    ? allNavigation.filter(item => !('devOnly' in item && item.devOnly))
    : allNavigation;

  const isActive = (key: string) => {
    if (key === "dashboard") return location === "/";
    return location.startsWith(`/${key}`);
  };

  return (
    <div className="w-64 bg-sidebar-background text-sidebar-foreground flex flex-col">
      {/* Logo & Company */}
      <div className="p-6 border-b border-sidebar-border pt-[10px] pb-[10px]">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <HardHat className="text-white text-lg" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Access Pacific
</h1>
            <p className="text-muted-foreground text-sm">
              Public Works Construction
            </p>
          </div>
        </div>
      </div>
      {/* Navigation */}
      <nav className="p-4 space-y-2">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <ProtectedNavLink key={item.key} href={item.href} onNavigate={protectedNavigate}>
              <Button
                variant={isActive(item.key) ? "default" : "ghost"}
                className={`w-full justify-start space-x-3 ${
                  isActive(item.key)
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-blue-100"
                }`}
                onClick={() => setActiveTab(item.key)}
              >
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
              </Button>
            </ProtectedNavLink>
          );
        })}
      </nav>
      {/* Current Projects - Scrollable */}
      <div className="flex-1 border-t border-sidebar-border flex flex-col min-h-0">
        <div className="p-4 pb-2 flex-shrink-0">
          <h3 className="text-muted-foreground text-sm font-medium">
            Active Projects
          </h3>
        </div>
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full px-4 pb-4">
            <div className="space-y-2">
              {(projects as any[])
                .filter((project: any) => !project.isInactive)
                .sort((a: any, b: any) => a.name.localeCompare(b.name))
                .map((project: any) => (
                <ProtectedNavLink 
                  key={project.id}
                  href={`/projects/${project.id}`}
                  onNavigate={protectedNavigate}
                >
                  <div className="flex items-center space-x-3 p-2 rounded hover:bg-blue-100 cursor-pointer transition-colors">
                    <div className="w-3 h-3 bg-accent rounded-full"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{project.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {project.projectId}
                      </p>
                    </div>
                  </div>
                </ProtectedNavLink>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
      {/* User Profile */}
      <div className="p-4 border-t border-sidebar-border flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-sidebar-accent rounded-full flex items-center justify-center">
            <User className="text-sidebar-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{user?.name || "Unknown User"}</p>
            <p className="text-xs text-muted-foreground">{user?.role || "No Role"}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-sidebar-foreground hover:bg-blue-100"
            onClick={onLogout}
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
