import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Calendar as CalendarIcon, Clock, User, MapPin, Tag, Edit, Trash2 } from "lucide-react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import CreateTaskModal from "./CreateTaskModal";
import EditTaskModal from "./EditTaskModal";
import AssignmentModal from "./AssignmentModal";
import { apiRequest } from "@/lib/queryClient";

export default function ScheduleManagement() {
  const [selectedProject, setSelectedProject] = useState<string>("ALL_PROJECTS");
  const [selectedLocation, setSelectedLocation] = useState<string>("ALL_LOCATIONS");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedTaskForAssignment, setSelectedTaskForAssignment] = useState(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Task action handlers
  const handleEditTask = (task: any) => {
    setEditingTask(task);
    setIsEditTaskModalOpen(true);
  };

  const handleAssignTaskClick = (task: any) => {
    setSelectedTaskForAssignment(task);
    setAssignmentModalOpen(true);
  };

  const handleDeleteTask = useMutation({
    mutationFn: (taskId: string) => apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Task deleted successfully"
      });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/tasks/date-range"] 
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete task",
        variant: "destructive"
      });
    }
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 30000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["/api/projects", selectedProject, "locations"],
    enabled: !!selectedProject && selectedProject !== "ALL_PROJECTS",
    staleTime: 30000,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", format(startOfWeek(selectedDate), 'yyyy-MM-dd'), format(endOfWeek(selectedDate), 'yyyy-MM-dd')],
    staleTime: 30000,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["/api/assignments"],
    staleTime: 30000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["/api/employees"],
    staleTime: 30000,
  });

  const getWeekDays = () => {
    return eachDayOfInterval({
      start: startOfWeek(selectedDate),
      end: endOfWeek(selectedDate),
    });
  };

  const getTasksForDay = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    let filteredTasks = tasks.filter((task: any) => task.taskDate === dayStr);
    
    // Filter by project if a specific project is selected
    if (selectedProject && selectedProject !== "ALL_PROJECTS") {
      const projectLocations = locations.map((loc: any) => loc.locationId);
      filteredTasks = filteredTasks.filter((task: any) => projectLocations.includes(task.locationId));
      
      // Filter by location if a specific location is selected within the project
      if (selectedLocation && selectedLocation !== "ALL_LOCATIONS") {
        filteredTasks = filteredTasks.filter((task: any) => task.locationId === selectedLocation);
      }
    }
    // If "ALL_PROJECTS" is selected, show all tasks without filtering
    
    return filteredTasks;
  };

  const getTaskTypeColor = (taskType: string) => {
    switch (taskType) {
      case 'Form': return 'bg-blue-100 text-blue-800';
      case 'Pour': return 'bg-green-100 text-green-800';
      case 'Demo/Ex': return 'bg-orange-100 text-orange-800';
      case 'Asphalt': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTaskStatus = (task: any) => {
    const currentDate = new Date().toISOString().split('T')[0];
    
    if (task.actualHours && parseFloat(task.actualHours) > 0) {
      return { status: 'complete', label: 'Complete', color: 'bg-green-100 text-green-800' };
    } else if (task.taskDate === currentDate) {
      return { status: 'in_progress', label: 'In Progress', color: 'bg-blue-100 text-blue-800' };
    } else {
      return { status: 'upcoming', label: 'Upcoming', color: 'bg-gray-100 text-gray-800' };
    }
  };

  // Calculate total scheduled hours from assignments
  const calculateScheduledHours = (task: any) => {
    const taskId = task.id || task.taskId;
    const taskAssignments = assignments.filter((assignment: any) => 
      assignment.taskId === taskId
    );
    
    const totalHours = taskAssignments.reduce((sum: number, assignment: any) => {
      return sum + parseFloat(assignment.assignedHours || 0);
    }, 0);
    
    return totalHours;
  };

  // Get assigned employees for a task
  const getAssignedEmployees = (task: any) => {
    const taskId = task.id || task.taskId;
    const taskAssignments = assignments.filter((assignment: any) => 
      assignment.taskId === taskId
    );
    
    return taskAssignments.map((assignment: any) => {
      const employee = employees.find((emp: any) => emp.id === assignment.employeeId);
      if (!employee) return null;
      
      return {
        ...employee,
        assignedHours: assignment.assignedHours
      };
    }).filter(Boolean);
  };

  // Get project name from task
  const getProjectName = (task: any) => {
    // Extract project ID from locationId (format: PRJ-YYYY-###_LocationName)
    const projectIdMatch = task.locationId?.match(/^(PRJ-\d{4}-\d{3})/);
    if (!projectIdMatch) return 'Unknown Project';
    
    const projectId = projectIdMatch[1];
    const project = projects.find((p: any) => p.projectId === projectId);
    return project?.name || 'Unknown Project';
  };

  // Get location name from task
  const getLocationName = (task: any) => {
    // Extract location name from locationId (format: PRJ-YYYY-###_LocationName)
    const locationMatch = task.locationId?.match(/^PRJ-\d{4}-\d{3}_(.+)$/);
    if (!locationMatch) return 'Unknown Location';
    
    // Convert underscores to spaces and handle common abbreviations
    return locationMatch[1].replace(/_/g, ' ');
  };

  // Format assignment display with proper formatting
  const formatAssignmentDisplay = (task: any) => {
    const assignedEmployees = getAssignedEmployees(task);
    if (assignedEmployees.length === 0) return 'Unassigned';
    
    // Sort employees: foremen first, drivers last, others in between
    const sortedEmployees = [...assignedEmployees].sort((a: any, b: any) => {
      if (a.isForeman && !b.isForeman) return -1;
      if (!a.isForeman && b.isForeman) return 1;
      if (a.primaryTrade === 'Driver' && b.primaryTrade !== 'Driver') return 1;
      if (a.primaryTrade !== 'Driver' && b.primaryTrade === 'Driver') return -1;
      return 0;
    });

    return sortedEmployees.map((employee: any) => {
      let displayName = employee.name;
      if (employee.primaryTrade === 'Driver') {
        displayName += ' (Driver)';
      }
      return displayName;
    }).join(', ');
  };

  // Format detailed assignment display for task cards
  const formatDetailedAssignmentDisplay = (task: any) => {
    const assignedEmployees = getAssignedEmployees(task);
    if (assignedEmployees.length === 0) return <span className="text-gray-500">Unassigned</span>;
    
    // Sort employees: foremen first, drivers last, others in between
    const sortedEmployees = [...assignedEmployees].sort((a: any, b: any) => {
      if (a.isForeman && !b.isForeman) return -1;
      if (!a.isForeman && b.isForeman) return 1;
      if (a.primaryTrade === 'Driver' && b.primaryTrade !== 'Driver') return 1;
      if (a.primaryTrade !== 'Driver' && b.primaryTrade === 'Driver') return -1;
      return 0;
    });

    return (
      <div className="space-y-1">
        {sortedEmployees.map((employee: any, index: number) => {
          const isDriver = employee.primaryTrade === 'Driver';
          const isForeman = employee.isForeman;
          const hours = parseFloat(employee.assignedHours);
          const showHours = hours !== 8;
          
          let displayText = employee.name;
          if (isDriver) {
            displayText += ' (Driver)';
          }
          if (showHours) {
            displayText += ` (${hours}h)`;
          }
          
          return (
            <div 
              key={employee.id} 
              className={`text-sm ${isForeman ? 'font-bold' : ''}`}
            >
              {displayText}
            </div>
          );
        })}
      </div>
    );
  };

  if (projectsLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Schedule Management</h2>
            <p className="text-gray-600 mt-1">Plan and track project schedules</p>
          </div>
          <Button 
            className="bg-primary hover:bg-primary/90"
            onClick={() => setIsCreateTaskModalOpen(true)}
            disabled={selectedProject === "ALL_PROJECTS"}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Task
          </Button>
        </div>
      </header>

      <main className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="space-y-4">
            {/* Project Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Project</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={selectedProject} onValueChange={(value) => {
                  setSelectedProject(value);
                  setSelectedLocation("ALL_LOCATIONS"); // Reset to all locations when project changes
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_PROJECTS">All projects</SelectItem>
                    {projects.map((project: any) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Location Filter */}
            {selectedProject && selectedProject !== "ALL_PROJECTS" && (
              <Card>
                <CardHeader>
                  <CardTitle>Location Filter</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                    <SelectTrigger>
                      <SelectValue placeholder="All locations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL_LOCATIONS">All locations</SelectItem>
                      {locations.map((location: any) => (
                        <SelectItem key={location.id} value={location.locationId}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {/* Show selected location info */}
                  {selectedLocation && selectedLocation !== "ALL_LOCATIONS" && (
                    <div className="mt-3 p-2 bg-blue-50 rounded-md">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span className="text-sm font-medium">
                          {locations.find((loc: any) => loc.locationId === selectedLocation)?.name}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Calendar */}
            <Card>
              <CardHeader>
                <CardTitle>Calendar</CardTitle>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  className="rounded-md border"
                />
              </CardContent>
            </Card>

            
          </div>

          {/* Main Schedule View */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    Week of {format(startOfWeek(selectedDate), 'MMMM d, yyyy')}
                  </CardTitle>
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    {selectedProject && selectedProject !== "ALL_PROJECTS" && (
                      <Badge variant="secondary">
                        {projects.find((p: any) => p.id.toString() === selectedProject)?.name}
                      </Badge>
                    )}
                    {selectedProject === "ALL_PROJECTS" && (
                      <Badge variant="secondary">All Projects</Badge>
                    )}
                    {selectedLocation && selectedLocation !== "ALL_LOCATIONS" && (
                      <Badge variant="outline">
                        {locations.find((loc: any) => loc.locationId === selectedLocation)?.name}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {tasksLoading ? (
                  <Skeleton className="h-96" />
                ) : (
                  <div className="grid grid-cols-7 gap-1">
                    {getWeekDays().map((day) => {
                      const dayTasks = getTasksForDay(day);
                      const isToday = isSameDay(day, new Date());
                      const isSelected = isSameDay(day, selectedDate);
                      
                      return (
                        <div
                          key={day.toISOString()}
                          className={`border rounded-lg p-2 min-h-[180px] ${
                            isToday ? 'bg-blue-50 border-blue-200' : 
                            isSelected ? 'bg-gray-50 border-gray-300' : 
                            'bg-white border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-medium text-sm">
                              {format(day, 'EEE')}
                            </h3>
                            <span className={`text-sm ${
                              isToday ? 'text-blue-600 font-bold' : 'text-gray-600'
                            }`}>
                              {format(day, 'd')}
                            </span>
                          </div>
                          
                          <div className="space-y-2">
                            {dayTasks.map((task: any) => (
                              <div
                                key={task.id}
                                className="border border-gray-200 rounded p-2 hover:shadow-sm transition-shadow"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center space-x-1">
                                    <Badge
                                      variant="outline"
                                      className={`text-xs ${getTaskTypeColor(task.taskType)}`}
                                    >
                                      {task.taskType}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center space-x-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleEditTask(task)}
                                      className="h-6 w-6 p-0 hover:bg-gray-100"
                                    >
                                      <Edit className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleAssignTaskClick(task)}
                                      className="h-6 w-6 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    >
                                      <User className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteTask.mutate(task.id.toString())}
                                      className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                                <h4 className="font-medium text-sm mb-1">{task.name}</h4>
                                <div className="space-y-1">
                                  <div className="flex items-center space-x-1 text-xs text-gray-600">
                                    <MapPin className="w-3 h-3" />
                                    <span>{getProjectName(task)}</span>
                                  </div>
                                  <div className="text-xs text-gray-500 ml-4">
                                    {getLocationName(task)}
                                  </div>
                                  <div className="flex items-center space-x-1 text-xs text-gray-600">
                                    <Clock className="w-3 h-3" />
                                    <span>{calculateScheduledHours(task).toFixed(1)}h</span>
                                  </div>
                                  <div className="mt-1">
                                    <Badge variant="outline" className="text-xs">
                                      {task.costCode}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Task Details for Selected Day */}
            {selectedDate && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>
                    Tasks for {format(selectedDate, 'MMMM d, yyyy')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {getTasksForDay(selectedDate).length === 0 ? (
                      <p className="text-gray-500 text-center py-8">
                        {selectedLocation && selectedLocation !== "ALL_LOCATIONS" ? 
                          `No tasks scheduled for this day at ${locations.find((loc: any) => loc.locationId === selectedLocation)?.name || 'selected location'}` :
                          'No tasks scheduled for this day'
                        }
                      </p>
                    ) : (
                      getTasksForDay(selectedDate).map((task: any) => (
                        <div key={task.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium text-lg">{task.name}</h4>
                            <div className="flex items-center space-x-2">
                              <Badge className={getTaskTypeColor(task.taskType)}>
                                {task.taskType}
                              </Badge>
                              <Badge className={getTaskStatus(task).color}>
                                {getTaskStatus(task).label}
                              </Badge>
                              <span className="text-sm text-gray-500">
                                {task.startTime || '8:00 AM'}
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <div className="flex items-center space-x-2 mb-1">
                                <MapPin className="w-4 h-4 text-gray-500" />
                                <span className="font-medium">{getProjectName(task)}</span>
                              </div>
                              <div className="text-gray-500 ml-6">{getLocationName(task)}</div>
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <Clock className="w-4 h-4 text-gray-500" />
                                <span>{calculateScheduledHours(task).toFixed(1)} hours</span>
                              </div>
                              <div className="mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {task.costCode}
                                </Badge>
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center space-x-2 mb-1">
                                <User className="w-4 h-4 text-gray-500" />
                                <span className="text-sm font-medium">Assigned:</span>
                              </div>
                              <div className="ml-6">
                                {formatDetailedAssignmentDisplay(task)}
                              </div>
                            </div>
                          </div>
                          {task.workDescription && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-sm text-gray-600">{task.workDescription}</p>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
      
      <CreateTaskModal
        isOpen={isCreateTaskModalOpen}
        onClose={() => setIsCreateTaskModalOpen(false)}
        selectedDate={format(selectedDate, 'yyyy-MM-dd')}
        selectedProject={selectedProject && selectedProject !== "ALL_PROJECTS" ? parseInt(selectedProject) : undefined}
      />
      
      {editingTask && (
        <EditTaskModal
          isOpen={isEditTaskModalOpen}
          onClose={() => {
            setIsEditTaskModalOpen(false);
            setEditingTask(null);
          }}
          task={editingTask}
          onSave={() => {
            queryClient.invalidateQueries({ 
              queryKey: ["/api/tasks/date-range"] 
            });
          }}
        />
      )}
      
      {selectedTaskForAssignment && (
        <AssignmentModal
          isOpen={assignmentModalOpen}
          onClose={() => {
            setAssignmentModalOpen(false);
            setSelectedTaskForAssignment(null);
          }}
          task={selectedTaskForAssignment}
          onAssignmentUpdate={() => {
            queryClient.invalidateQueries({ 
              queryKey: ["/api/assignments"] 
            });
          }}
        />
      )}
    </div>
  );
}
