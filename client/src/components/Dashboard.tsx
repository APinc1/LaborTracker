import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, addDays, subDays } from "date-fns";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  Upload,
  CheckCircle,
  X,
  AlertTriangle
} from "lucide-react";
import ExportButtons from "./ExportButtons";
import { TaskCardWithForeman } from '@/components/TaskCardWithForeman';

export default function Dashboard() {
  const today = new Date();
  const todayFormatted = format(today, "yyyy-MM-dd");
  const yesterdayFormatted = format(subDays(today, 1), "yyyy-MM-dd");
  const tomorrowFormatted = format(addDays(today, 1), "yyyy-MM-dd");

  // Fetch tasks for the three main days with fast caching
  const { data: todayTasks = [], isLoading: todayLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", todayFormatted, todayFormatted],
    staleTime: 30000,
  });

  const { data: yesterdayTasks = [], isLoading: yesterdayLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", yesterdayFormatted, yesterdayFormatted],
    staleTime: 30000,
  });

  const { data: tomorrowTasks = [], isLoading: tomorrowLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", tomorrowFormatted, tomorrowFormatted],
    staleTime: 30000,
  });

  // Fetch today's assignments only (not all assignments for performance)
  const { data: assignments = [] } = useQuery({
    queryKey: ["/api/assignments/date", todayFormatted],
    staleTime: 30000,
  });

  // Fetch supporting data with longer cache times for performance
  const { data: employees = [] } = useQuery({
    queryKey: ["/api/employees"],
    staleTime: 300000, // 5 minutes
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 300000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["/api/locations"],
    staleTime: 300000,
  });

  // State for selected day for assignments
  const [selectedDay, setSelectedDay] = useState<'yesterday' | 'today' | 'tomorrow'>('today');

  const getEmployeeStatus = (hours: number) => {
    if (hours > 8) return { 
      color: "bg-red-500", 
      text: "text-white", 
      label: "Overbooked"
    };
    if (hours < 8) return { 
      color: "bg-yellow-500", 
      text: "text-white", 
      label: "Underbooked"
    };
    return { 
      color: "bg-green-500", 
      text: "text-white", 
      label: "Optimal"
    };
  };

  const getTaskAssignments = (taskId: number, date: string) => {
    return (assignments as any[]).filter((assignment: any) => 
      assignment.taskId === taskId && assignment.assignmentDate === date
    );
  };

  const getProjectName = (projectId: number) => {
    const project = (projects as any[]).find((p: any) => p.id === projectId);
    return project?.name || 'Unknown Project';
  };

  const getLocationName = (locationId: number) => {
    const location = (locations as any[]).find((l: any) => l.id === locationId);
    return location?.name || 'Unknown Location';
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

  // Helper function to get selected day's data
  const getSelectedDayData = () => {
    switch (selectedDay) {
      case 'yesterday':
        return { 
          tasks: yesterdayTasks, 
          date: yesterdayFormatted, 
          loading: yesterdayLoading,
          label: 'Yesterday'
        };
      case 'today':
        return { 
          tasks: todayTasks, 
          date: todayFormatted, 
          loading: todayLoading,
          label: 'Today'
        };
      case 'tomorrow':
        return { 
          tasks: tomorrowTasks, 
          date: tomorrowFormatted, 
          loading: tomorrowLoading,
          label: 'Tomorrow'
        };
      default:
        return { 
          tasks: todayTasks, 
          date: todayFormatted, 
          loading: todayLoading,
          label: 'Today'
        };
    }
  };

  const selectedDayData = getSelectedDayData();
  
  // Create employee assignments summary for selected day
  const employeeAssignments = (selectedDayData.tasks as any[])
    .map((task: any) => {
      const taskAssignments = getTaskAssignments(task.id, selectedDayData.date);
      
      return taskAssignments.map((assignment: any) => {
        const employee = getEmployeeInfo(assignment.employeeId);
        const hours = parseFloat(assignment.assignedHours) || 0;
        
        return {
          employeeId: assignment.employeeId,
          employeeName: employee?.name || 'Unknown',
          teamMemberId: employee?.teamMemberId || 'N/A',
          hours,
          taskName: task.name,
          projectName: getProjectName(task.projectId || locations.find((l: any) => l.id === task.locationId)?.projectId),
          locationName: getLocationName(task.locationId),
          status: task.status,
        };
      });
    })
    .flat()
    .reduce((acc: any[], assignment: any) => {
      const existing = acc.find(a => a.employeeId === assignment.employeeId);
      if (existing) {
        existing.hours += assignment.hours;
        existing.tasks.push({
          name: assignment.taskName,
          project: assignment.projectName,
          location: assignment.locationName,
          status: assignment.status,
          hours: assignment.hours
        });
      } else {
        acc.push({
          ...assignment,
          tasks: [{
            name: assignment.taskName,
            project: assignment.projectName,
            location: assignment.locationName,
            status: assignment.status,
            hours: assignment.hours
          }]
        });
      }
      return acc;
    }, [])
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  const isLoading = todayLoading || yesterdayLoading || tomorrowLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Project overview and daily task management
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <ExportButtons />
        </div>
      </div>

      {/* Three Day Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Yesterday */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Yesterday</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">{format(subDays(today, 1), 'MMM d, yyyy')}</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(yesterdayTasks as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks scheduled</p>
              ) : (
                (yesterdayTasks as any[]).slice(0, 5).map((task: any) => (
                  <TaskCardWithForeman
                    key={task.id}
                    task={task}
                    assignments={getTaskAssignments(task.id, yesterdayFormatted)}
                    employees={employees as any[]}
                    scheduledHours={getScheduledHours(task, yesterdayFormatted)}
                    actualHours={getActualHours(task, yesterdayFormatted)}
                    locationName={getLocationName(task.locationId)}
                    compact={true}
                  />
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Today */}
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center space-x-2 text-blue-700">
              <BarChart3 className="h-5 w-5" />
              <span>Today</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">{format(today, 'MMM d, yyyy')}</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(todayTasks as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks scheduled</p>
              ) : (
                (todayTasks as any[]).slice(0, 5).map((task: any) => (
                  <TaskCardWithForeman
                    key={task.id}
                    task={task}
                    assignments={getTaskAssignments(task.id, todayFormatted)}
                    employees={employees as any[]}
                    scheduledHours={getScheduledHours(task, todayFormatted)}
                    actualHours={getActualHours(task, todayFormatted)}
                    locationName={getLocationName(task.locationId)}
                    compact={true}
                  />
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tomorrow */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center space-x-2">
              <MapPin className="h-5 w-5" />
              <span>Tomorrow</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">{format(addDays(today, 1), 'MMM d, yyyy')}</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(tomorrowTasks as any[]).length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks scheduled</p>
              ) : (
                (tomorrowTasks as any[]).slice(0, 5).map((task: any) => (
                  <TaskCardWithForeman
                    key={task.id}
                    task={task}
                    assignments={getTaskAssignments(task.id, tomorrowFormatted)}
                    employees={employees as any[]}
                    scheduledHours={getScheduledHours(task, tomorrowFormatted)}
                    actualHours={getActualHours(task, tomorrowFormatted)}
                    locationName={getLocationName(task.locationId)}
                    compact={true}
                  />
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employee Assignments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Employee Assignments</span>
            </CardTitle>
            <div className="flex space-x-2">
              {['yesterday', 'today', 'tomorrow'].map((day) => (
                <Button
                  key={day}
                  size="sm"
                  variant={selectedDay === day ? "default" : "outline"}
                  onClick={() => setSelectedDay(day as any)}
                >
                  {day.charAt(0).toUpperCase() + day.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {selectedDayData.loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : employeeAssignments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No employee assignments for {selectedDayData.label.toLowerCase()}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Team ID</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tasks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeeAssignments.map((assignment: any, index: number) => {
                  const status = getEmployeeStatus(assignment.hours);
                  return (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {assignment.employeeName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {assignment.teamMemberId}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {assignment.hours}h
                      </TableCell>
                      <TableCell>
                        <Badge className={`${status.color} ${status.text}`}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {assignment.tasks.map((task: any, taskIndex: number) => (
                            <div key={taskIndex} className="text-sm">
                              <span className="font-medium">{task.name}</span>
                              <span className="text-muted-foreground"> - {task.location}</span>
                            </div>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}