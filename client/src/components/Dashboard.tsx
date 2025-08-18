import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, addDays, subDays, isWeekend } from "date-fns";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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

  // Get all tasks to find dates with scheduled work - reduced range for faster loading
  const { data: allTasks = [], isLoading: allTasksLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", format(subDays(today, 3), "yyyy-MM-dd"), format(addDays(today, 7), "yyyy-MM-dd")],
    staleTime: 30000,
  });

  // Helper function to find the previous day with scheduled tasks
  const findPreviousScheduledDay = (): Date => {
    for (let i = 1; i <= 7; i++) {
      const checkDate = subDays(today, i);
      const checkDateFormatted = format(checkDate, "yyyy-MM-dd");
      const hasTasks = (allTasks as any[]).some((task: any) => task.taskDate === checkDateFormatted);
      if (hasTasks) {
        return checkDate;
      }
    }
    return subDays(today, 1); // fallback to yesterday
  };

  // Helper function to find the next day with scheduled tasks
  const findNextScheduledDay = (): Date => {
    for (let i = 1; i <= 14; i++) {
      const checkDate = addDays(today, i);
      const checkDateFormatted = format(checkDate, "yyyy-MM-dd");
      const hasTasks = (allTasks as any[]).some((task: any) => task.taskDate === checkDateFormatted);
      if (hasTasks) {
        return checkDate;
      }
    }
    return addDays(today, 1); // fallback to tomorrow
  };

  const previousDay = findPreviousScheduledDay();
  const nextDay = findNextScheduledDay();

  const previousDayFormatted = format(previousDay, "yyyy-MM-dd");
  const nextDayFormatted = format(nextDay, "yyyy-MM-dd");

  const { data: todayTasks = [], isLoading: todayLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", todayFormatted, todayFormatted],
    staleTime: 30000,
  });

  const { data: previousDayTasks = [], isLoading: previousLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", previousDayFormatted, previousDayFormatted],
    staleTime: 30000,
    enabled: !!(allTasks as any[]).length,
  });

  const { data: nextDayTasks = [], isLoading: nextLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", nextDayFormatted, nextDayFormatted],
    staleTime: 30000,
    enabled: !!(allTasks as any[]).length,
  });

  // Fetch ALL assignments for accurate cost code calculations
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
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



  // State for selected day for assignments
  const [selectedDay, setSelectedDay] = useState<'yesterday' | 'today' | 'tomorrow'>('today');

  const getEmployeeStatus = (hours: number) => {
    if (hours > 8) return { 
      color: "bg-red-500", 
      text: "Overbooked", 
      textColor: "text-red-600",
      rowBg: "bg-red-50"
    };
    if (hours < 8) return { 
      color: "bg-yellow-500", 
      text: "Underbooked", 
      textColor: "text-yellow-600",
      rowBg: "bg-yellow-50"
    };
    return { 
      color: "bg-green-500", 
      text: "Optimal", 
      textColor: "text-green-600",
      rowBg: "bg-green-50"
    };
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

  const getEmployeeHours = (employeeId: number) => {
    // Use the filtered assignments for the selected date instead of all assignments
    return selectedDateData.filteredAssignments
      .filter((assignment: any) => assignment.employeeId === employeeId)
      .reduce((sum: number, assignment: any) => sum + (parseFloat(assignment.assignedHours) || 0), 0);
  };

  const getEmployee = (employeeId: number) => {
    return (employees as any[]).find((emp: any) => emp.id === employeeId);
  };

  const getCrew = (crewId: number) => {
    return (crews as any[]).find((crew: any) => crew.id === crewId);
  };

  const getTask = (taskId: number) => {
    return [...(todayTasks as any[]), ...(previousDayTasks as any[]), ...(nextDayTasks as any[])]
      .find((task: any) => task.id === taskId || task.taskId === taskId);
  };

  const getProject = (task: any) => {
    if (!task || !task.locationId) return null;
    const location = (locations as any[]).find((loc: any) => loc.locationId === task.locationId);
    if (!location) return null;
    // Fix: use array index lookup since projectId types don't match
    return (projects as any[])[location.projectId - 1];
  };

  const getLocation = (locationId: string | number) => {
    // Handle both string locationId and numeric database ID
    if (typeof locationId === 'number') {
      return (locations as any[]).find((location: any) => location.id === locationId);
    }
    return (locations as any[]).find((location: any) => location.locationId === locationId);
  };

  // Get assignments and tasks for the selected day
  const getSelectedDateData = () => {
    let selectedDate = '';
    let selectedTasks: any[] = [];
    let selectedDateFormatted = '';
    
    switch (selectedDay) {
      case 'yesterday':
        selectedDate = previousDayFormatted;
        selectedTasks = previousDayTasks as any[];
        selectedDateFormatted = format(previousDay, "EEEE, MMMM d, yyyy");
        break;
      case 'today':
        selectedDate = todayFormatted;
        selectedTasks = todayTasks as any[];
        selectedDateFormatted = format(today, "EEEE, MMMM d, yyyy");
        break;
      case 'tomorrow':
        selectedDate = nextDayFormatted;
        selectedTasks = nextDayTasks as any[];
        selectedDateFormatted = format(nextDay, "EEEE, MMMM d, yyyy");
        break;
    }
    
    // Get task IDs for the selected date
    const taskIds = selectedTasks.map((task: any) => task.id);
    
    // Filter assignments for tasks on the selected date
    const filteredAssignments = (assignments as any[]).filter((assignment: any) => 
      taskIds.includes(assignment.taskId)
    );
    
    return {
      selectedDate,
      selectedTasks,
      selectedDateFormatted,
      filteredAssignments
    };
  };

  const selectedDateData = getSelectedDateData();

  // Helper functions to get enhanced task information
  const getProjectName = (task: any) => {
    if (!task.locationId) return "Unknown Project";
    // After migration: task.locationId is now the database ID (integer), not the locationId string
    const location = (locations as any[]).find((loc: any) => loc.id === task.locationId);
    if (!location) return "Unknown Project";
    
    // Find project by matching the database ID
    const project = (projects as any[]).find((proj: any) => proj.id === location.projectId);
    return project?.name || "Unknown Project";
  };

  const getLocationName = (task: any) => {
    if (!task.locationId) return "Unknown Location";
    // After migration: task.locationId is now the database ID (integer), not the locationId string
    const location = (locations as any[]).find((loc: any) => loc.id === task.locationId);
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

  // Get budget data for specific location
  // Only fetch budget data for locations that have tasks in the selected time period
  // Fix: Use database IDs for proper filtering
  const locationDbIdsWithTasks = Array.from(new Set([
    ...(todayTasks as any[]).map((task: any) => task.locationId),
    ...(previousDayTasks as any[]).map((task: any) => task.locationId),
    ...(nextDayTasks as any[]).map((task: any) => task.locationId)
  ].filter(Boolean)));

  const { data: budgetDataByLocation = {} } = useQuery({
    queryKey: ["/api/budget", locationDbIdsWithTasks.join(',')],
    queryFn: async () => {
      // Only fetch budget data for locations that actually have tasks
      const relevantLocations = (locations as any[]).filter((location: any) => 
        locationDbIdsWithTasks.includes(location.id) // Fix: use database ID for matching
      );
      
      console.log('🔍 Dashboard budget fetch - relevant locations:', relevantLocations.map(l => l.locationId));
      
      if (relevantLocations.length === 0) return {};
      
      const budgetPromises = relevantLocations.map(async (location: any) => {
        try {
          console.log(`📊 Dashboard fetching budget for: ${location.locationId}`);
          const response = await fetch(`/api/locations/${location.locationId}/budget`);
          const budgetItems = await response.json();
          console.log(`✅ Dashboard budget loaded for ${location.locationId}:`, budgetItems.length, 'items');
          return { locationId: location.locationId, budgetItems };
        } catch (error) {
          console.warn(`Failed to fetch budget for location ${location.locationId}:`, error);
          return { locationId: location.locationId, budgetItems: [] };
        }
      });
      
      const results = await Promise.all(budgetPromises);
      const budgetData = results.reduce((acc: any, { locationId, budgetItems }) => {
        acc[locationId] = budgetItems;
        return acc;
      }, {});
      
      console.log('📋 Dashboard all budget data loaded:', Object.keys(budgetData));
      return budgetData;
    },
    enabled: (locations as any[]).length > 0 && 
             ((todayTasks as any[]).length > 0 || (previousDayTasks as any[]).length > 0 || (nextDayTasks as any[]).length > 0) &&
             !todayLoading && !previousLoading && !nextLoading,
    staleTime: 60000,
  });

  // Create a hook to get all tasks for dashboard locations (for actual hours calculation)
  const { data: allLocationTasks = {} } = useQuery({
    queryKey: ["/api/dashboard/location-tasks", Object.keys(budgetDataByLocation)],
    queryFn: async () => {
      const locationIds = Object.keys(budgetDataByLocation);
      if (locationIds.length === 0) return {};
      
      console.log('📋 Dashboard: Fetching all tasks for locations with budget data:', locationIds);
      
      const taskPromises = locationIds.map(async (locationId: string) => {
        try {
          const response = await fetch(`/api/locations/${locationId}/tasks`);
          const tasks = await response.json();
          console.log(`📋 Dashboard: Loaded ${tasks.length} tasks for ${locationId}`);
          return { locationId, tasks };
        } catch (error) {
          console.warn(`Failed to fetch tasks for location ${locationId}:`, error);
          return { locationId, tasks: [] };
        }
      });
      
      const results = await Promise.all(taskPromises);
      const allTasks = results.reduce((acc: any, { locationId, tasks }) => {
        acc[locationId] = tasks;
        return acc;
      }, {});
      
      console.log('📋 Dashboard: All location tasks loaded:', Object.keys(allTasks));
      return allTasks;
    },
    enabled: Object.keys(budgetDataByLocation).length > 0,
    staleTime: 300000, // 5 minutes - longer since this is more expensive
  });

  // Get all budget items for remaining hours calculation (same as Schedule page)
  const allBudgetItems = Object.values(budgetDataByLocation).flat();

  // Helper function to get remaining hours color based on percentage (copied from Schedule page)
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

  // This function is no longer used in Dashboard - keeping for compatibility with other components
  const calculateRemainingHours = (task: any, allTasks: any[], budgetItems: any[]) => {
    const costCode = task.costCode;
    if (!costCode) return { remainingHours: null, totalBudgetHours: 0 };

    // Filter budget items to only include the current task's location
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
      
      // Handle task cost codes the same way
      let relevantTaskCostCode = t.costCode;
      if (relevantTaskCostCode === 'DEMO/EX' || relevantTaskCostCode === 'Demo/Ex' || 
          relevantTaskCostCode === 'BASE/GRADING' || relevantTaskCostCode === 'Base/Grading' || 
          relevantTaskCostCode === 'Demo/Ex + Base/Grading' || relevantTaskCostCode === 'DEMO/EX + BASE/GRADING') {
        relevantTaskCostCode = 'Demo/Ex + Base/Grading';
      }
      
      let currentTaskCostCode = costCode;
      if (currentTaskCostCode === 'DEMO/EX' || currentTaskCostCode === 'Demo/Ex' || 
          currentTaskCostCode === 'BASE/GRADING' || currentTaskCostCode === 'Base/Grading' || 
          currentTaskCostCode === 'Demo/Ex + Base/Grading' || currentTaskCostCode === 'DEMO/EX + BASE/GRADING') {
        currentTaskCostCode = 'Demo/Ex + Base/Grading';
      }
      
      if (relevantTaskCostCode !== currentTaskCostCode) return false;
      
      const taskDate = new Date(t.taskDate + 'T00:00:00').getTime();
      return taskDate <= currentTaskDate;
    });

    // Calculate total used hours from these tasks (same logic as Schedule page)
    const usedHours = relevantTasks.reduce((total: number, t: any) => {
      const taskId = t.id || t.taskId;
      const taskAssignments = (assignments as any[]).filter((assignment: any) => 
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

  // Calculate cost code hours and status for location progress
  const getCostCodeStatus = (locationId: string) => {
    // Get budget data for this location
    const locationBudget = budgetDataByLocation[locationId] || [];
    const locationTasks = allLocationTasks[locationId] || [];
    
    // Find the location object to get its database ID
    const location = (locations as any[]).find((loc: any) => loc.locationId === locationId);
    if (!location) return {};
    
    // Calculate actual hours directly from assignments for this location
    // We'll group assignments by task, then by cost code to calculate totals
    
    console.log(`🔍 Dashboard getCostCodeStatus for ${locationId}:`, {
      locationDbId: location.id,
      assignmentsCount: (assignments as any[]).length,
      assignmentsWithActualHours: (assignments as any[]).filter(a => parseFloat(a.actualHours) > 0).length
    });
    
    // Initialize with budget data first
    const costCodeData: { [key: string]: { budgetHours: number; actualHours: number; scheduledHours: number } } = {};
    
    // Helper function to normalize cost codes for combining
    const normalizeCostCode = (costCode: string) => {
      const trimmed = costCode.trim().toUpperCase();
      // Combine DEMO/EX and BASE/GRADING into one category
      if (trimmed === 'DEMO/EX' || trimmed === 'BASE/GRADING' || 
          trimmed === 'DEMO/EX + BASE/GRADING' || 
          trimmed.includes('DEMO/EX') || trimmed.includes('BASE/GRADING')) {
        return 'DEMO/EX + BASE/GRADING';
      }
      // Normalize GNRL LBR to GENERAL LABOR
      if (trimmed === 'GNRL LBR' || trimmed === 'GENERAL LABOR' || trimmed === 'GENERAL') {
        return 'GENERAL LABOR';
      }
      // Normalize AC and ASPHALT to the same cost code
      if (trimmed === 'AC' || trimmed === 'ASPHALT') {
        return 'AC';
      }
      return trimmed; // Return uppercase normalized version
    };
    
    // Add budget hours from budget line items
    locationBudget.forEach((budgetItem: any) => {
      const costCode = budgetItem.costCode || budgetItem.code || budgetItem.category;
      const totalHours = budgetItem.hours || budgetItem.totalHours || budgetItem.quantity;
      
      if (costCode && costCode.trim()) {
        const normalizedCostCode = normalizeCostCode(costCode);
        const hours = parseFloat(totalHours) || 0;
        
        // If this cost code already exists, add to the hours
        if (costCodeData[normalizedCostCode]) {
          costCodeData[normalizedCostCode].budgetHours += hours;
        } else {
          costCodeData[normalizedCostCode] = {
            budgetHours: hours,
            actualHours: 0,
            scheduledHours: 0
          };
        }
      }
    });
    
    // Dashboard Implementation: Calculate actual hours from ALL assignments for this location
    // We'll use a different approach - find all assignments that have actual hours,
    // then group them by cost code for this location
    
    console.log(`📊 Dashboard: Calculating actual hours from ALL assignments for ${locationId}`);
    
    // First, collect all task IDs for this location from budget cost codes
    // We'll match assignments by task->cost code relationship
    const locationBudgetCostCodes = new Set<string>();
    locationBudget.forEach((budgetItem: any) => {
      const costCode = budgetItem.costCode || budgetItem.code || budgetItem.category;
      if (costCode && costCode.trim()) {
        const normalizedCostCode = normalizeCostCode(costCode);
        locationBudgetCostCodes.add(normalizedCostCode);
        locationBudgetCostCodes.add(costCode.trim().toUpperCase());
      }
    });
    
    console.log(`📊 Dashboard: Location ${locationId} has budget cost codes:`, Array.from(locationBudgetCostCodes));
    
    // Process ALL assignments to find actual hours for this location's cost codes
    // Use the comprehensive task data from the location-specific task fetch
    const taskToCostCodeMap: { [taskId: string]: string } = {};
    
    // First, use tasks from the comprehensive location task data
    locationTasks.forEach((task: any) => {
      if (task.costCode) {
        taskToCostCodeMap[task.id.toString()] = task.costCode;
      }
    });
    
    // Also add tasks from the current date range (allTasks)
    (allTasks as any[]).forEach((task: any) => {
      if (task.locationId === location.id && task.costCode) {
        taskToCostCodeMap[task.id.toString()] = task.costCode;
      }
    });
    
    console.log(`📊 Dashboard: Created task mapping with ${Object.keys(taskToCostCodeMap).length} tasks for ${locationId}`);
    
    // Also check ALL assignments for task IDs we haven't seen in allTasks
    // This handles the case where completed tasks are outside our date range
    (assignments as any[]).forEach((assignment: any) => {
      const taskId = assignment.taskId.toString();
      const actualHours = parseFloat(assignment.actualHours) || 0;
      const scheduledHours = parseFloat(assignment.assignedHours) || 0;
      
      if (actualHours > 0 || scheduledHours > 0) {
        // Check if this task belongs to our location
        let taskCostCode = taskToCostCodeMap[taskId];
        
        if (!taskCostCode) {
          // This task might be from outside our date range but belong to this location
          // We'll use a heuristic: if the assignment has significant actual hours
          // and we haven't matched it to another location yet, it might belong here
          
          // For now, skip these assignments as we can't definitively assign them
          return;
        }
        
        const normalizedCostCode = normalizeCostCode(taskCostCode);
        
        if (!costCodeData[normalizedCostCode]) {
          costCodeData[normalizedCostCode] = { budgetHours: 0, actualHours: 0, scheduledHours: 0 };
        }
        
        costCodeData[normalizedCostCode].actualHours += actualHours;
        
        // Only count scheduled hours for assignments that DON'T have actual hours yet
        // AND are from incomplete tasks - completed tasks should never contribute to scheduled hours
        const taskData = locationTasks.find((t: any) => t.id.toString() === taskId) || 
                        (allTasks as any[]).find((t: any) => t.id.toString() === taskId);
        const isTaskComplete = taskData && (taskData.status === 'complete' || taskData.status === 'completed' || taskData.status === 'Complete');
        
        if (actualHours === 0 && !isTaskComplete) {
          costCodeData[normalizedCostCode].scheduledHours += scheduledHours;
          
          // Debug: Log scheduled hours being added
          if (scheduledHours > 0) {
            console.log(`📊 Dashboard: Adding ${scheduledHours}h scheduled to ${normalizedCostCode} for ${locationId} (task ${taskId}, no actual hours, task incomplete)`);
          }
        } else {
          // Debug: Log when we skip scheduled hours
          if (scheduledHours > 0) {
            const reason = actualHours > 0 ? `has ${actualHours}h actual` : 'task completed';
            console.log(`📊 Dashboard: Skipping ${scheduledHours}h scheduled for ${normalizedCostCode} in ${locationId} (task ${taskId} ${reason})`);
          }
        }
      }
    });
    
    // For assignments without task mapping (completed tasks outside date range),
    // we can't easily determine location without fetching all tasks for each location.
    // This is a Dashboard limitation - for complete accuracy, click the location link.
    
    const assignmentsWithTaskMapping = (assignments as any[]).filter((assignment: any) => {
      const taskId = assignment.taskId.toString();
      return taskToCostCodeMap[taskId];
    }).length;
    
    console.log(`📊 Dashboard: Processed ${assignmentsWithTaskMapping} assignments with task mapping for ${locationId}`);
    
    // Show all cost codes that have either budget hours > 0 OR actual/scheduled hours > 0
    const filteredCostCodeData = Object.fromEntries(
      Object.entries(costCodeData).filter(([costCode, data]) => 
        data.budgetHours > 0 || data.actualHours > 0 || data.scheduledHours > 0
      )
    );
    
    console.log(`🔍 Dashboard final cost code data for ${locationId}:`, filteredCostCodeData);
    
    return filteredCostCodeData;
  };

  const getRemainingHoursStatus = (actualHours: number, budgetHours: number) => {
    if (budgetHours === 0) return { color: 'text-gray-500', status: 'No budget', bgColor: 'bg-gray-100' };
    
    const remainingHours = budgetHours - actualHours;
    const percentageRemaining = (remainingHours / budgetHours) * 100;
    
    if (remainingHours <= 0) {
      return {
        color: 'text-red-600',
        status: `${Math.abs(remainingHours).toFixed(1)}h over`,
        bgColor: 'bg-red-100'
      };
    } else if (percentageRemaining <= 15) {
      return {
        color: 'text-yellow-600', 
        status: `${remainingHours.toFixed(1)}h remaining`,
        bgColor: 'bg-yellow-100'
      };
    } else {
      return {
        color: 'text-green-600',
        status: `${remainingHours.toFixed(1)}h remaining`, 
        bgColor: 'bg-green-100'
      };
    }
  };

  // Enhanced task card component with foreman logic
  const renderTaskCard = (task: any, date: string, showAssignmentToggle: boolean) => {
    const taskAssignments = getTaskAssignments(task.id, date);
    const scheduledHours = getScheduledHours(task, date);
    const actualHours = getActualHours(task, date);
    const projectName = getProjectName(task);
    const locationName = getLocationName(task);
    
    // Use Dashboard's cost code data instead of calculateRemainingHours
    const location = getLocation(task.locationId);
    const locationId = location?.locationId || task.locationId;
    const costCodeStatus = getCostCodeStatus(locationId);
    let remainingHours = null;
    let totalBudgetHours = 0;
    
    console.log(`🔍 TASK CARD DEBUG: ${task.name}`, { 
      costCode: task.costCode, 
      locationId: locationId,
      costCodeStatus: !!costCodeStatus,
      hasData: !!costCodeStatus?.costCodeData 
    });
    
    if (task.costCode && costCodeStatus.costCodeData) {
      const normalizedCostCode = normalizeCostCode(task.costCode);
      const costData = costCodeStatus.costCodeData[normalizedCostCode];
      
      console.log(`🔍 Dashboard cost data lookup:`, {
        normalizedCostCode,
        costData,
        availableKeys: Object.keys(costCodeStatus.costCodeData)
      });
      
      if (costData && costData.budgetHours > 0) {
        totalBudgetHours = costData.budgetHours;
        const usedHours = costData.actualHours + costData.scheduledHours;
        remainingHours = Math.max(0, totalBudgetHours - usedHours);
        
        console.log(`✅ Dashboard calculated remaining hours: ${remainingHours} (${totalBudgetHours} budget - ${usedHours} used)`);
      }
    }
    
    const remainingHoursColor = remainingHours !== null ? getRemainingHoursColor(remainingHours, totalBudgetHours) : 'text-gray-600';

    return (
      <TaskCardWithForeman
        key={task.id}
        task={task}
        taskAssignments={taskAssignments}
        remainingHours={remainingHours}
        remainingHoursColor={remainingHoursColor}
        budgetHours={0} // Hide progress bars on Dashboard
        projectName={projectName}
        locationName={locationName}
        actualHours={actualHours}
        scheduledHours={scheduledHours}
        showAssignmentToggle={showAssignmentToggle}
        users={users as any[]}
        getEmployeeInfo={getEmployeeInfo}
        employees={employees as any[]}
        assignments={assignments as any[]}
      />
    );
  };

  const allLocationTasksLoading = Object.keys(budgetDataByLocation).length > 0 && Object.keys(allLocationTasks).length === 0;
  
  if (todayLoading || previousLoading || nextLoading || assignmentsLoading || allTasksLoading || allLocationTasksLoading) {
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
          </div>
        </div>
      </header>
      <main className="p-6 space-y-6">
        {/* Three-Day Schedule Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Previous Day Tasks */}
          <Card 
            className={`cursor-pointer transition-all ${selectedDay === 'yesterday' ? 'ring-2 ring-primary bg-primary/5' : 'hover:shadow-md'}`}
            onClick={() => setSelectedDay('yesterday')}
          >
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
                (previousDayTasks as any[]).map((task: any) => renderTaskCard(task, previousDayFormatted, selectedDay === 'yesterday'))
              )}
            </CardContent>
          </Card>

          {/* Today's Tasks */}
          <Card 
            className={`cursor-pointer transition-all ${selectedDay === 'today' ? 'ring-2 ring-primary bg-primary/5' : 'hover:shadow-md'}`}
            onClick={() => setSelectedDay('today')}
          >
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
                (todayTasks as any[]).map((task: any) => renderTaskCard(task, todayFormatted, selectedDay === 'today'))
              )}
            </CardContent>
          </Card>

          {/* Next Day Tasks */}
          <Card 
            className={`cursor-pointer transition-all ${selectedDay === 'tomorrow' ? 'ring-2 ring-primary bg-primary/5' : 'hover:shadow-md'}`}
            onClick={() => setSelectedDay('tomorrow')}
          >
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
                (nextDayTasks as any[]).map((task: any) => renderTaskCard(task, nextDayFormatted, selectedDay === 'tomorrow'))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Employee Assignments & Conflicts */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Employee Assignments</CardTitle>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedDateData.selectedDateFormatted}
                </p>
              </div>
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
          <CardContent>
            <div className="overflow-x-auto h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Crew</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>Assigned Hours</TableHead>
                    <TableHead>Daily Total Assigned</TableHead>
                    <TableHead>Schedule Status</TableHead>
                    <TableHead>Actual Hours</TableHead>
                    <TableHead>Under/Over</TableHead>
                    <TableHead>Actual Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedDateData.filteredAssignments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8 text-gray-500">
                        No employee assignments found for {selectedDateData.selectedDateFormatted}
                      </TableCell>
                    </TableRow>
                  ) : (
                    selectedDateData.filteredAssignments.map((assignment: any) => {
                      const employee = getEmployee(assignment.employeeId);
                      const crew = getCrew(employee?.crewId);
                      const task = getTask(assignment.taskId);
                      const project = getProject(task);
                      const location = getLocation(task?.locationId);
                      const totalHours = getEmployeeHours(assignment.employeeId);
                      const status = getEmployeeStatus(totalHours);
                      
                      return (
                        <TableRow
                          key={assignment.id}
                          className={`hover:bg-gray-50 ${status.rowBg}`}
                        >
                          <TableCell>
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                                <User className="text-gray-600 text-sm" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">{employee?.name || "Unknown"}</p>
                                <p className="text-sm text-gray-500">{employee?.teamMemberId || "N/A"}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={getEmployeeTypeVariant(employee?.employeeType || "")}>
                              {employee?.employeeType || "Unknown"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-gray-600">{crew?.name || "Unassigned"}</span>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-gray-800">{project?.name || "Unknown Project"}</p>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-gray-800">{location?.name || "Unknown Location"}</p>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-gray-800">{task?.name || "Unknown Task"}</p>
                              <p className="text-sm text-gray-500">{task?.costCode || "N/A"}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <Clock className="w-4 h-4 text-gray-500" />
                              <span className="font-medium">{assignment.assignedHours}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={`font-medium ${status.textColor}`}>
                              {totalHours.toFixed(1)}h
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <div className={`w-3 h-3 ${status.color} rounded-full`}></div>
                              <span className={`text-sm ${status.textColor} font-medium`}>
                                {status.text}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {assignment.actualHours ? (
                              <div className="flex items-center space-x-2">
                                {parseFloat(assignment.actualHours) <= parseFloat(assignment.assignedHours) ? (
                                  <CheckCircle className="w-4 h-4 text-green-500" />
                                ) : (
                                  <X className="w-4 h-4 text-red-500" />
                                )}
                                <span className="font-medium">{assignment.actualHours}</span>
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {assignment.actualHours ? (
                              <span className={`font-medium ${
                                (parseFloat(assignment.actualHours) - parseFloat(assignment.assignedHours)) > 0 ? 'text-red-600' : 
                                (parseFloat(assignment.actualHours) - parseFloat(assignment.assignedHours)) < 0 ? 'text-green-600' : 
                                'text-gray-600'
                              }`}>
                                {(parseFloat(assignment.actualHours) - parseFloat(assignment.assignedHours)) > 0 ? '+' : ''}
                                {(parseFloat(assignment.actualHours) - parseFloat(assignment.assignedHours)).toFixed(1)}h
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {assignment.actualHours ? (
                              <div className="flex items-center space-x-2">
                                {(() => {
                                  const actualHours = parseFloat(assignment.actualHours);
                                  const assignedHours = parseFloat(assignment.assignedHours);
                                  let actualStatus = "";
                                  let icon = null;
                                  let textColor = "";
                                  
                                  if (actualHours === assignedHours) {
                                    actualStatus = "On schedule";
                                    icon = <CheckCircle className="w-4 h-4 text-green-500" />;
                                    textColor = "text-green-600";
                                  } else if (actualHours > assignedHours) {
                                    actualStatus = "Over schedule";
                                    icon = <X className="w-4 h-4 text-red-500" />;
                                    textColor = "text-red-600";
                                  } else {
                                    actualStatus = "Under schedule";
                                    icon = <AlertTriangle className="w-4 h-4 text-yellow-500" />;
                                    textColor = "text-yellow-600";
                                  }
                                  
                                  return (
                                    <>
                                      {icon}
                                      <span className={`text-sm font-medium ${textColor}`}>
                                        {actualStatus}
                                      </span>
                                    </>
                                  );
                                })()}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
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
              {(locations as any[])
                .filter((location: any) => {
                  // Only show locations that have tasks scheduled on the selected day
                  const selectedTasks = selectedDateData.selectedTasks;
                  // After migration: tasks use location.id (database ID) instead of location.locationId (string)
                  return selectedTasks.some((task: any) => task.locationId === location.id);
                })
                .map((location: any) => {
                // Find project by matching the database ID
                const project = (projects as any[]).find((proj: any) => proj.id === location.projectId);
                // Calculate progress based on ALL completed tasks vs total tasks for this location
                // Use comprehensive location task data instead of limited date range tasks
                const locationTasksList = allLocationTasks[location.locationId] || [];
                const completedTasks = locationTasksList.filter((task: any) => 
                  task.status === 'complete' || task.status === 'Completed' || task.status === 'completed'
                ).length;
                const totalTasks = locationTasksList.length;
                const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                
                // Get cost code status for this location
                const costCodeData = getCostCodeStatus(location.locationId);
                
                return (
                  <div key={location.locationId} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-medium text-gray-800">
                        {project?.name} - <Link
                          to={`/locations/${location.locationId}`}
                          className="hover:text-primary underline cursor-pointer"
                        >
                          {location.name}
                        </Link>
                      </div>
                      <span className="text-sm text-gray-600">
                        {progressPercentage}% Complete ({completedTasks}/{totalTasks} tasks)
                      </span>
                    </div>
                    <Progress value={progressPercentage} className="mb-3" />
                    
                    {/* Cost Code Progress Bars */}
                    {Object.keys(costCodeData).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-sm font-medium text-gray-700">Cost Code Progress</h5>
                          <span className="text-xs text-gray-500 italic">Click location for full actual hours</span>
                        </div>
                        <div className="space-y-3">
                          {Object.entries(costCodeData)
                            .filter(([_, data]) => data.budgetHours > 0 || data.actualHours > 0 || data.scheduledHours > 0)
                            .sort(([_, a], [__, b]) => b.budgetHours - a.budgetHours) // Sort by budget hours descending
                            .map(([costCode, data]) => {
                              const remainingHours = Math.max(0, data.budgetHours - data.actualHours);
                              const overageHours = Math.max(0, data.actualHours - data.budgetHours);
                              const totalHours = data.actualHours + data.scheduledHours;
                              const totalOverageHours = Math.max(0, totalHours - data.budgetHours);
                              
                              // Calculate percentages based on the maximum of budget or total hours for proper scaling
                              const maxHours = Math.max(data.budgetHours, totalHours);
                              const actualPercentage = maxHours > 0 ? (data.actualHours / maxHours) * 100 : 0;
                              const scheduledPercentage = maxHours > 0 ? (data.scheduledHours / maxHours) * 100 : 0;
                              const budgetPercentage = maxHours > 0 ? (data.budgetHours / maxHours) * 100 : 100;
                              
                              // Color coding based on remaining hours percentage
                              let progressColor = 'bg-green-500'; // Default green for actual hours
                              if (data.budgetHours > 0) {
                                const remainingPercentage = (remainingHours / data.budgetHours) * 100;
                                if (remainingPercentage <= 0) {
                                  progressColor = 'bg-red-500'; // Red if over budget
                                } else if (remainingPercentage <= 15) {
                                  progressColor = 'bg-yellow-500'; // Yellow if 15% or less remaining
                                }
                              }
                              
                              return (
                                <div key={costCode} className="space-y-1">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-medium text-gray-700">{costCode}</span>
                                    <span className="text-gray-600">
                                      {data.actualHours.toFixed(1)}h / {data.budgetHours.toFixed(1)}h
                                      {data.scheduledHours > 0 && (
                                        <span className="text-blue-600 ml-1">
                                          (+{data.scheduledHours.toFixed(1)}h scheduled)
                                        </span>
                                      )}
                                      {totalOverageHours > 0 && (
                                        <span className="text-red-600 ml-1">
                                          (+{totalOverageHours.toFixed(1)}h over)
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2 relative">
                                    {/* Progress bar showing actual hours in green/yellow/red */}
                                    <div 
                                      className={`h-2 rounded-full transition-all duration-300 ${progressColor}`}
                                      style={{ width: `${actualPercentage}%` }}
                                    />
                                    {/* Additional blue section for scheduled hours */}
                                    {data.scheduledHours > 0 && (
                                      <div 
                                        className="absolute top-0 h-2 bg-blue-400 rounded-full transition-all duration-300 opacity-70"
                                        style={{ 
                                          left: `${actualPercentage}%`,
                                          width: `${scheduledPercentage}%` 
                                        }}
                                      />
                                    )}
                                    {/* Budget marker line - shows where budget limit is within the total scale */}
                                    {data.budgetHours > 0 && budgetPercentage < 100 && (
                                      <div 
                                        className="absolute top-0 w-0.5 h-2 bg-gray-800 opacity-80"
                                        style={{ left: `${budgetPercentage}%` }}
                                        title={`Budget limit: ${data.budgetHours.toFixed(1)}h`}
                                      />
                                    )}
                                  </div>
                                  {remainingHours > 0 && (
                                    <div className="text-xs text-gray-500">
                                      {remainingHours.toFixed(1)}h remaining
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex justify-between text-sm text-gray-600 mt-2">
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
            <CardTitle>Quick Actions-- (in development)
</CardTitle>
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
