import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MapPin, Calendar, User, DollarSign, CheckCircle, Clock, AlertCircle, X, ChevronDown, ChevronRight, Home, Building2, Plus, Edit, Trash2 } from "lucide-react";
import { format, addDays } from "date-fns";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import EditTaskModal from "./EditTaskModal";
import CreateTaskModal from "./CreateTaskModal";
import DraggableTaskList from "./DraggableTaskList";
import TaskDetailModal from "./TaskDetailModal";
import EnhancedAssignmentModal from "./EnhancedAssignmentModal";
import { calculateRemainingHours, getRemainingHoursIndicator } from "@/lib/remainingHours";

interface LocationDetailsProps {
  locationId: string;
}

export default function LocationDetails({ locationId }: LocationDetailsProps) {
  // Safe date formatting helper
  const safeFormatDate = (date: Date | string | number, formatStr: string = 'yyyy-MM-dd'): string => {
    try {
      let dateObj: Date;
      if (typeof date === 'string') {
        // Fix timezone offset by adding time component for date strings
        dateObj = date.includes('T') ? new Date(date) : new Date(date + 'T00:00:00');
      } else if (typeof date === 'number') {
        dateObj = new Date(date);
      } else {
        dateObj = date;
      }
      
      if (!dateObj || isNaN(dateObj.getTime())) {
        console.warn('Invalid date provided to safeFormatDate:', date);
        return '2025-07-16';
      }
      return format(dateObj, formatStr);
    } catch (error) {
      console.error('Error formatting date:', date, error);
      return '2025-07-16';
    }
  };

  const [selectedCostCode, setSelectedCostCode] = useState<string | null>(null);
  const [showCostCodeDialog, setShowCostCodeDialog] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [locationPath, setLocationPath] = useLocation();
  const [showGenerateTasksDialog, setShowGenerateTasksDialog] = useState(false);
  const [startDate, setStartDate] = useState(() => safeFormatDate(new Date()));
  const [combineFormPour, setCombineFormPour] = useState(false);
  const [combineDemoBase, setCombineDemoBase] = useState(false);
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState(false);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<any>(null);
  const [taskDetailModalOpen, setTaskDetailModalOpen] = useState(false);
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState<any>(null);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedTaskForAssignment, setSelectedTaskForAssignment] = useState<any>(null);
  const { toast } = useToast();

  // Task edit and delete functions
  const handleEditTask = (task: any) => {
    setEditingTask(task);
    setIsEditTaskModalOpen(true);
  };

  const handleDeleteTaskClick = (task: any) => {
    setTaskToDelete(task);
    setDeleteConfirmOpen(true);
  };

  const handleAssignTaskClick = (task: any) => {
    setSelectedTaskForAssignment(task);
    setAssignmentModalOpen(true);
  };

  const handleDeleteTask = async (taskToDelete: any) => {
    try {
      const response = await fetch(`/api/tasks/${taskToDelete.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Handle multi-day task renumbering logic
        const taskName = taskToDelete.name;
        const dayMatch = taskName.match(/Day (\d+)/i);
        
        if (dayMatch) {
          const deletedDayNumber = parseInt(dayMatch[1]);
          const taskType = taskToDelete.taskType;
          const costCode = taskToDelete.costCode;
          
          // Find all related tasks of the same type and cost code
          const relatedTasks = tasks.filter((t: any) => 
            t.taskType === taskType && 
            t.costCode === costCode && 
            t.locationId === taskToDelete.locationId &&
            t.id !== taskToDelete.id
          );
          
          // Find tasks that need renumbering (day numbers greater than deleted day)
          const tasksToUpdate = relatedTasks.filter((t: any) => {
            const match = t.name.match(/Day (\d+)/i);
            return match && parseInt(match[1]) > deletedDayNumber;
          });
          
          // Calculate new total count
          const newTotalDays = relatedTasks.length; // After deletion
          
          // Update task names for renumbering
          for (const task of tasksToUpdate) {
            const currentDayMatch = task.name.match(/Day (\d+)/i);
            if (currentDayMatch) {
              const currentDay = parseInt(currentDayMatch[1]);
              const newDay = currentDay - 1;
              const newName = task.name.replace(/Day \d+/i, `Day ${newDay}`);
              
              await fetch(`/api/tasks/${task.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ...task,
                  name: newName
                })
              });
            }
          }
        }

        await queryClient.invalidateQueries({ queryKey: ["/api/locations", location?.locationId || locationId, "tasks"] });
        toast({
          title: "Task deleted",
          description: "Task has been removed and related tasks updated successfully",
        });
      } else {
        throw new Error('Failed to delete task');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete task",
        variant: "destructive"
      });
    }
  };

  // Helper function to determine task status
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

  // Helper function to format task name with day info
  const getTaskDisplayInfo = (task: any) => {
    const dayMatch = task.name.match(/Day (\d+)/i);
    if (dayMatch) {
      const currentDay = parseInt(dayMatch[1]);
      
      // Count total days for this task type and cost code
      const relatedTasks = tasks.filter((t: any) => 
        t.taskType === task.taskType && 
        t.costCode === task.costCode && 
        t.locationId === task.locationId
      );
      
      const totalDays = relatedTasks.length;
      return {
        displayName: task.name.replace(/Day \d+/i, `Day ${currentDay} of ${totalDays}`),
        isMultiDay: true,
        currentDay,
        totalDays
      };
    }
    
    return {
      displayName: task.name,
      isMultiDay: false,
      currentDay: null,
      totalDays: null
    };
  };

  const { data: location, isLoading: locationLoading } = useQuery({
    queryKey: ["/api/locations", locationId],
    staleTime: 30000,
  });

  // Fetch project details for breadcrumb navigation
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["/api/projects", location?.projectId],
    enabled: !!location?.projectId,
    staleTime: 30000,
  });

  const { data: budgetItems = [], isLoading: budgetLoading } = useQuery({
    queryKey: ["/api/locations", locationId, "budget"],
    enabled: !!locationId,
    staleTime: 30000,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["/api/locations", location?.locationId || locationId, "tasks"],
    enabled: !!(location?.locationId || locationId),
    staleTime: 30000,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["/api/assignments"],
    staleTime: 30000,
  });

  if (locationLoading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <Skeleton className="h-8 w-64" />
        </header>
        <main className="p-6">
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  if (!location) {
    return (
      <div className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/locations">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Locations
              </Button>
            </Link>
            <h2 className="text-2xl font-bold text-gray-800">Location Not Found</h2>
          </div>
        </header>
        <main className="p-6">
          <p className="text-gray-600">The requested location could not be found.</p>
        </main>
      </div>
    );
  }

  // Calculate budget totals in hours
  const totalBudgetHours = budgetItems.reduce((sum: number, item: any) => {
    if (!item) return sum;
    
    // Only include items that are either:
    // 1. Parent items (have children)
    // 2. Standalone items (no children and not a child)
    // Skip child items to avoid double counting
    const isParent = item.lineItemNumber && !item.lineItemNumber.includes('.');
    const isChild = item.lineItemNumber && item.lineItemNumber.includes('.');
    const hasChildren = budgetItems.some((child: any) => 
      child.lineItemNumber && child.lineItemNumber.includes('.') && 
      child.lineItemNumber.split('.')[0] === item.lineItemNumber
    );
    
    // Include if it's a parent OR if it's a standalone item (not a child and has no children)
    if (isParent || (!isChild && !hasChildren)) {
      return sum + (parseFloat(item.hours) || 0);
    }
    
    return sum;
  }, 0);
  
  // Calculate actual hours from assignments by cost code
  const actualHoursByCostCode = (tasks as any[]).reduce((acc: any, task: any) => {
    let taskCostCode = task.costCode || 'UNCATEGORIZED';
    
    // Combine Demo/Ex and Base/grading related cost codes
    if (taskCostCode === 'DEMO/EX' || taskCostCode === 'Demo/Ex' || 
        taskCostCode === 'BASE/GRADING' || taskCostCode === 'Base/Grading' || 
        taskCostCode === 'Demo/Ex + Base/Grading' || taskCostCode === 'DEMO/EX + BASE/GRADING') {
      taskCostCode = 'Demo/ex + Base/grading';
    }
    
    // Find assignments for this task and sum actual hours
    const taskAssignments = (assignments as any[]).filter((assignment: any) => 
      assignment.taskId === task.id
    );
    
    const taskActualHours = taskAssignments.reduce((sum: number, assignment: any) => {
      return sum + (parseFloat(assignment.actualHours) || 0);
    }, 0);
    
    acc[taskCostCode] = (acc[taskCostCode] || 0) + taskActualHours;
    return acc;
  }, {});

  // Calculate cost code summaries by hours
  const costCodeSummaries = (budgetItems as any[]).reduce((acc: any, item: any) => {
    let costCode = item.costCode || 'UNCATEGORIZED';
    
    // Combine Demo/Ex and Base/grading related cost codes
    if (costCode === 'DEMO/EX' || costCode === 'Demo/Ex' || 
        costCode === 'BASE/GRADING' || costCode === 'Base/Grading' || 
        costCode === 'Demo/Ex + Base/Grading' || costCode === 'DEMO/EX + BASE/GRADING') {
      costCode = 'Demo/ex + Base/grading';
    }
    
    if (!acc[costCode]) {
      acc[costCode] = {
        costCode,
        totalBudgetHours: 0,
        totalActualHours: 0,
        totalConvertedQty: 0,
        convertedUnitOfMeasure: '',
        items: [],
        itemCount: 0,
        originalCostCodes: new Set() // Track original cost codes for combined entries
      };
    }
    
    // Track original cost codes for combined entries
    if (costCode === 'Demo/ex + Base/grading') {
      acc[costCode].originalCostCodes.add(item.costCode || 'UNCATEGORIZED');
    }
    
    // Only include items that are either:
    // 1. Parent items (have children)
    // 2. Standalone items (no children and not a child)
    // Skip child items to avoid double counting
    const isParent = item.lineItemNumber && !item.lineItemNumber.includes('.');
    const isChild = item.lineItemNumber && item.lineItemNumber.includes('.');
    const hasChildren = (budgetItems as any[]).some((child: any) => 
      child.lineItemNumber && child.lineItemNumber.includes('.') && 
      child.lineItemNumber.split('.')[0] === item.lineItemNumber
    );
    
    // Include if it's a parent OR if it's a standalone item (not a child and has no children)
    if (isParent || (!isChild && !hasChildren)) {
      acc[costCode].totalBudgetHours += parseFloat(item.hours) || 0;
      acc[costCode].totalConvertedQty += parseFloat(item.convertedQty) || 0;
      // Use the unit of measure from the first item, assuming they're consistent within cost code
      if (!acc[costCode].convertedUnitOfMeasure && item.convertedUnitOfMeasure) {
        acc[costCode].convertedUnitOfMeasure = item.convertedUnitOfMeasure;
      }
    }
    
    acc[costCode].items.push(item);
    acc[costCode].itemCount++;
    return acc;
  }, {});

  // Apply actual hours from assignments to cost code summaries
  Object.keys(costCodeSummaries).forEach(costCode => {
    costCodeSummaries[costCode].totalActualHours = actualHoursByCostCode[costCode] || 0;
  });

  // Calculate total actual hours from all assignments
  const totalActualHours = Object.values(actualHoursByCostCode).reduce((sum: number, hours: any) => {
    return sum + (parseFloat(hours) || 0);
  }, 0);

  const remainingHours = totalBudgetHours - totalActualHours;

  // Calculate progress
  const completedTasks = tasks.filter((task: any) => task.actualHours).length;
  const progressPercentage = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;

  // Helper function to get user-friendly cost code display names
  const getCostCodeDisplayName = (costCode: string) => {
    const mappings: { [key: string]: string } = {
      'AC': 'Asphalt',
      'GNRL LBR': 'General Labor',
      'TRAFFIC CONTROL': 'Traffic Control',
      'CONCRETE': 'Concrete',
      'SUB': 'Subcontractor',
      'LANDSCAPING': 'Landscaping',
      'UTILITY ADJ': 'Utility Adjustment',
    };
    return mappings[costCode] || costCode;
  };

  // Filter to show cost codes that have budget hours (this ensures all cost codes including Traffic Control appear)
  const costCodeArray = Object.values(costCodeSummaries).filter((summary: any) => 
    summary.totalBudgetHours > 0
  );

  // Calculate actual location duration based on task dates
  const getLocationDuration = () => {
    if (!tasks || tasks.length === 0) {
      return {
        startDate: location.startDate ? safeFormatDate(location.startDate, 'MMM d, yyyy') : 'No tasks scheduled',
        endDate: location.endDate ? safeFormatDate(location.endDate, 'MMM d, yyyy') : 'No tasks scheduled'
      };
    }

    // Get all task dates and find earliest and latest
    const taskDates = tasks.map((task: any) => new Date(task.taskDate + 'T00:00:00').getTime());
    const earliestTaskDate = new Date(Math.min(...taskDates));
    const latestTaskDate = new Date(Math.max(...taskDates));

    return {
      startDate: safeFormatDate(earliestTaskDate, 'MMM d, yyyy'),
      endDate: safeFormatDate(latestTaskDate, 'MMM d, yyyy')
    };
  };

  const locationDuration = getLocationDuration();

  // Handle cost code card click
  const handleCostCodeClick = (costCode: string) => {
    setSelectedCostCode(costCode);
    setShowCostCodeDialog(true);
  };

  // Get items for selected cost code
  const selectedCostCodeItems = selectedCostCode ? costCodeSummaries[selectedCostCode]?.items || [] : [];

  // Helper functions for collapsible functionality
  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const hasChildren = (itemLineNumber: string) => {
    return selectedCostCodeItems.some((item: any) => 
      item.lineItemNumber && item.lineItemNumber.startsWith(itemLineNumber + ".")
    );
  };

  const getChildren = (parentLineNumber: string) => {
    return selectedCostCodeItems.filter((item: any) => 
      item.lineItemNumber && 
      item.lineItemNumber.startsWith(parentLineNumber + ".") &&
      item.lineItemNumber !== parentLineNumber
    );
  };

  const getParentItems = () => {
    return selectedCostCodeItems.filter((item: any) => {
      if (!item.lineItemNumber) return true;
      // Check if this is a parent by seeing if any other items start with this number + "."
      const hasChildrenItems = selectedCostCodeItems.some((other: any) => 
        other.lineItemNumber && 
        other.lineItemNumber.startsWith(item.lineItemNumber + ".") &&
        other.lineItemNumber !== item.lineItemNumber
      );
      // If it has children, it's a parent. If not, check if it's a child of another item
      if (hasChildrenItems) return true;
      
      // Check if this item is a child (contains a decimal point and there's a parent)
      const parts = item.lineItemNumber.split(".");
      if (parts.length > 1) {
        const potentialParent = parts[0];
        const parentExists = selectedCostCodeItems.some((parent: any) => 
          parent.lineItemNumber === potentialParent
        );
        return !parentExists; // Only show as parent if the actual parent doesn't exist
      }
      return true; // Show standalone items
    });
  };

  // Task generation logic
  const taskTypeOrder = [
    'Traffic Control',
    'Demo/Ex + Base/Grading',
    'Demo/Ex', 
    'Base/Grading',
    'Form + Pour',
    'Form',
    'Pour', 
    'Asphalt',
    'General Labor',
    'Landscaping',
    'Utility Adjustment',
    'Punchlist Demo',
    'Punchlist Concrete',
    'Punchlist General Labor'
  ];

  // Helper function to get correct cost code for tasks
  const getTaskCostCode = (taskType: string, group: any) => {
    // Demo/Ex, Base/Grading, and Demo/Ex + Base/Grading tasks should all use "Demo/Ex + Base/Grading"
    if (taskType === 'Demo/Ex' || taskType === 'Base/Grading' || taskType === 'Demo/Ex + Base/Grading') {
      return 'Demo/Ex + Base/Grading';
    }
    return group.costCodes[0].costCode;
  };

  // Helper function to get cost code date range based on actual tasks
  const getCostCodeDateRangeFromTasks = (costCode: string, existingTasks: any[]) => {
    // Find all tasks with this cost code
    const costCodeTasks = existingTasks.filter(task => {
      if (costCode === 'Demo/Ex + Base/Grading') {
        return task.costCode === 'Demo/Ex + Base/Grading' || 
               task.costCode === 'DEMO/EX' || 
               task.costCode === 'BASE/GRADING';
      }
      return task.costCode === costCode;
    });

    if (costCodeTasks.length === 0) {
      return { startDate: null, finishDate: null };
    }

    // Get the earliest and latest task dates for this cost code
    const taskDates = costCodeTasks.map(task => new Date(task.taskDate + 'T00:00:00'));
    const earliestDate = new Date(Math.min(...taskDates));
    const latestDate = new Date(Math.max(...taskDates));

    return {
      startDate: safeFormatDate(earliestDate),
      finishDate: safeFormatDate(latestDate)
    };
  };

  // Helper function to get cost code date range based on task type order (for new task creation)
  const getCostCodeDateRange = (costCode: string, taskType: string, allWorkDays: Date[]) => {
    // Calculate date ranges based on task type order and scheduling
    const taskTypeIndex = taskTypeOrder.indexOf(taskType);
    
    if (taskTypeIndex === -1) {
      // If task type not found in order, use full range
      return { 
        startDate: safeFormatDate(allWorkDays[0]), 
        finishDate: safeFormatDate(allWorkDays[allWorkDays.length - 1]) 
      };
    }

    // Calculate rough start position based on task type order
    const totalOrderedTypes = taskTypeOrder.length;
    const progressPercentage = taskTypeIndex / totalOrderedTypes;
    
    // For Demo/Ex + Base/Grading, start from beginning
    if (costCode === 'Demo/Ex + Base/Grading') {
      const endIndex = Math.max(0, Math.floor(allWorkDays.length * 0.3) - 1);
      return {
        startDate: safeFormatDate(allWorkDays[0]),
        finishDate: safeFormatDate(allWorkDays[endIndex])
      };
    }
    
    // For Concrete (Form/Pour), typically middle of project
    if (costCode === 'CONCRETE') {
      const startIndex = Math.floor(allWorkDays.length * 0.2);
      const endIndex = Math.max(startIndex, Math.floor(allWorkDays.length * 0.8) - 1);
      return {
        startDate: safeFormatDate(allWorkDays[startIndex]),
        finishDate: safeFormatDate(allWorkDays[endIndex])
      };
    }
    
    // For Asphalt, typically near end
    if (costCode === 'AC' || costCode === 'ASPHALT') {
      const startIndex = Math.floor(allWorkDays.length * 0.7);
      return {
        startDate: safeFormatDate(allWorkDays[startIndex]),
        finishDate: safeFormatDate(allWorkDays[allWorkDays.length - 1])
      };
    }
    
    // For other cost codes, calculate based on position
    const startIndex = Math.floor(allWorkDays.length * progressPercentage);
    const endIndex = Math.max(startIndex, startIndex + Math.ceil(allWorkDays.length * 0.3) - 1);
    
    return {
      startDate: safeFormatDate(allWorkDays[startIndex]),
      finishDate: safeFormatDate(allWorkDays[endIndex])
    };
  };

  // Helper function to skip weekends
  const addWorkdays = (startDate: Date, totalDays: number): Date[] => {
    const dates: Date[] = [];
    const current = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    
    console.log('addWorkdays - startDate:', startDate, 'totalDays:', totalDays);
    console.log('Starting from date:', current, 'Day of week:', current.getDay());
    
    while (dates.length < totalDays) {
      const dayOfWeek = current.getDay();
      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        dates.push(new Date(current.getFullYear(), current.getMonth(), current.getDate()));
        console.log('Added workday:', safeFormatDate(new Date(current)), 'Day of week:', dayOfWeek);
      }
      current.setDate(current.getDate() + 1);
    }
    
    console.log('Final generated workdays:', dates.map(d => safeFormatDate(d)));
    return dates;
  };

  const generateTasks = async () => {
    if (isGeneratingTasks) {
      return; // Prevent double submission
    }
    
    setIsGeneratingTasks(true);
    try {
      // Get cost codes with budget hours > 0 (includes Traffic Control and General Labor)
      const validCostCodes = costCodeArray.filter(summary => summary.totalBudgetHours > 0);
      
      if (validCostCodes.length === 0) {
        toast({
          title: "No valid cost codes",
          description: "No cost codes found with budget hours greater than 0",
          variant: "destructive"
        });
        return;
      }

      console.log('Start date input:', startDate);
      // Parse start date properly to avoid timezone shifts that cause off-by-one errors
      const parsedDate = new Date(startDate + 'T00:00:00');
      console.log('Parsed start date:', parsedDate, 'Day of week:', parsedDate.getDay());
      console.log('Expected start date should be:', startDate);
      const tasksToCreate = [];

      // Group cost codes by task type and calculate days needed
      const taskGroups: { [key: string]: { costCodes: any[], totalHours: number, days: number } } = {};

      validCostCodes.forEach(summary => {
        // Map cost code to task type (simplified mapping)
        let taskType = summary.costCode;
        
        // Enhanced mapping based on cost code naming convention
        const codeUpper = summary.costCode.toUpperCase();
        
        if (codeUpper.includes('DEMO') || codeUpper.includes('DEMOLITION') || codeUpper.includes('EX')) {
          taskType = 'Demo/Ex';
        } else if (codeUpper.includes('TRAFFIC')) {
          taskType = 'Traffic Control';
        } else if (codeUpper.includes('BASE') || codeUpper.includes('GRADE') || codeUpper.includes('GRADING')) {
          taskType = 'Base/Grading';
        } else if (codeUpper === 'AC' || codeUpper.includes('ASPHALT')) {
          taskType = 'Asphalt';
        } else if (codeUpper.includes('CONCRETE') || codeUpper.includes('CONC')) {
          // For concrete cost codes, determine if Form or Pour based on context
          if (codeUpper.includes('FORM')) {
            taskType = 'Form';
          } else {
            taskType = 'Pour'; // Default concrete work to Pour
          }
        } else if (codeUpper.includes('FORM')) {
          taskType = 'Form';
        } else if (codeUpper.includes('LANDSCAPE')) {
          taskType = 'Landscaping';
        } else if (codeUpper.includes('UTILITY')) {
          taskType = 'Utility Adjustment';
        } else if (codeUpper.includes('PUNCHLIST')) {
          if (codeUpper.includes('DEMO')) {
            taskType = 'Punchlist Demo';
          } else if (codeUpper.includes('CONCRETE')) {
            taskType = 'Punchlist Concrete';
          } else {
            taskType = 'Punchlist General Labor';
          }
        } else {
          taskType = 'General Labor';
        }

        if (!taskGroups[taskType]) {
          taskGroups[taskType] = { costCodes: [], totalHours: 0, days: 0 };
        }
        
        taskGroups[taskType].costCodes.push(summary);
        taskGroups[taskType].totalHours += summary.totalBudgetHours;
      });

      // Calculate days for each task type (total hours / 40)
      Object.keys(taskGroups).forEach(taskType => {
        taskGroups[taskType].days = Math.max(1, Math.ceil(taskGroups[taskType].totalHours / 40));
      });

      // Handle combining options
      if (combineDemoBase && taskGroups['Demo/Ex'] && taskGroups['Base/Grading']) {
        const combinedHours = taskGroups['Demo/Ex'].totalHours + taskGroups['Base/Grading'].totalHours;
        const combinedCostCodes = [...taskGroups['Demo/Ex'].costCodes, ...taskGroups['Base/Grading'].costCodes];
        taskGroups['Demo/Ex + Base/Grading'] = {
          costCodes: combinedCostCodes,
          totalHours: combinedHours,
          days: Math.max(1, Math.ceil(combinedHours / 40))
        };
        delete taskGroups['Demo/Ex'];
        delete taskGroups['Base/Grading'];
      }

      console.log('Task groups before combining:', Object.keys(taskGroups));
      console.log('combineFormPour:', combineFormPour);
      console.log('Has Form:', !!taskGroups['Form']);
      console.log('Has Pour:', !!taskGroups['Pour']);

      // Handle Form + Pour logic for concrete work
      if (taskGroups['Form'] || taskGroups['Pour']) {
        // If we have concrete work, treat it as Form/Pour alternating
        const concreteHours = (taskGroups['Form']?.totalHours || 0) + (taskGroups['Pour']?.totalHours || 0);
        const concreteCostCodes = [...(taskGroups['Form']?.costCodes || []), ...(taskGroups['Pour']?.costCodes || [])];
        
        if (combineFormPour) {
          console.log('Combining Form + Pour');
          taskGroups['Form + Pour'] = {
            costCodes: concreteCostCodes,
            totalHours: concreteHours,
            days: Math.max(1, Math.ceil(concreteHours / 40))
          };
          delete taskGroups['Form'];
          delete taskGroups['Pour'];
        } else {
          console.log('Alternating Form and Pour');
          // Create alternating Form/Pour tasks
          const totalDays = Math.max(1, Math.ceil(concreteHours / 40));
          
          // Clear existing Form/Pour groups
          delete taskGroups['Form'];
          delete taskGroups['Pour'];
          
          // Create Form and Pour groups with proper alternating structure
          // For odd number of days, extra day goes to Pour
          const formDays = Math.floor(totalDays / 2);
          const pourDays = Math.ceil(totalDays / 2);
          
          if (formDays > 0) {
            taskGroups['Form'] = {
              costCodes: concreteCostCodes,
              totalHours: concreteHours / 2,
              days: formDays,
              alternatingWith: 'Pour'
            };
          }
          
          if (pourDays > 0) {
            taskGroups['Pour'] = {
              costCodes: concreteCostCodes,
              totalHours: concreteHours / 2,
              days: pourDays,
              alternatingWith: 'Form'
            };
          }
        }
      }

      // Calculate total days needed for all tasks
      const totalDaysNeeded = Object.values(taskGroups).reduce((sum: number, group: any) => sum + group.days, 0);
      
      // Generate all workdays first using the correctly parsed start date
      const allWorkDays = addWorkdays(parsedDate, totalDaysNeeded);
      
      // Create tasks in proper order
      const orderedTaskTypes = taskTypeOrder.filter(type => taskGroups[type]);
      const additionalTaskTypes = Object.keys(taskGroups).filter(type => !taskTypeOrder.includes(type));
      
      let globalDayIndex = 0;
      
      // Handle alternating Form/Pour tasks specially
      const hasAlternatingFormPour = taskGroups['Form']?.alternatingWith === 'Pour' && taskGroups['Pour']?.alternatingWith === 'Form';
      
      if (hasAlternatingFormPour) {
        // Handle alternating Form/Pour separately
        const formGroup = taskGroups['Form'];
        const pourGroup = taskGroups['Pour'];
        const totalConcreteDays = formGroup.days + pourGroup.days;
        
        // Remove Form/Pour from normal processing but keep them in proper sequence
        const beforeFormPourTypes = orderedTaskTypes.filter(type => 
          type !== 'Form' && type !== 'Pour' && 
          (taskTypeOrder.indexOf(type) < taskTypeOrder.indexOf('Form'))
        );
        const afterFormPourTypes = orderedTaskTypes.filter(type => 
          type !== 'Form' && type !== 'Pour' && 
          (taskTypeOrder.indexOf(type) > taskTypeOrder.indexOf('Pour'))
        );
        const filteredAdditionalTypes = additionalTaskTypes.filter(type => type !== 'Form' && type !== 'Pour');
        
        // Process task types that come before Form/Pour first
        beforeFormPourTypes.forEach(taskType => {
          const group = taskGroups[taskType];
          
          for (let day = 1; day <= group.days; day++) {
            const taskName = taskType;
            
            const taskId = `${locationId}_${taskType.replace(/[\/\s+]/g, '')}_Day${day}_${Date.now()}`;
            const taskDate = allWorkDays[globalDayIndex];
            const costCode = getTaskCostCode(taskType, group);
            const dateRange = getCostCodeDateRange(costCode, taskType, allWorkDays);
            
            tasksToCreate.push({
              taskId: taskId,
              name: taskName,
              taskType: taskType,
              taskDate: safeFormatDate(taskDate),
              startDate: dateRange.startDate,
              finishDate: dateRange.finishDate,
              costCode: costCode,
              workDescription: "",
              scheduledHours: "0.00",
              actualHours: null,
              superintendentId: null,
              foremanId: null,
              startTime: null,
              finishTime: null,
              notes: null,
              order: tasksToCreate.length, // Properly assign order based on creation sequence
              dependentOnPrevious: tasksToCreate.length === 0 ? false : true // First task is non-sequential
            });
            
            globalDayIndex++;
          }
        });
        
        // Now handle alternating Form/Pour
        let formDayCount = 1;
        let pourDayCount = 1;
        
        for (let concreteDay = 1; concreteDay <= totalConcreteDays; concreteDay++) {
          const isFormDay = (concreteDay % 2 === 1); // Odd days are Form
          
          let taskType, dayCount, group;
          if (isFormDay && formDayCount <= formGroup.days) {
            taskType = 'Form';
            dayCount = formDayCount++;
            group = formGroup;
          } else if (!isFormDay && pourDayCount <= pourGroup.days) {
            taskType = 'Pour';
            dayCount = pourDayCount++;
            group = pourGroup;
          } else {
            // If we've exhausted one type, use the other
            if (formDayCount <= formGroup.days) {
              taskType = 'Form';
              dayCount = formDayCount++;
              group = formGroup;
            } else {
              taskType = 'Pour';
              dayCount = pourDayCount++;
              group = pourGroup;
            }
          }
          
          const taskName = taskType;
          const taskId = `${locationId}_${taskType.replace(/[\/\s+]/g, '')}_Day${dayCount}_${Date.now()}`;
          const taskDate = allWorkDays[globalDayIndex];
          
          const costCode = getTaskCostCode(taskType, group);
          const dateRange = getCostCodeDateRange(costCode, taskType, allWorkDays);
          
          tasksToCreate.push({
            taskId: taskId,
            name: taskName,
            taskType: taskType,
            taskDate: safeFormatDate(taskDate),
            startDate: dateRange.startDate,
            finishDate: dateRange.finishDate,
            costCode: costCode,
            workDescription: "",
            scheduledHours: (Math.min(40, group.totalHours / group.days)).toFixed(2),
            actualHours: null,
            superintendentId: null,
            foremanId: null,
            startTime: null,
            finishTime: null,
            notes: null,
            dependentOnPrevious: tasksToCreate.length === 0 ? false : true // First task is non-sequential
          });
          
          globalDayIndex++;
        }
        
        // Now process task types that come after Form/Pour
        [...afterFormPourTypes, ...filteredAdditionalTypes].forEach(taskType => {
          const group = taskGroups[taskType];
          
          for (let day = 1; day <= group.days; day++) {
            const taskName = taskType;
            
            const taskId = `${locationId}_${taskType.replace(/[\/\s+]/g, '')}_Day${day}_${Date.now()}`;
            const taskDate = allWorkDays[globalDayIndex];
            const costCode = getTaskCostCode(taskType, group);
            const dateRange = getCostCodeDateRange(costCode, taskType, allWorkDays);
            
            tasksToCreate.push({
              taskId: taskId,
              name: taskName,
              taskType: taskType,
              taskDate: safeFormatDate(taskDate),
              startDate: dateRange.startDate,
              finishDate: dateRange.finishDate,
              costCode: costCode,
              workDescription: "",
              scheduledHours: "0.00",
              actualHours: null,
              superintendentId: null,
              foremanId: null,
              startTime: null,
              finishTime: null,
              notes: null,
              order: tasksToCreate.length, // Properly assign order based on creation sequence
              dependentOnPrevious: tasksToCreate.length === 0 ? false : true // First task is non-sequential
            });
            
            globalDayIndex++;
          }
        });
      } else {
        // Normal processing for non-alternating tasks
        [...orderedTaskTypes, ...additionalTaskTypes].forEach(taskType => {
          const group = taskGroups[taskType];
          
          for (let day = 1; day <= group.days; day++) {
            const taskName = taskType;
            
            const taskId = `${locationId}_${taskType.replace(/[\/\s+]/g, '')}_Day${day}_${Date.now()}`;
            const taskDate = allWorkDays[globalDayIndex];
            const costCode = getTaskCostCode(taskType, group);
            const dateRange = getCostCodeDateRange(costCode, taskType, allWorkDays);
            
            tasksToCreate.push({
              taskId: taskId,
              name: taskName,
              taskType: taskType,
              taskDate: safeFormatDate(taskDate),
              startDate: dateRange.startDate || safeFormatDate(allWorkDays[0]),
              finishDate: dateRange.finishDate || safeFormatDate(allWorkDays[allWorkDays.length - 1]),
              costCode: costCode,
              workDescription: "",
              scheduledHours: "0.00",
              actualHours: null,
              superintendentId: null,
              foremanId: null,
              startTime: null,
              finishTime: null,
              notes: null,
              order: tasksToCreate.length, // Properly assign order based on creation sequence
              dependentOnPrevious: tasksToCreate.length === 0 ? false : true // First task is non-sequential
            });
            
            globalDayIndex++;
          }
        });
      }

      // Create all tasks
      console.log('Creating tasks:', tasksToCreate);
      
      const createPromises = tasksToCreate.map(async (task) => {
        const response = await fetch(`/api/locations/${locationId}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(task)
        });
        
        if (!response.ok) {
          throw new Error(`Failed to create task: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('Task created:', result);
        return result;
      });

      const results = await Promise.all(createPromises);
      console.log('All tasks created successfully:', results.length);
      
      // Add a small delay to ensure tasks are properly saved
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Refresh tasks data
      await queryClient.invalidateQueries({ queryKey: ["/api/locations", location?.locationId || locationId, "tasks"] });
      
      toast({
        title: "Tasks generated successfully",
        description: `Created ${tasksToCreate.length} tasks starting from ${safeFormatDate(startDate, 'MMM d, yyyy')}`
      });
      
      setShowGenerateTasksDialog(false);
    } catch (error) {
      console.error('Error generating tasks:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast({
        title: "Error generating tasks",
        description: `Failed to create tasks: ${errorMessage}. Please try again.`,
        variant: "destructive"
      });
    } finally {
      setIsGeneratingTasks(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        {/* Breadcrumb Navigation */}
        <div className="mb-4">
          <nav className="flex items-center space-x-2 text-sm text-gray-600">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocationPath("/")}
              className="p-1 h-auto hover:bg-gray-100"
            >
              <Home className="w-4 h-4" />
            </Button>
            <span>/</span>
            
            {project ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLocationPath(`/projects/${project.id}`)}
                  className="p-1 h-auto hover:bg-gray-100 text-blue-600 hover:text-blue-800"
                >
                  <Building2 className="w-4 h-4 mr-1" />
                  {project.name}
                </Button>
                <span>/</span>
              </>
            ) : (
              <>
                <span className="text-gray-400">
                  <Building2 className="w-4 h-4 mr-1 inline" />
                  Project
                </span>
                <span>/</span>
              </>
            )}
            
            <span className="text-gray-900 font-medium">
              <MapPin className="w-4 h-4 mr-1 inline" />
              {location?.name || 'Location'}
            </span>
          </nav>
        </div>
        
        <div>
          <h2 className="text-2xl font-bold text-gray-800">{location.name}</h2>
          <p className="text-gray-600 mt-1">Location overview and details</p>
        </div>
      </header>

      <main className="p-6">
        {/* Location Overview */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Location Overview
              <Badge variant="outline">{location.locationId}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Duration</p>
                  <p className="font-medium">
                    {locationDuration.startDate} - {locationDuration.endDate}
                  </p>
                  <p className="text-xs text-gray-500">Based on scheduled tasks</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <DollarSign className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Budget Allocation</p>
                  <p className="font-medium">${location.budgetAllocated?.toLocaleString() || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {location.isComplete ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <Clock className="w-4 h-4 text-orange-600" />
                )}
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <p className="font-medium">{location.isComplete ? 'Completed' : 'In Progress'}</p>
                </div>
              </div>
            </div>
            
            {location.description && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700">{location.description}</p>
              </div>
            )}

            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Progress</span>
                <span className="text-sm text-gray-600">{Math.round(progressPercentage)}%</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* Budget Summary */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Budget Summary
                <Badge variant="secondary">{budgetItems.length} items</Badge>
              </CardTitle>
              <Link href={`/budgets?locationId=${location.locationId}`}>
                <Button variant="outline" size="sm">
                  View Full Budget
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {budgetLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : budgetItems.length === 0 ? (
              <div className="text-center py-8">
                <DollarSign className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No budget items found for this location</p>
                <p className="text-sm text-gray-400 mt-2">
                  Budget items will appear here once they are added
                </p>
                <Link href={`/budgets?locationId=${location.locationId}`}>
                  <Button className="mt-4">
                    Manage Budget
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Overall Budget Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-600 font-medium">Total Budget Hours</p>
                    <p className="text-2xl font-bold text-blue-800">{totalBudgetHours.toLocaleString()} hrs</p>
                  </div>
                  <div className="p-4 bg-red-50 rounded-lg">
                    <p className="text-sm text-red-600 font-medium">Actual Hours Worked</p>
                    <p className="text-2xl font-bold text-red-800">{totalActualHours.toLocaleString()} hrs</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-600 font-medium">Remaining Hours</p>
                    <p className={`text-2xl font-bold ${remainingHours >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                      {remainingHours.toLocaleString()} hrs
                    </p>
                  </div>
                </div>

                {/* Cost Code Summary Cards */}
                <div>
                  <div className="mb-4">
                    <h4 className="font-medium">Cost Code Summary</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {costCodeArray.map((summary: any) => {
                      const remainingHours = summary.totalBudgetHours - summary.totalActualHours;
                      const hoursPercentage = summary.totalBudgetHours > 0 ? (summary.totalActualHours / summary.totalBudgetHours) * 100 : 0;
                      
                      return (
                        <Card 
                          key={summary.costCode} 
                          className="hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => handleCostCodeClick(summary.costCode)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="outline" className="font-medium">
                                {getCostCodeDisplayName(summary.costCode)}
                              </Badge>
                              <span className="text-sm text-gray-600">
                                {summary.itemCount} items
                              </span>
                            </div>
                            <div className="space-y-2">
                              {/* For combined Demo/ex + Base/grading, show separate quantities */}
                              {summary.costCode === 'Demo/ex + Base/grading' ? (
                                <div className="space-y-1">
                                  {summary.originalCostCodes && Array.from(summary.originalCostCodes).map((originalCode: string) => {
                                    const originalItems = summary.items.filter((item: any) => 
                                      (item.costCode === originalCode || 
                                       (originalCode === 'UNCATEGORIZED' && !item.costCode))
                                    );
                                    const originalQty = originalItems.reduce((sum: number, item: any) => {
                                      const isParent = item.lineItemNumber && !item.lineItemNumber.includes('.');
                                      const isChild = item.lineItemNumber && item.lineItemNumber.includes('.');
                                      const hasChildren = budgetItems.some((child: any) => 
                                        child.lineItemNumber && child.lineItemNumber.includes('.') && 
                                        child.lineItemNumber.split('.')[0] === item.lineItemNumber
                                      );
                                      if (isParent || (!isChild && !hasChildren)) {
                                        return sum + (parseFloat(item.convertedQty) || 0);
                                      }
                                      return sum;
                                    }, 0);
                                    return (
                                      <div key={originalCode} className="flex justify-between text-xs">
                                        <span className="text-gray-500">{originalCode || 'Demo/Ex'}:</span>
                                        <span className="font-medium">{originalQty.toLocaleString()} {summary.convertedUnitOfMeasure}</span>
                                      </div>
                                    );
                                  })}
                                  <div className="flex justify-between text-sm border-t pt-1">
                                    <span className="text-gray-600 font-medium">Combined Qty:</span>
                                    <span className="font-semibold">{summary.totalConvertedQty.toLocaleString()} {summary.convertedUnitOfMeasure}</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-600">Total Qty:</span>
                                  <span className="font-medium">{summary.totalConvertedQty.toLocaleString()} {summary.convertedUnitOfMeasure}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Budget Hours:</span>
                                <span className="font-medium">{summary.totalBudgetHours.toLocaleString()} hrs</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Actual Hours:</span>
                                <span className="font-medium text-red-600">{summary.totalActualHours.toLocaleString()} hrs</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Remaining:</span>
                                <span className={`font-medium ${remainingHours >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {remainingHours.toLocaleString()} hrs
                                </span>
                              </div>
                              <div className="mt-2">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-gray-500">Progress</span>
                                  <span className="text-xs text-gray-500">{Math.round(hoursPercentage)}%</span>
                                </div>
                                <Progress value={Math.min(hoursPercentage, 100)} className="h-2" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Tasks
                <Badge variant="secondary">{tasks.length}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  onClick={() => setIsCreateTaskModalOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Task
                </Button>
                <Button 
                  onClick={() => setShowGenerateTasksDialog(true)}
                  size="sm"
                  disabled={tasks.length > 0 || isGeneratingTasks}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {isGeneratingTasks ? 'Generating...' : 'Generate Tasks'}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : (
              <DraggableTaskList
                tasks={tasks || []}
                locationId={locationId}
                onEditTask={handleEditTask}
                onDeleteTask={handleDeleteTaskClick}
                onAssignTask={handleAssignTaskClick}
                onTaskUpdate={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/locations", locationId, "tasks"] });
                }}
                budgetItems={budgetItems || []}
                showRemainingHours={true}
              />
            )}
          </CardContent>
        </Card>
      </main>

      {/* Cost Code Dialog */}
      <Dialog open={showCostCodeDialog} onOpenChange={setShowCostCodeDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant="outline">{selectedCostCode}</Badge>
              Cost Code Details
              <span className="text-sm text-gray-500 font-normal">
                ({selectedCostCodeItems.length} items)
              </span>
            </DialogTitle>
          </DialogHeader>
          
          {selectedCostCode && (
            <div className="space-y-4">
              {/* Cost Code Summary */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">Total Budget Hours</p>
                  <p className="text-lg font-bold text-blue-600">
                    {costCodeSummaries[selectedCostCode]?.totalBudgetHours.toLocaleString()} hrs
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Actual Hours Worked</p>
                  <p className="text-lg font-bold text-red-600">
                    {costCodeSummaries[selectedCostCode]?.totalActualHours.toLocaleString()} hrs
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Remaining Hours</p>
                  <p className={`text-lg font-bold ${
                    (costCodeSummaries[selectedCostCode]?.totalBudgetHours - costCodeSummaries[selectedCostCode]?.totalActualHours) >= 0 
                      ? 'text-green-600' 
                      : 'text-red-600'
                  }`}>
                    {(costCodeSummaries[selectedCostCode]?.totalBudgetHours - costCodeSummaries[selectedCostCode]?.totalActualHours).toLocaleString()} hrs
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Progress</p>
                  <p className="text-lg font-bold text-purple-600">
                    {Math.round((costCodeSummaries[selectedCostCode]?.totalActualHours / costCodeSummaries[selectedCostCode]?.totalBudgetHours) * 100)}%
                  </p>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-gray-50 border-b z-10">
                    <tr>
                      <th className="text-left p-3 font-medium text-gray-900 w-20">Line #</th>
                      <th className="text-left p-3 font-medium text-gray-900">Description</th>
                      <th className="text-right p-3 font-medium text-gray-900">Quantity</th>
                      <th className="text-right p-3 font-medium text-gray-900">PX</th>
                      <th className="text-right p-3 font-medium text-gray-900">Budget Hours</th>
                      <th className="text-right p-3 font-medium text-gray-900">Billings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getParentItems().map((item: any) => {
                      const itemHasChildren = hasChildren(item.lineItemNumber);
                      const isExpanded = expandedItems.has(item.lineItemNumber);
                      const children = getChildren(item.lineItemNumber);
                      
                      return (
                        <React.Fragment key={item.id}>
                          {/* Parent Row */}
                          <tr className="border-b hover:bg-gray-50">
                            <td className="p-3 font-medium">
                              <div className="flex items-center gap-2">
                                {itemHasChildren && (
                                  <button
                                    onClick={() => toggleExpanded(item.lineItemNumber)}
                                    className="p-1 hover:bg-gray-200 rounded"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </button>
                                )}
                                <span>{item.lineItemNumber}</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <div>
                                <p className="font-medium">{item.lineItemName}</p>
                                {item.notes && (
                                  <p className="text-sm text-gray-600 mt-1">{item.notes}</p>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              {parseFloat(item.convertedQty || 0).toLocaleString()} {item.convertedUnitOfMeasure}
                            </td>
                            <td className="p-3 text-right">
                              {parseFloat(item.productionRate || item.px || 0).toLocaleString()}
                            </td>
                            <td className="p-3 text-right font-medium">
                              {parseFloat(item.hours || 0).toLocaleString()} hrs
                            </td>
                            <td className="p-3 text-right text-red-600">
                              ${parseFloat(item.billing || 0).toLocaleString()}
                            </td>
                          </tr>
                          
                          {/* Children Rows */}
                          {itemHasChildren && isExpanded && children.map((child: any) => (
                            <tr key={child.id} className="border-b hover:bg-gray-50 bg-gray-25">
                              <td className="p-3 font-medium pl-12">
                                {child.lineItemNumber}
                              </td>
                              <td className="p-3">
                                <div>
                                  <p className="font-medium text-gray-700">{child.lineItemName}</p>
                                  {child.notes && (
                                    <p className="text-sm text-gray-600 mt-1">{child.notes}</p>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-right">
                                {parseFloat(child.convertedQty || 0).toLocaleString()} {child.convertedUnitOfMeasure}
                              </td>
                              <td className="p-3 text-right">
                                {parseFloat(child.productionRate || child.px || 0).toLocaleString()}
                              </td>
                              <td className="p-3 text-right font-medium">
                                {parseFloat(child.hours || 0).toLocaleString()} hrs
                              </td>
                              <td className="p-3 text-right text-red-600">
                                ${parseFloat(child.billing || 0).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Generate Tasks Dialog */}
      <Dialog open={showGenerateTasksDialog} onOpenChange={setShowGenerateTasksDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Generate Tasks
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Starting Date */}
            <div className="space-y-2">
              <Label htmlFor="startDate">Starting Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            {/* Combining Options */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Combine Task Types</h4>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="combineFormPour"
                  checked={combineFormPour}
                  onCheckedChange={(checked) => setCombineFormPour(checked as boolean)}
                />
                <Label htmlFor="combineFormPour" className="text-sm">
                  Combine Form and Pour tasks
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="combineDemoBase"
                  checked={combineDemoBase}
                  onCheckedChange={(checked) => setCombineDemoBase(checked as boolean)}
                />
                <Label htmlFor="combineDemoBase" className="text-sm">
                  Combine Demo/Ex and Base/Grading tasks
                </Label>
              </div>
            </div>

            {/* Task Preview */}
            {costCodeArray.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Available Cost Codes</h4>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {costCodeArray.map((summary: any) => (
                    <div key={summary.costCode} className="flex justify-between text-xs bg-gray-50 p-2 rounded">
                      <span className="font-medium">{summary.costCode}</span>
                      <span className="text-gray-600">{summary.totalBudgetHours} hrs</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  Tasks will be estimated at 40 hours per day per cost code type.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowGenerateTasksDialog(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={generateTasks}
                disabled={costCodeArray.length === 0}
                className="flex-1"
              >
                Generate Tasks
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Task Modal */}
      <EditTaskModal
        isOpen={isEditTaskModalOpen}
        onClose={() => {
          setIsEditTaskModalOpen(false);
          setEditingTask(null);
        }}
        task={editingTask}
        locationTasks={tasks || []}
        onTaskUpdate={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/locations", location?.locationId || locationId, "tasks"] });
        }}
      />

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateTaskModalOpen}
        onClose={() => setIsCreateTaskModalOpen(false)}
        selectedProject={location?.projectId}
        selectedLocation={location?.id}
      />

      {/* Task Detail Modal */}
      <TaskDetailModal
        isOpen={taskDetailModalOpen}
        onClose={() => {
          setTaskDetailModalOpen(false);
          setSelectedTaskForDetail(null);
        }}
        taskId={selectedTaskForDetail?.id || selectedTaskForDetail?.taskId}
      />

      {/* Assignment Modal */}
      <EnhancedAssignmentModal
        isOpen={assignmentModalOpen}
        onClose={() => {
          setAssignmentModalOpen(false);
          setSelectedTaskForAssignment(null);
        }}
        taskId={selectedTaskForAssignment?.id || selectedTaskForAssignment?.taskId}
        taskDate={selectedTaskForAssignment?.taskDate || ''}
        taskName={selectedTaskForAssignment?.name || 'Task'}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{taskToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (taskToDelete) {
                  handleDeleteTask(taskToDelete);
                }
                setDeleteConfirmOpen(false);
                setTaskToDelete(null);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}