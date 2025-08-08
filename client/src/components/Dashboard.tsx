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
  // Helper function to find the previous/next day (skip weekends only if no work scheduled)
  const findPreviousDay = (date: Date): Date => {
    return subDays(date, 1);
  };

  const findNextDay = (date: Date): Date => {
    return addDays(date, 1);
  };

  const today = new Date();
  const previousDay = findPreviousDay(today);
  const nextDay = findNextDay(today);

  const todayFormatted = format(today, "yyyy-MM-dd");
  const previousDayFormatted = format(previousDay, "yyyy-MM-dd");
  const nextDayFormatted = format(nextDay, "yyyy-MM-dd");

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
            <Badge variant="outline" className="text-xs">
              {task.costCode}
            </Badge>
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
                  
                  const isForeman = employee.isForeman === true;
                  const isDriver = employee.primaryTrade === 'Driver' || employee.secondaryTrade === 'Driver';
                  const assignedHours = parseFloat(assignment.assignedHours) || 0;
                  
                  return (
                    <div key={assignment.id} className="text-xs">
                      <span className={isForeman ? 'font-bold text-gray-800' : 'text-gray-600'}>
                        {employee.name}
                        {isDriver && ' (Driver)'}
                        {assignedHours !== 8 && ` (${assignedHours}h)`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Task Description and Notes */}
        {(task.description || task.workDescription || task.notes) && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            {(task.description || task.workDescription) && (
              <p className="text-sm text-gray-600">
                <span className="font-medium">Description: </span>
                {task.description || task.workDescription}
              </p>
            )}
            {task.notes && (
              <p className="text-sm text-gray-600">
                <span className="font-medium">Notes: </span>
                {task.notes}
              </p>
            )}
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
                <CardTitle>Yesterday</CardTitle>
                <Badge variant="outline">
                  {(previousDayTasks as any[]).length} Tasks
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {format(previousDay, "EEEE, MMMM d, yyyy")}
              </p>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {(previousDayTasks as any[]).length === 0 ? (
                <p className="text-gray-500 text-center py-8">No tasks scheduled</p>
              ) : (
                (previousDayTasks as any[]).map((task: any) => renderTaskCard(task, previousDayFormatted))
              )}
            </CardContent>
          </Card>

          {/* Today's Tasks */}
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle>Today</CardTitle>
                <Badge className="bg-primary text-primary-foreground">
                  {(todayTasks as any[]).length} Tasks
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {format(today, "MMMM d, yyyy")}
              </p>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {(todayTasks as any[]).length === 0 ? (
                <p className="text-gray-500 text-center py-8">No tasks scheduled for today</p>
              ) : (
                (todayTasks as any[]).map((task: any) => renderTaskCard(task, todayFormatted))
              )}
            </CardContent>
          </Card>

          {/* Next Day Tasks */}
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle>Tomorrow</CardTitle>
                <Badge variant="secondary">
                  {(nextDayTasks as any[]).length} Tasks
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {format(nextDay, "EEEE, MMMM d, yyyy")}
              </p>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {(nextDayTasks as any[]).length === 0 ? (
                <p className="text-gray-500 text-center py-8">No tasks scheduled</p>
              ) : (
                (nextDayTasks as any[]).map((task: any) => renderTaskCard(task, nextDayFormatted))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Employee Assignments & Conflicts */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle>Employee Assignments</CardTitle>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">8+ Hours</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">&lt;8 Hours</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">8 Hours</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Employee</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Type</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Crew</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Assigned Task</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Hours</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(assignments as any[]).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500">
                        No employee assignments found
                      </td>
                    </tr>
                  ) : (
                    (assignments as any[]).map((assignment: any) => {
                      const employee = (employees as any[]).find((e: any) => e.id === assignment.employeeId);
                      const hours = parseFloat(assignment.assignedHours) || 0;
                      const status = getEmployeeStatus(hours);
                      
                      return (
                        <tr
                          key={assignment.id}
                          className={`border-b border-gray-100 hover:bg-gray-50 ${
                            hours >= 8 ? "bg-red-50" : hours < 8 ? "bg-yellow-50" : ""
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                                <User className="text-gray-600 text-sm" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">{employee?.name || "Unknown"}</p>
                                <p className="text-sm text-gray-500">{employee?.teamMemberId || "N/A"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={getEmployeeTypeVariant(employee?.employeeType || "")}>
                              {employee?.employeeType || "Unknown"}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-gray-600">{employee?.crewId || "Unassigned"}</span>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium text-gray-800">{assignment.taskName || assignment.taskId}</p>
                              <p className="text-sm text-gray-500">Task Assignment</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`font-medium ${status.textColor}`}>
                              {hours.toFixed(1)}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2">
                              <div className={`w-3 h-3 ${status.color} rounded-full`}></div>
                              <span className={`text-sm ${status.textColor} font-medium`}>
                                {status.text}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
                              Edit
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Location Progress */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Location Progress</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {(locations as any[]).map((location: any) => {
                const project = (projects as any[]).find((proj: any) => proj.id === location.projectId);
                // Calculate progress based on completed tasks vs total tasks
                const locationTasks = [...(todayTasks as any[]), ...(previousDayTasks as any[]), ...(nextDayTasks as any[])]
                  .filter((task: any) => task.locationId === location.locationId);
                const completedTasks = locationTasks.filter((task: any) => task.status === 'Completed').length;
                const totalTasks = locationTasks.length;
                const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                
                return (
                  <div key={location.locationId} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-800">{project?.name} - {location.name}</h4>
                      <span className="text-sm text-gray-600">
                        {progressPercentage}% Complete ({completedTasks}/{totalTasks} tasks)
                      </span>
                    </div>
                    <Progress value={progressPercentage} className="mb-2" />
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Tasks: {totalTasks}</span>
                      <span>Completed: {completedTasks}</span>
                    </div>
                  </div>
                );
              })}
              {(locations as any[]).length === 0 && (
                <p className="text-gray-500 text-center py-8">No locations found</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button
                variant="outline"
                className="p-4 h-auto flex flex-col items-center space-y-2"
              >
                <Plus className="text-primary text-2xl" />
                <span className="font-medium text-gray-800">New Project</span>
              </Button>
              <Button
                variant="outline"
                className="p-4 h-auto flex flex-col items-center space-y-2"
              >
                <Upload className="text-accent text-2xl" />
                <span className="font-medium text-gray-800">Import Budget</span>
              </Button>
              <Button
                variant="outline"
                className="p-4 h-auto flex flex-col items-center space-y-2"
              >
                <Users className="text-warning text-2xl" />
                <span className="font-medium text-gray-800">Assign Crew</span>
              </Button>
              <Button
                variant="outline"
                className="p-4 h-auto flex flex-col items-center space-y-2"
              >
                <BarChart3 className="text-gray-600 text-2xl" />
                <span className="font-medium text-gray-800">View Reports</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
