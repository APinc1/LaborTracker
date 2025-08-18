import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Calendar as CalendarIcon, Clock, User, MapPin, Tag, Edit, Trash2, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addWeeks, addMonths, subWeeks, subMonths } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import CreateTaskModal from "./CreateTaskModal";
import EditTaskModal from "./EditTaskModal";
import EnhancedAssignmentModal from "./EnhancedAssignmentModal";
import { apiRequest } from "@/lib/queryClient";

export default function ScheduleManagement() {
  const [selectedProject, setSelectedProject] = useState<string>("ALL_PROJECTS");
  const [selectedLocation, setSelectedLocation] = useState<string>("ALL_LOCATIONS");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedTaskForAssignment, setSelectedTaskForAssignment] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState(null);
  
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

  const handleDeleteTaskClick = (task: any) => {
    setTaskToDelete(task);
    setDeleteConfirmOpen(true);
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
      setDeleteConfirmOpen(false);
      setTaskToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete task",
        variant: "destructive"
      });
    }
  });

  const confirmDeleteTask = () => {
    if (taskToDelete) {
      handleDeleteTask.mutate(taskToDelete.id.toString());
    }
  };

  // Navigation functions for week/month view
  const navigatePrevious = () => {
    if (viewMode === 'week') {
      setSelectedDate(subWeeks(selectedDate, 1));
    } else {
      setSelectedDate(subMonths(selectedDate, 1));
    }
  };

  const navigateNext = () => {
    if (viewMode === 'week') {
      setSelectedDate(addWeeks(selectedDate, 1));
    } else {
      setSelectedDate(addMonths(selectedDate, 1));
    }
  };

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 30000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["/api/projects", selectedProject, "locations"],
    queryFn: async () => {
      if (selectedProject === "ALL_PROJECTS") {
        // When viewing all projects, get locations from all projects
        const locationArrays = await Promise.all(
          projects.map(async (project: any) => {
            try {
              const response = await fetch(`/api/projects/${project.id}/locations`);
              if (response.ok) {
                return await response.json();
              }
            } catch (error) {
              console.error(`Failed to fetch locations for project ${project.id}:`, error);
            }
            return [];
          })
        );
        return locationArrays.flat();
      } else {
        // When viewing a specific project, use the project-specific endpoint
        const response = await fetch(`/api/projects/${selectedProject}/locations`);
        if (response.ok) {
          return await response.json();
        }
        return [];
      }
    },
    enabled: !!selectedProject && projects.length > 0,
    staleTime: 30000,
  });

  // Dynamic date range based on view mode
  const getDateRange = () => {
    if (viewMode === 'week') {
      return {
        start: startOfWeek(selectedDate),
        end: endOfWeek(selectedDate)
      };
    } else {
      return {
        start: startOfMonth(selectedDate),
        end: endOfMonth(selectedDate)
      };
    }
  };

  const dateRange = getDateRange();

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", format(dateRange.start, 'yyyy-MM-dd'), format(dateRange.end, 'yyyy-MM-dd')],
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

  const { data: users = [] } = useQuery({
    queryKey: ["/api/users"],
    staleTime: 30000,
  });

  // Fetch all budget items for remaining hours calculation
  const { data: allBudgetItems = [] } = useQuery({
    queryKey: ["/api/budget/all", selectedProject],
    queryFn: async () => {
      // Get budget items for all relevant locations
      let locationsToFetch = [];
      
      if (selectedProject === "ALL_PROJECTS") {
        // When viewing all projects, get locations from all projects
        const projectPromises = projects.map(async (project: any) => {
          try {
            const response = await fetch(`/api/projects/${project.id}/locations`);
            if (response.ok) {
              return await response.json();
            }
          } catch (error) {
            console.error(`Failed to fetch locations for project ${project.id}:`, error);
          }
          return [];
        });
        const locationArrays = await Promise.all(projectPromises);
        locationsToFetch = locationArrays.flat();
      } else {
        // When viewing a specific project, use its locations
        locationsToFetch = locations;
      }

      const budgetPromises = locationsToFetch.map(async (location: any) => {
        try {
          const response = await fetch(`/api/locations/${location.locationId}/budget`);
          if (response.ok) {
            return await response.json();
          }
        } catch (error) {
          console.error(`Failed to fetch budget for location ${location.locationId}:`, error);
        }
        return [];
      });
      const budgetArrays = await Promise.all(budgetPromises);
      return budgetArrays.flat();
    },
    enabled: projects.length > 0,
    staleTime: 30000,
  });

  const getViewDays = () => {
    return eachDayOfInterval({
      start: dateRange.start,
      end: dateRange.end,
    });
  };

  const getTasksForDay = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    let filteredTasks = tasks.filter((task: any) => task.taskDate === dayStr);
    
    // Filter by project if a specific project is selected
    if (selectedProject && selectedProject !== "ALL_PROJECTS") {
      const projectLocationIds = locations.map((loc: any) => loc.id);
      filteredTasks = filteredTasks.filter((task: any) => projectLocationIds.includes(task.locationId));
      
      // Filter by location if a specific location is selected within the project
      if (selectedLocation && selectedLocation !== "ALL_LOCATIONS") {
        // selectedLocation is a locationId string, need to find the corresponding database ID
        const selectedLocationObject = locations.find((loc: any) => loc.locationId === selectedLocation);
        if (selectedLocationObject) {
          filteredTasks = filteredTasks.filter((task: any) => task.locationId === selectedLocationObject.id);
        }
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
    // Use the actual status from the database if available
    if (task.status) {
      switch (task.status) {
        case 'complete':
          return { status: 'complete', label: 'Complete', color: 'bg-green-100 text-green-800' };
        case 'in_progress':
          return { status: 'in_progress', label: 'In Progress', color: 'bg-blue-100 text-blue-800' };
        default:
          return { status: 'upcoming', label: 'Upcoming', color: 'bg-gray-100 text-gray-800' };
      }
    }
    
    // Fallback logic for backwards compatibility
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

  // Calculate total actual hours from assignments
  const calculateActualHours = (task: any) => {
    const taskId = task.id || task.taskId;
    const taskAssignments = assignments.filter((assignment: any) => 
      assignment.taskId === taskId
    );
    
    const totalHours = taskAssignments.reduce((sum: number, assignment: any) => {
      return sum + parseFloat(assignment.actualHours || 0);
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
    if (!task.locationId) return "Unknown Project";
    // After migration: task.locationId is now the database ID (integer), not the locationId string
    const location = locations.find((loc: any) => loc.id === task.locationId);
    if (!location) return "Unknown Project";
    
    // Find project by matching the database ID
    const project = projects.find((proj: any) => proj.id === location.projectId);
    return project?.name || "Unknown Project";
  };

  // Get location name from task
  const getLocationName = (task: any) => {
    if (!task.locationId) return "Unknown Location";
    // After migration: task.locationId is now the database ID (integer), not the locationId string
    const location = locations.find((loc: any) => loc.id === task.locationId);
    return location?.name || "Unknown Location";
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

  // Helper function to get remaining hours color based on percentage
  const getRemainingHoursColor = (remainingHours: number, totalBudgetHours: number) => {
    if (totalBudgetHours === 0) return 'text-gray-600';
    
    const percentage = (remainingHours / totalBudgetHours) * 100;
    
    if (percentage <= 0) {
      return 'text-red-600';
    } else if (percentage <= 15) {
      return 'text-yellow-600';
    } else {
      return 'text-green-600';
    }
  };

  // Calculate remaining hours for a cost code up to the current task date
  const calculateRemainingHours = (task: any, allTasks: any[], budgetItems: any[]) => {
    const costCode = task.costCode;
    if (!costCode) return { remainingHours: null, totalBudgetHours: 0 };

    // Filter budget items to only include the current task's location
    const taskLocation = locations.find((loc: any) => loc.id === task.locationId);
    const locationSpecificBudgetItems = budgetItems.filter((item: any) => 
      item.locationId === task.locationId
    );

    // Get total budget hours for this cost code from location-specific budget items
    const costCodeBudgetHours = locationSpecificBudgetItems.reduce((total: number, item: any) => {
      let itemCostCode = item.costCode || 'UNCATEGORIZED';
      
      // Handle combined cost codes (Demo/Ex + Base/Grading)
      if (itemCostCode === 'DEMO/EX' || itemCostCode === 'Demo/Ex' || 
          itemCostCode === 'BASE/GRADING' || itemCostCode === 'Base/Grading' || 
          itemCostCode === 'Demo/Ex + Base/Grading' || itemCostCode === 'DEMO/EX + BASE/GRADING') {
        itemCostCode = 'Demo/Ex + Base/Grading';
      }
      
      // Handle current task cost code in the same way
      let taskCostCode = costCode;
      if (taskCostCode === 'DEMO/EX' || taskCostCode === 'Demo/Ex' || 
          taskCostCode === 'BASE/GRADING' || taskCostCode === 'Base/Grading' || 
          taskCostCode === 'Demo/Ex + Base/Grading' || taskCostCode === 'DEMO/EX + BASE/GRADING') {
        taskCostCode = 'Demo/Ex + Base/Grading';
      }
      
      if (itemCostCode === taskCostCode) {
        // Only include parent items or standalone items (avoid double counting)
        const isParent = item.lineItemNumber && !item.lineItemNumber.includes('.');
        const isChild = item.lineItemNumber && item.lineItemNumber.includes('.');
        const hasChildren = budgetItems.some((child: any) => 
          child.lineItemNumber && child.lineItemNumber.includes('.') && 
          child.lineItemNumber.split('.')[0] === item.lineItemNumber
        );
        
        if (isParent || (!isChild && !hasChildren)) {
          return total + (parseFloat(item.hours) || 0);
        }
      }
      return total;
    }, 0);

    if (costCodeBudgetHours === 0) return { remainingHours: null, totalBudgetHours: 0 };

    // Find all tasks for this cost code up to and including the current task date, same location only
    const currentTaskDate = new Date(task.taskDate + 'T00:00:00').getTime();
    const relevantTasks = allTasks.filter((t: any) => {
      if (!t.costCode || t.locationId !== task.locationId) return false;
      
      // Handle cost code matching with combined codes
      let tCostCode = t.costCode;
      let taskCostCode = costCode;
      
      if (tCostCode === 'DEMO/EX' || tCostCode === 'Demo/Ex' || 
          tCostCode === 'BASE/GRADING' || tCostCode === 'Base/Grading' || 
          tCostCode === 'Demo/Ex + Base/Grading' || tCostCode === 'DEMO/EX + BASE/GRADING') {
        tCostCode = 'Demo/Ex + Base/Grading';
      }
      
      if (taskCostCode === 'DEMO/EX' || taskCostCode === 'Demo/Ex' || 
          taskCostCode === 'BASE/GRADING' || taskCostCode === 'Base/Grading' || 
          taskCostCode === 'Demo/Ex + Base/Grading' || taskCostCode === 'DEMO/EX + BASE/GRADING') {
        taskCostCode = 'Demo/Ex + Base/Grading';
      }
      
      const taskDate = new Date(t.taskDate + 'T00:00:00').getTime();
      const isSameCostCode = tCostCode === taskCostCode;
      const isCurrentOrBefore = taskDate <= currentTaskDate;
      
      // For tasks on the same date, use order to determine precedence (lower order = earlier)
      const isBefore = taskDate < currentTaskDate || 
                      (taskDate === currentTaskDate && (parseFloat(t.order) || 0) <= (parseFloat(task.order) || 0));
      
      return isSameCostCode && isBefore;
    });
    
    // Debug logging for remaining hours calculation
    if (task.costCode === 'Demo/Ex + Base/Grading' || task.costCode === 'DEMO/EX + BASE/GRADING') {
      console.log(`🔍 Remaining hours debug for task "${task.name}" (${task.costCode}):`, {
        taskDate: task.taskDate,
        taskOrder: task.order,
        relevantTasks: relevantTasks.map(t => ({
          name: t.name,
          date: t.taskDate,
          order: t.order,
          costCode: t.costCode
        })),
        budgetHours: costCodeBudgetHours
      });
    }

    // Sum hours from all relevant tasks (actual hours if available, otherwise scheduled hours)
    const usedHours = relevantTasks.reduce((total: number, t: any) => {
      const taskId = t.id || t.taskId;
      const taskAssignments = assignments.filter((assignment: any) => 
        assignment.taskId === taskId
      );
      
      // Try to get actual hours first
      const taskActualHours = taskAssignments.reduce((sum: number, assignment: any) => {
        return sum + (parseFloat(assignment.actualHours) || 0);
      }, 0);
      
      // If no actual hours, fall back to scheduled hours
      let taskHours = taskActualHours;
      if (taskActualHours === 0) {
        taskHours = taskAssignments.reduce((sum: number, assignment: any) => {
          return sum + (parseFloat(assignment.assignedHours) || 0);
        }, 0);
      }
      
      return total + taskHours;
    }, 0);

    // Calculate remaining hours
    const remainingHours = costCodeBudgetHours - usedHours;
    
    return {
      remainingHours: remainingHours, // Allow negative hours to show overruns
      totalBudgetHours: costCodeBudgetHours
    };
  };

  // Format detailed assignment display for task cards with proper foreman hierarchy
  const formatDetailedAssignmentDisplay = (task: any) => {
    const assignedEmployees = getAssignedEmployees(task);
    const personnelElements = [];
    
    // Get foremen from assigned employees
    const assignedForemen = assignedEmployees.filter((emp: any) => emp.isForeman);
    const allForemen = employees.filter((emp: any) => emp.isForeman);
    
    // Add superintendent first if exists
    if (task.superintendentId) {
      const superintendent = users.find((u: any) => u.id === task.superintendentId);
      if (superintendent) {
        personnelElements.push(
          <div key={`super-${task.superintendentId}`} className="text-sm font-bold">
            {superintendent.name} (Super)
          </div>
        );
      }
    }
    
    // Add foreman with proper hierarchy display
    if (task.foremanId) {
      const currentForeman = allForemen.find(f => f.id === task.foremanId);
      if (currentForeman) {
        const assignedCount = assignedForemen.length;
        let displayText = '';
        let isBold = assignedCount > 0;
        
        if (assignedCount === 0) {
          displayText = '(Responsible Foreman)';
          isBold = false; // Not bold if not assigned
        } else if (assignedCount === 1) {
          displayText = '(Foreman)';
        } else {
          displayText = '(Overall Foreman)';
        }
        
        personnelElements.push(
          <div key={`foreman-${currentForeman.id}`} className={`text-sm ${isBold ? 'font-bold' : 'text-gray-600'}`}>
            {currentForeman.name} {displayText}
          </div>
        );
      }
    }
    
    // Add assigned employees (excluding the foreman that's already displayed)
    if (assignedEmployees.length > 0) {
      // Sort employees: foremen first, drivers last, others in between
      const sortedEmployees = [...assignedEmployees].sort((a: any, b: any) => {
        if (a.isForeman && !b.isForeman) return -1;
        if (!a.isForeman && b.isForeman) return 1;
        if (a.primaryTrade === 'Driver' && b.primaryTrade !== 'Driver') return 1;
        if (a.primaryTrade !== 'Driver' && b.primaryTrade === 'Driver') return -1;
        return 0;
      });

      const employeeElements = sortedEmployees.map((employee: any) => {
        const isDriver = employee.primaryTrade === 'Driver';
        const isForeman = employee.isForeman;
        const hours = parseFloat(employee.assignedHours);
        const showHours = hours !== 8;
        
        // Skip foreman if already displayed above
        if (isForeman && task.foremanId && employee.id === task.foremanId) {
          return null;
        }
        
        let displayText = employee.name;
        if (isForeman) {
          displayText += ' (Foreman)';
        } else if (isDriver) {
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
      }).filter(Boolean);
      
      personnelElements.push(...employeeElements);
    }
    
    return personnelElements.length > 0 ? (
      <div className="space-y-1">
        {personnelElements}
      </div>
    ) : (
      <span className="text-gray-500">Unassigned</span>
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
                      <SelectItem key={project.id} value={String(project.id)}>
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
                  <div className="flex items-center space-x-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={navigatePrevious}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <CardTitle className="flex items-center gap-2">
                      <CalendarIcon className="w-5 h-5" />
                      {viewMode === 'week' 
                        ? `Week of ${format(dateRange.start, 'MMMM d, yyyy')}`
                        : `${format(dateRange.start, 'MMMM yyyy')}`
                      }
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={navigateNext}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant={viewMode === 'week' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setViewMode('week')}
                        className="flex items-center gap-1"
                      >
                        <CalendarDays className="w-4 h-4" />
                        Week
                      </Button>
                      <Button
                        variant={viewMode === 'month' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setViewMode('month')}
                        className="flex items-center gap-1"
                      >
                        <CalendarIcon className="w-4 h-4" />
                        Month
                      </Button>
                    </div>
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
                </div>
              </CardHeader>
              <CardContent>
                {tasksLoading ? (
                  <Skeleton className="h-96" />
                ) : (
                  <div className={`grid gap-1 ${viewMode === 'week' ? 'grid-cols-7' : 'grid-cols-7'}`}>
                    {getViewDays().map((day) => {
                      const dayTasks = getTasksForDay(day);
                      const isToday = isSameDay(day, new Date());
                      const isSelected = isSameDay(day, selectedDate);
                      
                      return (
                        <div
                          key={day.toISOString()}
                          className={`border rounded-lg p-2 cursor-pointer ${
                            viewMode === 'week' ? 'min-h-[180px]' : 'min-h-[120px]'
                          } ${
                            isToday ? 'bg-blue-50 border-blue-200' : 
                            isSelected ? 'bg-gray-50 border-gray-300' : 
                            'bg-white border-gray-200'
                          }`}
                          onClick={() => setSelectedDate(day)}
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
                                    <span>{calculateScheduledHours(task).toFixed(1)}h scheduled</span>
                                    {calculateActualHours(task) > 0 && (
                                      <span className="text-green-600">/ {calculateActualHours(task).toFixed(1)}h actual</span>
                                    )}
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
                              <div className="flex items-center space-x-1 ml-4">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditTask(task)}
                                  className="h-8 w-8 p-0 hover:bg-gray-100"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleAssignTaskClick(task)}
                                  className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                >
                                  <User className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteTaskClick(task)}
                                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
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
                                <span>{calculateScheduledHours(task).toFixed(1)} hours scheduled</span>
                                {calculateActualHours(task) > 0 && (
                                  <span className="text-green-600">/ {calculateActualHours(task).toFixed(1)} actual</span>
                                )}
                              </div>
                              {(() => {
                                const result = calculateRemainingHours(task, tasks, allBudgetItems);
                                const remainingHours = result?.remainingHours;
                                const totalBudgetHours = result?.totalBudgetHours || 0;
                                
                                return remainingHours !== null && (
                                  <div className="flex items-center space-x-2 mt-1">
                                    <Clock className="w-4 h-4 text-gray-500" />
                                    <span className={getRemainingHoursColor(remainingHours, totalBudgetHours)}>
                                      {remainingHours <= 0 
                                        ? `${Math.abs(remainingHours).toFixed(1)}h over` 
                                        : `${remainingHours.toFixed(1)}h remaining`
                                      }
                                    </span>
                                  </div>
                                );
                              })()}
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
      />
      
      {editingTask && (
        <EditTaskModal
          isOpen={isEditTaskModalOpen}
          onClose={() => {
            setIsEditTaskModalOpen(false);
            setEditingTask(null);
          }}
          task={editingTask}
          onTaskUpdate={() => {
            queryClient.invalidateQueries({ 
              queryKey: ["/api/tasks/date-range"] 
            });
          }}
        />
      )}
      
      {selectedTaskForAssignment && (
        <EnhancedAssignmentModal
          isOpen={assignmentModalOpen}
          onClose={() => {
            setAssignmentModalOpen(false);
            setSelectedTaskForAssignment(null);
            // Refresh assignments data and task data to update remaining hours
            queryClient.invalidateQueries({ 
              queryKey: ["/api/assignments"] 
            });
            queryClient.invalidateQueries({ 
              queryKey: ["/api/tasks/date-range"] 
            });
          }}
          taskId={selectedTaskForAssignment.id}
          taskDate={selectedTaskForAssignment.taskDate}
          taskName={selectedTaskForAssignment.name}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the task "{taskToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeleteConfirmOpen(false);
              setTaskToDelete(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTask}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
