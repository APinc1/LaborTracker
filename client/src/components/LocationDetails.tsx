import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MapPin, Calendar, User, DollarSign, CheckCircle, Clock, AlertCircle, X, ChevronDown, ChevronRight, Home, Building2, Plus, Edit, Trash2 } from "lucide-react";
import { format, addDays } from "date-fns";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

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
  const { toast } = useToast();

  // Task edit and delete functions
  const handleEditTask = (task: any) => {
    toast({
      title: "Edit Task",
      description: "Task editing functionality coming soon",
    });
  };

  const handleDeleteTask = async (taskId: number) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await queryClient.invalidateQueries({ queryKey: ["/api/locations", location?.locationId || locationId, "tasks"] });
        toast({
          title: "Task deleted",
          description: "Task has been removed successfully",
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
  
  const totalActualHours = budgetItems.reduce((sum: number, item: any) => {
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
      return sum + (parseFloat(item.actualHours) || 0);
    }
    
    return sum;
  }, 0);
  
  const remainingHours = totalBudgetHours - totalActualHours;

  // Calculate progress
  const completedTasks = tasks.filter((task: any) => task.actualHours).length;
  const progressPercentage = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;

  // Calculate cost code summaries by hours
  const costCodeSummaries = budgetItems.reduce((acc: any, item: any) => {
    const costCode = item.costCode || 'UNCATEGORIZED';
    if (!acc[costCode]) {
      acc[costCode] = {
        costCode,
        totalBudgetHours: 0,
        totalActualHours: 0,
        totalConvertedQty: 0,
        convertedUnitOfMeasure: '',
        items: [],
        itemCount: 0
      };
    }
    
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
      acc[costCode].totalBudgetHours += parseFloat(item.hours) || 0;
      acc[costCode].totalActualHours += parseFloat(item.actualHours) || 0;
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

  const costCodeArray = Object.values(costCodeSummaries).filter((summary: any) => summary.totalConvertedQty > 0);

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
    try {
      // Get cost codes with total qty > 0
      const validCostCodes = costCodeArray.filter(summary => summary.totalConvertedQty > 0);
      
      if (validCostCodes.length === 0) {
        toast({
          title: "No valid cost codes",
          description: "No cost codes found with quantity greater than 0",
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
          const costCodeNames = group.costCodes.map(cc => cc.costCode).join(', ');
          
          for (let day = 1; day <= group.days; day++) {
            const taskName = group.days > 1 ? `${taskType} - Day ${day}` : taskType;
            const workDescription = `${taskType} work for cost codes: ${costCodeNames}`;
            
            const taskId = `${locationId}_${taskType.replace(/[\/\s+]/g, '')}_Day${day}_${Date.now()}`;
            const taskDate = allWorkDays[globalDayIndex];
            
            tasksToCreate.push({
              taskId: taskId,
              name: taskName,
              taskType: taskType,
              taskDate: safeFormatDate(taskDate),
              startDate: safeFormatDate(taskDate),
              finishDate: safeFormatDate(taskDate),
              costCode: group.costCodes[0].costCode,
              workDescription: workDescription,
              scheduledHours: (Math.min(40, group.totalHours / group.days)).toFixed(2),
              actualHours: null,
              superintendentId: null,
              foremanId: null,
              startTime: null,
              finishTime: null,
              notes: null
            });
            
            globalDayIndex++;
          }
        });
        
        // Now handle alternating Form/Pour
        let formDayCount = 1;
        let pourDayCount = 1;
        const costCodeNames = formGroup.costCodes.map(cc => cc.costCode).join(', ');
        
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
          
          const taskName = group.days > 1 ? `${taskType} - Day ${dayCount}` : taskType;
          const workDescription = `${taskType} work for cost codes: ${costCodeNames}`;
          const taskId = `${locationId}_${taskType.replace(/[\/\s+]/g, '')}_Day${dayCount}_${Date.now()}`;
          const taskDate = allWorkDays[globalDayIndex];
          
          tasksToCreate.push({
            taskId: taskId,
            name: taskName,
            taskType: taskType,
            taskDate: safeFormatDate(taskDate),
            startDate: safeFormatDate(taskDate),
            finishDate: safeFormatDate(taskDate),
            costCode: group.costCodes[0].costCode,
            workDescription: workDescription,
            scheduledHours: (Math.min(40, group.totalHours / group.days)).toFixed(2),
            actualHours: null,
            superintendentId: null,
            foremanId: null,
            startTime: null,
            finishTime: null,
            notes: null
          });
          
          globalDayIndex++;
        }
        
        // Now process task types that come after Form/Pour
        [...afterFormPourTypes, ...filteredAdditionalTypes].forEach(taskType => {
          const group = taskGroups[taskType];
          const costCodeNames = group.costCodes.map(cc => cc.costCode).join(', ');
          
          for (let day = 1; day <= group.days; day++) {
            const taskName = group.days > 1 ? `${taskType} - Day ${day}` : taskType;
            const workDescription = `${taskType} work for cost codes: ${costCodeNames}`;
            
            const taskId = `${locationId}_${taskType.replace(/[\/\s+]/g, '')}_Day${day}_${Date.now()}`;
            const taskDate = allWorkDays[globalDayIndex];
            
            tasksToCreate.push({
              taskId: taskId,
              name: taskName,
              taskType: taskType,
              taskDate: safeFormatDate(taskDate),
              startDate: safeFormatDate(taskDate),
              finishDate: safeFormatDate(taskDate),
              costCode: group.costCodes[0].costCode,
              workDescription: workDescription,
              scheduledHours: (Math.min(40, group.totalHours / group.days)).toFixed(2),
              actualHours: null,
              superintendentId: null,
              foremanId: null,
              startTime: null,
              finishTime: null,
              notes: null
            });
            
            globalDayIndex++;
          }
        });
      } else {
        // Normal processing for non-alternating tasks
        [...orderedTaskTypes, ...additionalTaskTypes].forEach(taskType => {
          const group = taskGroups[taskType];
          const costCodeNames = group.costCodes.map(cc => cc.costCode).join(', ');
          
          for (let day = 1; day <= group.days; day++) {
            const taskName = group.days > 1 ? `${taskType} - Day ${day}` : taskType;
            const workDescription = `${taskType} work for cost codes: ${costCodeNames}`;
            
            const taskId = `${locationId}_${taskType.replace(/[\/\s+]/g, '')}_Day${day}_${Date.now()}`;
            const taskDate = allWorkDays[globalDayIndex];
            
            tasksToCreate.push({
              taskId: taskId,
              name: taskName,
              taskType: taskType,
              taskDate: safeFormatDate(taskDate),
              startDate: safeFormatDate(taskDate),
              finishDate: safeFormatDate(taskDate),
              costCode: group.costCodes[0].costCode,
              workDescription: workDescription,
              scheduledHours: (Math.min(40, group.totalHours / group.days)).toFixed(2),
              actualHours: null,
              superintendentId: null,
              foremanId: null,
              startTime: null,
              finishTime: null,
              notes: null
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
        description: `Created ${tasksToCreate.length} tasks starting from ${format(new Date(startDate), 'MMM d, yyyy')}`
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
                    {location.startDate ? safeFormatDate(location.startDate, 'MMM d, yyyy') : 'No start date'} - {location.endDate ? safeFormatDate(location.endDate, 'MMM d, yyyy') : 'No end date'}
                  </p>
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
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Budget Summary
              <Badge variant="secondary">{budgetItems.length} items</Badge>
            </CardTitle>
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
                <Link href={`/budgets?locationId=${location.id}`}>
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
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium">Cost Code Summary</h4>
                    <Link href={`/budgets?locationId=${location.id}`}>
                      <Button variant="outline" size="sm">
                        View Full Budget
                      </Button>
                    </Link>
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
                                {summary.costCode}
                              </Badge>
                              <span className="text-sm text-gray-600">
                                {summary.itemCount} items
                              </span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Total Qty:</span>
                                <span className="font-medium">{summary.totalConvertedQty.toLocaleString()} {summary.convertedUnitOfMeasure}</span>
                              </div>
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
              <Button 
                onClick={() => setShowGenerateTasksDialog(true)}
                size="sm"
                className="ml-auto"
              >
                <Plus className="w-4 h-4 mr-2" />
                Generate Tasks
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No tasks found for this location</p>
                <p className="text-sm text-gray-400 mt-2">
                  Tasks will appear here once they are scheduled
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {tasks
                  .sort((a: any, b: any) => {
                    // First sort by date
                    const dateA = new Date(a.taskDate);
                    const dateB = new Date(b.taskDate);
                    if (dateA.getTime() !== dateB.getTime()) {
                      return dateA.getTime() - dateB.getTime();
                    }
                    
                    // Then sort by task type order
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
                    
                    const indexA = taskTypeOrder.indexOf(a.taskType);
                    const indexB = taskTypeOrder.indexOf(b.taskType);
                    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
                  })
                  .map((task: any) => (
                  <Card key={task.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{task.name}</h3>
                          <p className="text-gray-600 text-sm mt-1">{task.workDescription}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <Badge variant="outline">{task.taskType}</Badge>
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Calendar className="w-4 h-4" />
                              <span>{format(new Date(task.taskDate), 'MMM d, yyyy')}</span>
                            </div>
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Clock className="w-4 h-4" />
                              <span>{task.scheduledHours}h scheduled</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {task.actualHours ? (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Completed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-orange-600">
                              <Clock className="w-3 h-3 mr-1" />
                              In Progress
                            </Badge>
                          )}
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEditTask(task)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleDeleteTask(task.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
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
    </div>
  );
}