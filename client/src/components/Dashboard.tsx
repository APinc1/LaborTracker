import { useQuery } from "@tanstack/react-query";
import { format, addDays, subDays, isWeekend } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  MapPin, 
  Tag, 
  User, 
  Clock, 
  Plus, 
  FileText, 
  Users, 
  BarChart3, 
  Upload 
} from "lucide-react";
import ExportButtons from "./ExportButtons";

export default function Dashboard() {
  // Helper function to find the next/previous work day (skip weekends)
  const findPreviousWorkDay = (date: Date): Date => {
    let prevDay = subDays(date, 1);
    while (isWeekend(prevDay)) {
      prevDay = subDays(prevDay, 1);
    }
    return prevDay;
  };

  const findNextWorkDay = (date: Date): Date => {
    let nextDay = addDays(date, 1);
    while (isWeekend(nextDay)) {
      nextDay = addDays(nextDay, 1);
    }
    return nextDay;
  };

  const today = new Date();
  const previousWorkDay = findPreviousWorkDay(today);
  const nextWorkDay = findNextWorkDay(today);

  const todayFormatted = format(today, "yyyy-MM-dd");
  const previousDayFormatted = format(previousWorkDay, "yyyy-MM-dd");
  const nextDayFormatted = format(nextWorkDay, "yyyy-MM-dd");

  const { data: todayTasks = [], isLoading: todayLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", todayFormatted, todayFormatted],
    staleTime: 30000,
  });

  const { data: previousDayTasks = [], isLoading: previousLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", previousDayFormatted, previousDayFormatted],
    staleTime: 30000,
  });

  const { data: nextDayTasks = [], isLoading: nextLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", nextDayFormatted, nextDayFormatted],
    staleTime: 30000,
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["/api/assignments"],
    staleTime: 30000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["/api/employees"],
    staleTime: 30000,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 30000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["/api/locations"],
    staleTime: 30000,
  });

  const { data: crews = [] } = useQuery({
    queryKey: ["/api/crews"],
    staleTime: 30000,
  });

  const getEmployeeStatus = (hours: number) => {
    if (hours >= 8) return { color: "bg-red-500", text: "Overbooked", textColor: "text-red-600" };
    if (hours < 8) return { color: "bg-yellow-500", text: "Under 8hrs", textColor: "text-yellow-600" };
    return { color: "bg-green-500", text: "Optimal", textColor: "text-green-600" };
  };

  const getEmployeeTypeVariant = (type: string) => {
    switch (type) {
      case "Core": return "default";
      case "Foreman": return "secondary";
      case "Driver": return "outline";
      case "Apprentice": return "outline";
      default: return "default";
    }
  };

  // Helper functions to get enhanced task information
  const getProjectName = (task: any) => {
    if (!task.locationId) return "Unknown Project";
    const location = (locations as any[]).find((loc: any) => loc.locationId === task.locationId);
    if (!location) return "Unknown Project";
    const project = (projects as any[]).find((proj: any) => proj.id === location.projectId);
    return project?.name || "Unknown Project";
  };

  const getLocationName = (task: any) => {
    if (!task.locationId) return "Unknown Location";
    const location = (locations as any[]).find((loc: any) => loc.locationId === task.locationId);
    return location?.name || "Unknown Location";
  };

  const getTaskAssignments = (taskId: number, date: string) => {
    return (assignments as any[]).filter((assignment: any) => 
      assignment.taskId === taskId && assignment.assignmentDate === date
    );
  };

  const getEmployeeInfo = (employeeId: number) => {
    return (employees as any[]).find((emp: any) => emp.id === employeeId);
  };

  const getScheduledHours = (task: any, date: string) => {
    const taskAssignments = getTaskAssignments(task.id, date);
    return taskAssignments.reduce((total: number, assignment: any) => 
      total + (parseFloat(assignment.assignedHours) || 0), 0
    );
  };

  const getActualHours = (task: any, date: string) => {
    const taskAssignments = getTaskAssignments(task.id, date);
    return taskAssignments.reduce((total: number, assignment: any) => 
      total + (parseFloat(assignment.actualHours) || 0), 0
    );
  };

  // Enhanced task card component
  const renderTaskCard = (task: any, date: string) => {
    const taskAssignments = getTaskAssignments(task.id, date);
    const scheduledHours = getScheduledHours(task, date);
    const actualHours = getActualHours(task, date);
    const projectName = getProjectName(task);
    const locationName = getLocationName(task);

    return (
      <div key={task.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-accent rounded-full"></div>
            <h4 className="font-medium text-gray-800">{task.name}</h4>
          </div>
          <span className="text-sm text-gray-500">{task.startTime || "8:00 AM"}</span>
        </div>

        <div className="space-y-2">
          {/* Project and Location */}
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <MapPin className="w-4 h-4" />
            <span className="font-medium">{projectName}</span>
            <span className="text-gray-400">•</span>
            <span>{locationName}</span>
          </div>

          {/* Cost Code */}
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Tag className="w-4 h-4" />
            <span>{task.costCode}</span>
          </div>

          {/* Hours Information */}
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Clock className="w-4 h-4" />
            <span>{scheduledHours.toFixed(1)}h scheduled</span>
            {actualHours > 0 && (
              <span className="text-green-600">/ {actualHours.toFixed(1)}h actual</span>
            )}
          </div>

          {/* Assigned Employees */}
          {taskAssignments.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Users className="w-4 h-4" />
                <span>Employees Assigned:</span>
              </div>
              <div className="ml-6 space-y-1">
                {taskAssignments.map((assignment: any) => {
                  const employee = getEmployeeInfo(assignment.employeeId);
                  if (!employee) return null;
                  
                  const isForeman = employee.employeeType === 'Foreman';
                  const isDriver = employee.employeeType === 'Driver';
                  
                  return (
                    <div key={assignment.id} className="flex items-center space-x-2">
                      <Badge variant={getEmployeeTypeVariant(employee.employeeType)} className="text-xs">
                        {employee.employeeType}
                      </Badge>
                      <span className={`text-xs ${isForeman ? 'font-bold' : ''}`}>
                        {employee.name}
                        {isDriver && ' (Driver)'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Task Description */}
        {task.description && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-sm text-gray-600">
              <span className="font-medium">Description: </span>
              {task.description}
            </p>
          </div>
        )}

        {/* Task Notes */}
        {task.notes && (
          <div className="mt-2">
            <p className="text-sm text-gray-600">
              <span className="font-medium">Notes: </span>
              {task.notes}
            </p>
          </div>
        )}
      </div>
    );
  };

  if (todayLoading || previousLoading || nextLoading || assignmentsLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Daily Schedule Overview</h2>
            <p className="text-gray-600 mt-1">
              Today • {format(new Date(), "MMMM d, yyyy")}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <ExportButtons />
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {/* Three-Day Schedule Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Previous Day Tasks */}
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle>{format(previousWorkDay, "EEEE")}</CardTitle>
                <Badge variant="outline">
                  {previousDayTasks.length} Tasks
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {format(previousWorkDay, "MMMM d, yyyy")}
              </p>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {previousDayTasks.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No tasks scheduled</p>
              ) : (
                previousDayTasks.map((task: any) => renderTaskCard(task, previousDayFormatted))
              )}
            </CardContent>
          </Card>

          {/* Today's Tasks */}
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle>Today</CardTitle>
                <Badge className="bg-primary text-primary-foreground">
                  {todayTasks.length} Tasks
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {format(today, "MMMM d, yyyy")}
              </p>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {todayTasks.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No tasks scheduled for today</p>
              ) : (
                todayTasks.map((task: any) => renderTaskCard(task, todayFormatted))
              )}
            </CardContent>
          </Card>

          {/* Next Day Tasks */}
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle>{format(nextWorkDay, "EEEE")}</CardTitle>
                <Badge variant="secondary">
                  {nextDayTasks.length} Tasks
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {format(nextWorkDay, "MMMM d, yyyy")}
              </p>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {nextDayTasks.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No tasks scheduled</p>
              ) : (
                nextDayTasks.map((task: any) => renderTaskCard(task, nextDayFormatted))
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
