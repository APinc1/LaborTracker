import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Edit, Save, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertTaskSchema } from "@shared/schema";
import { updateTaskDependenciesEnhanced, unlinkTask, getLinkedTasks, generateLinkedTaskGroupId, findLinkedTaskGroups, getLinkedGroupTaskIds, realignDependentTasks, realignDependentTasksAfter, getTaskStatus } from "@shared/taskUtils";
import { z } from "zod";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface EditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: any | null;
  onTaskUpdate: () => void;
  locationTasks?: any[];
}

const taskStatuses = [
  { value: "upcoming", label: "Upcoming", color: "bg-gray-100 text-gray-800" },
  { value: "in_progress", label: "In Progress", color: "bg-blue-100 text-blue-800" },
  { value: "complete", label: "Complete", color: "bg-green-100 text-green-800" },
];

const taskTypes = [
  "Demo/Ex",
  "Base/Grading", 
  "Form",
  "Pour",
  "Asphalt",
  "Utility Adjustment"
];

const costCodes = [
  "Demo/Ex + Base/Grading",
  "Concrete",
  "Asphalt",
  "General Labor",
  "Traffic Control",
  "Landscaping",
  "Utility Adjustment",
  "PUNCHLIST DEMO",
  "PUNCHLIST CONCRETE", 
  "PUNCHLIST GENERAL LABOR"
];

// Default unit of measure options (fallback if no budget items)
const defaultUnitOfMeasureOptions = [
  { value: "CY", label: "CY (Cubic Yards)" },
  { value: "Ton", label: "Ton" },
  { value: "LF", label: "LF (Linear Feet)" },
  { value: "SF", label: "SF (Square Feet)" },
  { value: "Hours", label: "Hours" },
];

// Line item quantity entry type
interface LineItemQuantity {
  budgetLineItemId: number;
  qty: string;
}

// Simplified schema for editing only the editable fields
const editTaskSchema = z.object({
  name: z.string().min(1, "Task name is required"),
  taskDate: z.string().min(1, "Task date is required"),
  startTime: z.string().optional(),
  finishTime: z.string().optional(),
  workDescription: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
  dependentOnPrevious: z.boolean().optional(),
  linkToExistingTask: z.boolean().default(false),
  linkedTaskIds: z.array(z.string()).optional(),
  qty: z.string().optional(),
  unitOfMeasure: z.string().optional(),
  useLineItemQuantities: z.boolean().default(false),
  lineItemQuantities: z.array(z.object({
    budgetLineItemId: z.number(),
    qty: z.string()
  })).optional().default([]),
}).refine((data) => {
  // If linking is enabled, linkedTaskIds must have at least one item
  if (data.linkToExistingTask && (!data.linkedTaskIds || data.linkedTaskIds.length === 0)) {
    return false;
  }
  return true;
}, {
  message: "You must select at least one task to link with when linking is enabled",
  path: ["linkedTaskIds"]
});

export default function EditTaskModal({ isOpen, onClose, task, onTaskUpdate, locationTasks = [] }: EditTaskModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDateChangeDialog, setShowDateChangeDialog] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<any>(null);
  const [dateChangeAction, setDateChangeAction] = useState<'sequential' | 'unsequential_shift_others' | 'unsequential_move_only'>('sequential');
  const [showNonSequentialDialog, setShowNonSequentialDialog] = useState(false);
  const [pendingNonSequentialData, setPendingNonSequentialData] = useState<any>(null);
  const [showLinkDateDialog, setShowLinkDateDialog] = useState(false);
  const [linkingOptions, setLinkingOptions] = useState<{
    currentTask: any, 
    targetTasks: any[], 
    availableDates: {date: string, taskName: string}[],
    currentIsSequential?: boolean,
    linkedIsSequential?: boolean,
    areAdjacent?: boolean,
    formData?: any // Form data with updated task date/sequential status
  } | null>(null);
  const [showUnlinkDialog, setShowUnlinkDialog] = useState(false);
  const [unlinkingGroupSize, setUnlinkingGroupSize] = useState(0);
  const [skipUnlinkDialog, setSkipUnlinkDialog] = useState(false);

  // Fetch existing tasks for linking
  const { data: existingTasks = [] } = useQuery({
    queryKey: ["/api/locations", task?.locationId, "tasks"],
    enabled: !!task?.locationId && isOpen,
    staleTime: 5000,
  });

  // Fetch assignments to check task completion status
  const { data: allAssignments = [] } = useQuery<any[]>({
    queryKey: ["/api/assignments"],
    enabled: isOpen,
    staleTime: 30000,
  });

  // Fetch location budget items to filter unit of measure options by cost code
  const { data: locationBudgetItems = [] } = useQuery<any[]>({
    queryKey: ["/api/locations", task?.locationId, "budget"],
    enabled: !!task?.locationId && isOpen,
    staleTime: 30000,
  });

  // Get unit of measure options filtered by cost code from location budget
  const getFilteredUnitOfMeasureOptions = () => {
    if (!task?.costCode || locationBudgetItems.length === 0) {
      return defaultUnitOfMeasureOptions;
    }

    // Filter budget items by the task's cost code
    const matchingItems = locationBudgetItems.filter((item: any) => {
      // Handle combined cost codes like "Demo/Ex + Base/Grading"
      const itemCostCode = (item.costCode || '').toUpperCase().replace(/\s+/g, '');
      const taskCostCode = (task.costCode || '').toUpperCase().replace(/\s+/g, '');
      
      // Direct match
      if (itemCostCode === taskCostCode) return true;
      
      // Handle combined "Demo/Ex + Base/Grading" matching "DEMO/EX" or "BASE/GRADING"
      if (taskCostCode === 'DEMO/EX+BASE/GRADING') {
        return itemCostCode === 'DEMO/EX' || 
               itemCostCode === 'BASE/GRADING' ||
               itemCostCode === 'DEMO/EX+BASE/GRADING';
      }
      
      return false;
    });

    if (matchingItems.length === 0) {
      return defaultUnitOfMeasureOptions;
    }

    // Extract unique unit of measure values from matching budget items
    const uniqueUnits = new Set<string>();
    matchingItems.forEach((item: any) => {
      if (item.unconvertedUnitOfMeasure) {
        uniqueUnits.add(item.unconvertedUnitOfMeasure);
      }
      if (item.convertedUnitOfMeasure) {
        uniqueUnits.add(item.convertedUnitOfMeasure);
      }
    });

    if (uniqueUnits.size === 0) {
      return defaultUnitOfMeasureOptions;
    }

    // Convert to options format
    return Array.from(uniqueUnits).sort().map(unit => ({
      value: unit,
      label: unit,
    }));
  };

  const unitOfMeasureOptions = getFilteredUnitOfMeasureOptions();

  // Filter assignments for the current task
  const taskAssignments = allAssignments.filter((assignment: any) => 
    assignment.taskId === task?.id || assignment.taskId === task?.taskId
  );

  // Helper function to safely format dates  
  const safeFormatDate = (date: Date): string => {
    if (!date || isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
    return date.toISOString().split('T')[0];
  };

  // Helper function to generate linked task group ID
  const generateLinkedTaskGroupId = () => {
    return `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Helper function to get cost code date range based on actual tasks
  const getCostCodeDateRangeFromTasks = (costCode: string, existingTasks: any[]) => {
    // Find all tasks with this cost code (including the current task being edited)
    const costCodeTasks = existingTasks.filter(t => {
      // Include current task for proper date range calculation
      if (costCode === 'Demo/Ex + Base/Grading') {
        return t.costCode === 'Demo/Ex + Base/Grading' || 
               t.costCode === 'DEMO/EX' || 
               t.costCode === 'BASE/GRADING';
      }
      return t.costCode === costCode;
    });

    if (costCodeTasks.length === 0) {
      return { startDate: null, finishDate: null };
    }

    // Get the earliest and latest task dates for this cost code
    const taskDates = costCodeTasks.map(t => new Date(t.taskDate + 'T00:00:00').getTime());
    const earliestDate = new Date(Math.min(...taskDates));
    const latestDate = new Date(Math.max(...taskDates));

    return {
      startDate: safeFormatDate(earliestDate),
      finishDate: safeFormatDate(latestDate)
    };
  };

  const form = useForm({
    resolver: zodResolver(editTaskSchema),
    defaultValues: {
      name: "",
      taskDate: "",
      startTime: "",
      finishTime: "",
      workDescription: "",
      notes: "",
      status: "upcoming",
      dependentOnPrevious: true,
      linkToExistingTask: false,
      linkedTaskIds: [],
      qty: "",
      unitOfMeasure: "",
      useLineItemQuantities: false,
      lineItemQuantities: [] as LineItemQuantity[],
    },
  });

  // Update form when task changes
  useEffect(() => {
    if (task) {
      // Reset date change action and unlink dialog flag when opening a different task
      setDateChangeAction('sequential');
      setSkipUnlinkDialog(false);
      
      // Use the task's existing status if available, otherwise determine it
      let status = task.status || "upcoming";
      
      // Only auto-determine status if no status is set
      if (!task.status) {
        const currentDate = new Date().toISOString().split('T')[0];
        if (task.actualHours && parseFloat(task.actualHours) > 0) {
          status = "complete";
        } else if (task.taskDate === currentDate) {
          status = "in_progress";
        }
      }

      // Find all current linked tasks if this task is already linked
      const currentLinkedTasks = task.linkedTaskGroup ? 
        (Array.isArray(existingTasks) ? existingTasks : []).filter((t: any) => 
          t.linkedTaskGroup === task.linkedTaskGroup && 
          (t.taskId || t.id) !== (task.taskId || task.id)
        ) : [];

      form.reset({
        name: task.name || "",
        taskDate: task.taskDate || "",
        startTime: task.startTime || "",
        finishTime: task.finishTime || "",
        workDescription: task.workDescription || "",
        notes: task.notes || "",
        status: status,
        dependentOnPrevious: task.dependentOnPrevious ?? true,
        linkToExistingTask: !!task.linkedTaskGroup,
        linkedTaskIds: currentLinkedTasks.map((t: any) => (t.taskId || t.id?.toString())),
        qty: task.qty || "",
        unitOfMeasure: task.unitOfMeasure || "",
        useLineItemQuantities: task.useLineItemQuantities ?? false,
        lineItemQuantities: (task.lineItemQuantities || []) as LineItemQuantity[],
      });
    }
  }, [task, form, existingTasks]);

  const updateTaskMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      });
      return response.json();
    },
    onSuccess: () => {
      onTaskUpdate();
      toast({ title: "Success", description: "Task updated successfully" });
      onClose();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update task", 
        variant: "destructive" 
      });
    },
  });

  const batchUpdateTasksMutation = useMutation({
    mutationFn: async (tasksToUpdate: any[]) => {
      console.log('Batch updating tasks:', tasksToUpdate.map(t => ({ name: t.name, linkedTaskGroup: t.linkedTaskGroup })));
      
      // Update each task individually
      const promises = tasksToUpdate.map(taskData => 
        apiRequest(`/api/tasks/${taskData.id}`, {
          method: 'PUT',
          body: JSON.stringify(taskData),
          headers: { 'Content-Type': 'application/json' }
        })
      );
      
      const responses = await Promise.all(promises);
      return Promise.all(responses.map(response => response.json()));
    },
    onSuccess: () => {
      onTaskUpdate();
      toast({ title: "Success", description: "Task updated successfully" });
      onClose();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to link tasks", 
        variant: "destructive" 
      });
    },
  });

  const onSubmit = (data: any) => {
    console.log('Form submitted with data:', data);
    console.log('Form errors:', form.formState.errors);
    
    // Check if task is completed and restrict which fields can be edited
    const taskStatus = getTaskStatus(task, taskAssignments);
    if (taskStatus === 'complete') {
      // For completed tasks, only allow editing of notes and status
      const allowedFields = ['notes', 'status'];
      const changedFields = Object.keys(data).filter(key => 
        data[key] !== task[key] && !allowedFields.includes(key)
      );
      
      if (changedFields.length > 0) {
        toast({
          title: "Limited Editing for Completed Tasks",
          description: "Only notes and status can be modified for completed tasks.",
          variant: "destructive"
        });
        return;
      }
      
      // Only submit the allowed fields for completed tasks
      const restrictedData = {
        ...task,
        notes: data.notes,
        status: data.status
      };
      
      console.log('Completed task - restricted submission:', restrictedData);
      
      // Use direct API call for completed tasks instead of processFormSubmission
      updateTaskMutation.mutate(restrictedData);
      return;
    }
    
    // Process the form submission with the current date change action for non-completed tasks
    processFormSubmission(data);
  };

  // Function to create position-based options based on the target tasks being linked to
  const createPositionOptions = (targetTasks: any[], formData?: any) => {
    // Include the current task as well as the target tasks for position options
    // If formData is provided, use the updated task data from the form
    const currentTaskWithFormData = formData ? {
      ...task,
      taskDate: formData.taskDate || task.taskDate,
      dependentOnPrevious: formData.dependentOnPrevious ?? task.dependentOnPrevious
    } : task;
    
    console.log('🎯 createPositionOptions called with:', {
      formData: formData ? { taskDate: formData.taskDate, dependentOnPrevious: formData.dependentOnPrevious } : null,
      currentTaskOriginal: { name: task.name, date: task.taskDate, sequential: task.dependentOnPrevious },
      currentTaskUpdated: { name: currentTaskWithFormData.name, date: currentTaskWithFormData.taskDate, sequential: currentTaskWithFormData.dependentOnPrevious },
      targetTasks: targetTasks.map(t => ({ name: t.name, date: t.taskDate }))
    });
    
    const allRelevantTasks = [currentTaskWithFormData, ...targetTasks];
    
    // Sort all tasks (current + target) by date and order
    const sortedTargetTasks = allRelevantTasks
      .sort((a: any, b: any) => {
        const dateA = new Date(a.taskDate).getTime();
        const dateB = new Date(b.taskDate).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return (a.order || 0) - (b.order || 0);
      });

    const options: any[] = [];
    
    let i = 0;
    while (i < sortedTargetTasks.length) {
      const currentTask = sortedTargetTasks[i];
      
      // Special case: Check for non-consecutive task (not first) + sequential task after it
      if (!currentTask.dependentOnPrevious && (currentTask.order || 0) > 0 && i + 1 < sortedTargetTasks.length) {
        const nextTask = sortedTargetTasks[i + 1];
        const isConsecutiveOrder = (nextTask.order || 0) === (currentTask.order || 0) + 1;
        const isNextTaskSequential = nextTask.dependentOnPrevious;
        
        if (isNextTaskSequential && isConsecutiveOrder) {
          // This is the special case: non-consecutive + sequential consecutive tasks
          options.push({
            type: 'special-unsequential-pair',
            tasks: [currentTask, nextTask],
            name: `${currentTask.name} + ${nextTask.name}`,
            description: `${currentTask.taskDate} (will make both tasks unsequential and linked)`,
            date: currentTask.taskDate,
            position: i
          });
          
          i += 2; // Skip both tasks
          continue;
        }
      }
      
      // Check if this task is sequential and part of a group with the next task
      if (currentTask.dependentOnPrevious && i + 1 < sortedTargetTasks.length) {
        // Check if next task is also sequential and consecutive
        const nextTask = sortedTargetTasks[i + 1];
        if (nextTask.dependentOnPrevious) {
          // Check if they're consecutive (same or next day)
          const currDate = new Date(currentTask.taskDate);
          const nextDate = new Date(nextTask.taskDate);
          const dayDiff = (nextDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24);
          
          if (dayDiff <= 1) {
            // Collect consecutive sequential tasks
            const sequentialGroup = [currentTask];
            let j = i + 1;
            
            while (j < sortedTargetTasks.length && sortedTargetTasks[j].dependentOnPrevious) {
              const prevDate = new Date(sortedTargetTasks[j-1].taskDate);
              const currTaskDate = new Date(sortedTargetTasks[j].taskDate);
              const dayDifference = (currTaskDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
              
              if (dayDifference <= 1) {
                sequentialGroup.push(sortedTargetTasks[j]);
                j++;
              } else {
                break;
              }
            }
            
            // Create option for this sequential group
            options.push({
              type: 'sequential-group',
              tasks: sequentialGroup,
              names: sequentialGroup.map(t => t.name),
              name: sequentialGroup.map(t => t.name).join(", "),
              description: 'Sequential tasks (will make first linked task sequential)',
              date: sequentialGroup[0].taskDate,
              position: i
            });
            
            i = j;
            continue;
          }
        }
      }
      
      // Single task (either sequential or unsequential)
      if (currentTask.dependentOnPrevious) {
        options.push({
          type: 'sequential-single',
          task: currentTask,
          name: currentTask.name,
          description: 'Sequential task (will make first linked task sequential)',
          date: currentTask.taskDate,
          position: i
        });
      } else {
        options.push({
          type: 'unsequential',
          task: currentTask,
          name: currentTask.name,
          description: `${currentTask.taskDate} (will make all linked tasks unsequential)`,
          date: currentTask.taskDate,
          position: i
        });
      }
      
      i++;
    }
    
    return options;
  };

  // Handle position choice from dialog (replaces handleLinkDateChoice for new UI)
  const handlePositionChoice = (selectedOption: any) => {
    console.log('🎯 Position choice made:', selectedOption);
    console.log('🎯 pendingFormData:', pendingFormData);
    console.log('🎯 linkingOptions:', linkingOptions);
    
    setShowLinkDateDialog(false);
    
    if (pendingFormData && linkingOptions) {
      // Process the linking with the chosen position
      console.log('🎯 Processing link with chosen position:', selectedOption);
      processTaskEditWithPosition(pendingFormData, selectedOption);
    } else {
      console.log('🎯 ERROR: Missing pendingFormData or linkingOptions');
      console.log('🎯 pendingFormData exists:', !!pendingFormData);
      console.log('🎯 linkingOptions exists:', !!linkingOptions);
    }
    
    setLinkingOptions(null);
    setPendingFormData(null);
  };

  // Process task edit with chosen position for linking
  const processTaskEditWithPosition = (data: any, selectedOption: any) => {
    console.log('processTaskEditWithPosition called with:', { data, selectedOption });
    
    const linkedTasks = (existingTasks as any[]).filter((t: any) => 
      data.linkedTaskIds?.includes((t.taskId || t.id).toString())
    );
    
    console.log('Linked tasks found:', linkedTasks);
    
    if (linkedTasks.length > 0) {
      // Create new linked group or use existing one from any of the linked tasks
      const linkedTaskGroup = linkedTasks.find(t => t.linkedTaskGroup)?.linkedTaskGroup || generateLinkedTaskGroupId();
      console.log('Using linked task group:', linkedTaskGroup);
      
      // Get all tasks to be updated (current task + linked tasks)
      const allTasksToUpdate = [task, ...linkedTasks];
      console.log('All tasks to update:', allTasksToUpdate.map(t => t.name));
      
      // Determine the base date and sequential status based on position choice
      let baseDate = selectedOption.date;
      let makeSequential = false;
      
      if (selectedOption.type === 'sequential-group' || selectedOption.type === 'sequential-single') {
        // Position with sequential tasks - make first linked task sequential
        makeSequential = true;
        baseDate = selectedOption.date;
      } else if (selectedOption.type === 'unsequential' || selectedOption.type === 'special-unsequential-pair') {
        // Position with unsequential task or special pair - make all linked tasks unsequential
        makeSequential = false;
        baseDate = selectedOption.date;
      }
      
      console.log('Linking configuration:', { baseDate, makeSequential, linkedTaskGroup });
      
      // CRITICAL: Get the order value of the chosen position to place linked tasks there
      const chosenPositionOrder = selectedOption.type === 'sequential-group' 
        ? parseFloat(selectedOption.tasks[0].order || 0)  // Use first task's order in group
        : parseFloat(selectedOption.task?.order || selectedOption.tasks?.[0]?.order || 0);
      
      console.log('Chosen position order:', chosenPositionOrder, 'from option:', selectedOption);
      
      // Sort all tasks to update by their original order to determine which should be first
      const sortedTasksToUpdate = [...allTasksToUpdate].sort((a, b) => {
        const aOrder = parseFloat(String(a.order || 0));
        const bOrder = parseFloat(String(b.order || 0));
        return aOrder - bOrder;
      });
      
      // Update all tasks with the chosen position data AND move them to chosen position
      // Map sortedTasksToUpdate to get their index in sorted order
      const tasksToUpdate = sortedTasksToUpdate.map((taskToUpdate, sortedIndex) => {
        // Find if this is the first task in the sorted linked group
        const isFirstInGroup = sortedIndex === 0;
        
        // Calculate the new order for this task at the chosen position
        // CRITICAL: Use sortedIndex to preserve original task order (earlier tasks get lower order values)
        // Place linked tasks at the chosen position (e.g., if position order is 6.00, tasks become 6.00, 6.01, 6.02...)
        const newOrder = chosenPositionOrder + (sortedIndex * 0.01);
        
        if (taskToUpdate === task || (taskToUpdate.taskId || taskToUpdate.id) === (task.taskId || task.id)) {
          // Current task being edited
          const updatedTask = {
            ...task,
            ...data,
            taskDate: baseDate,
            linkedTaskGroup: linkedTaskGroup,
            dependentOnPrevious: makeSequential && isFirstInGroup, // Only first task in group can be sequential
            order: newOrder  // CRITICAL: Move to chosen position
          };
          console.log('Updated main task:', updatedTask.name, 'new order:', newOrder, 'isFirst:', isFirstInGroup);
          return updatedTask;
        } else {
          // Linked task
          const updatedLinkedTask = {
            ...taskToUpdate,
            linkedTaskGroup: linkedTaskGroup,
            taskDate: baseDate,
            dependentOnPrevious: makeSequential && isFirstInGroup, // Only first task in group can be sequential
            order: newOrder  // CRITICAL: Move to chosen position
          };
          console.log('Updated linked task:', updatedLinkedTask.name, 'new order:', newOrder, 'isFirst:', isFirstInGroup);
          return updatedLinkedTask;
        }
      });
      
      const mainTask = tasksToUpdate.find(t => t === task || (t.taskId || t.id) === (task.taskId || task.id));
      const updatedTasks = tasksToUpdate.filter(t => t !== task && (t.taskId || t.id) !== (task.taskId || task.id));
      
      console.log('Submitting updates:', { mainTask, updatedTasks });
      
      // CRITICAL: Apply sequential realignment after linking to update downstream tasks
      const allTasksWithUpdates = [...(locationTasks || [])];
      
      // Update the tasks with linking changes
      [mainTask, ...updatedTasks].forEach(updatedTask => {
        const existingIndex = allTasksWithUpdates.findIndex(t => 
          (t.taskId || t.id) === (updatedTask.taskId || updatedTask.id)
        );
        if (existingIndex >= 0) {
          allTasksWithUpdates[existingIndex] = updatedTask;
        }
      });
      
      // Sort by order and apply FULL realignment when tasks move positions
      allTasksWithUpdates.sort((a, b) => (a.order || 0) - (b.order || 0));
      console.log('🔄 REALIGNING: ALL sequential tasks after position-based linking');
      
      // CRITICAL: When tasks move to a new position, realign from the START to fix gaps
      // Find the first sequential task and use it as the anchor for full realignment
      const firstSequentialTask = allTasksWithUpdates.find(t => t.dependentOnPrevious);
      const realignedTasks = firstSequentialTask 
        ? realignDependentTasksAfter(allTasksWithUpdates, firstSequentialTask.taskId || firstSequentialTask.id)
        : allTasksWithUpdates;
      
      // Find all tasks that changed (linking + realignment)
      const finalTasksToUpdate = realignedTasks.filter(task => {
        const originalTask = (locationTasks || []).find(orig => 
          (orig.taskId || orig.id) === (task.taskId || task.id)
        );
        return !originalTask || 
               originalTask.taskDate !== task.taskDate ||
               originalTask.linkedTaskGroup !== task.linkedTaskGroup ||
               originalTask.dependentOnPrevious !== task.dependentOnPrevious ||
               originalTask.order !== task.order;
      });
      
      console.log('Simple linking - final updates with realignment:', finalTasksToUpdate.map(t => ({ 
        name: t.name, date: t.taskDate, sequential: t.dependentOnPrevious 
      })));
      
      // Submit the updates using batch mutation
      batchUpdateTasksMutation.mutate(finalTasksToUpdate);
    } else {
      console.log('No linked tasks found to process');
    }
  };

  const handleLinkDateChoice = (chosenDate: string) => {
    console.log('Link date choice made:', chosenDate);
    if (!linkingOptions || !pendingFormData) {
      console.log('Missing linkingOptions or pendingFormData');
      return;
    }
    
    // Immediately close the dialog and clear state to prevent reopening
    setShowLinkDateDialog(false);
    const savedLinkingOptions = linkingOptions;
    const savedFormData = pendingFormData;
    setLinkingOptions(null);
    setPendingFormData(null);
    
    // Process the linking directly without going through processFormSubmission again
    // This prevents the dialog from reopening
    console.log('Processing link with chosen date:', chosenDate);
    
    // Handle both single task and multi-task linking
    const linkedTasks = (existingTasks as any[]).filter((t: any) => 
      savedFormData.linkedTaskIds?.includes((t.taskId || t.id).toString())
    );
    
    if (linkedTasks.length > 0) {
      // Create new linked group or use existing one from any of the linked tasks
      const linkedTaskGroup = linkedTasks.find(t => t.linkedTaskGroup)?.linkedTaskGroup || generateLinkedTaskGroupId();
      
      // Get all tasks to be updated (current task + linked tasks)
      const allTasksToUpdate = [task, ...linkedTasks];
      
      // Get all other tasks for chronological positioning
      const allOtherTasks = (existingTasks as any[]).filter((t: any) => 
        !allTasksToUpdate.some(linkTask => (linkTask.taskId || linkTask.id) === (t.taskId || t.id))
      );
      
      // Find the correct chronological position based on the chosen date
      // Sort all other tasks by date and order to find insertion point
      const sortedOtherTasks = allOtherTasks.sort((a, b) => {
        const dateA = new Date(a.taskDate).getTime();
        const dateB = new Date(b.taskDate).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return (a.order || 0) - (b.order || 0);
      });
      
      // Find where to insert the linked group based on chosen date
      let insertionOrder = 0;
      for (let i = 0; i < sortedOtherTasks.length; i++) {
        const otherTask = sortedOtherTasks[i];
        const otherDate = new Date(otherTask.taskDate).getTime();
        const chosenDateTime = new Date(chosenDate).getTime();
        
        if (otherDate < chosenDateTime) {
          insertionOrder = (otherTask.order || 0) + 1;
        } else if (otherDate === chosenDateTime) {
          // Same date - insert after this task
          insertionOrder = (otherTask.order || 0) + 1;
        } else {
          // Future date - insert before this task
          break;
        }
      }
      
      // Sort the linked tasks by their original order to maintain relative positioning
      const sortedByOrder = allTasksToUpdate.sort((a, b) => (a.order || 0) - (b.order || 0));
      
      // Create updated tasks array with consecutive ordering starting from insertion point
      const tasksToUpdate = sortedByOrder.map((taskToUpdate, index) => {
        const isFirstTask = index === 0; // First in the linked group
        
        if (taskToUpdate === task) {
          // Current task being edited
          return {
            ...task,
            ...savedFormData,
            taskDate: chosenDate,
            linkedTaskGroup: linkedTaskGroup,
            order: insertionOrder + index, // Consecutive ordering from insertion point
            dependentOnPrevious: isFirstTask ? (task.dependentOnPrevious || false) : false
          };
        } else {
          // Linked tasks
          return {
            ...taskToUpdate,
            taskDate: chosenDate,
            linkedTaskGroup: linkedTaskGroup,
            order: insertionOrder + index, // Consecutive ordering from insertion point
            dependentOnPrevious: isFirstTask ? taskToUpdate.dependentOnPrevious : false // Only first task keeps sequential status
          };
        }
      });
      
      // Shift other tasks that come after the insertion point to make room
      const tasksToShift = allOtherTasks.filter(t => (t.order || 0) >= insertionOrder);
      const shiftedTasks = tasksToShift.map(t => ({
        ...t,
        order: (t.order || 0) + allTasksToUpdate.length // Shift by number of linked tasks
      }));
      
      // After positioning, recalculate sequential dates for all tasks
      const allTasksWithNewOrder = [...tasksToUpdate, ...shiftedTasks];
      
      // Sort all tasks by their new order to recalculate sequential dates
      const sortedAllTasks = [...(existingTasks as any[])];
      
      // Update the tasks in the sorted list with new values
      allTasksWithNewOrder.forEach(updatedTask => {
        const existingIndex = sortedAllTasks.findIndex(t => 
          (t.taskId || t.id) === (updatedTask.taskId || updatedTask.id)
        );
        if (existingIndex >= 0) {
          sortedAllTasks[existingIndex] = updatedTask;
        }
      });
      
      // Sort by order to process sequential dependencies
      sortedAllTasks.sort((a, b) => (a.order || 0) - (b.order || 0));
      
      // CRITICAL: Use targeted realignment to only shift tasks after the modified one
      console.log('🔄 REALIGNING: Sequential tasks after linking in EditTaskModal');
      const realignedTasks = realignDependentTasksAfter(sortedAllTasks, task.taskId || task.id);
      
      // Update the sorted tasks with realigned dates
      realignedTasks.forEach((realignedTask, index) => {
        if (index < sortedAllTasks.length) {
          sortedAllTasks[index] = realignedTask;
        }
      });
      
      // Find all tasks that were modified (either directly updated or had dates recalculated)
      const finalTasksToUpdate = sortedAllTasks.filter(task => {
        const originalTask = (existingTasks as any[]).find(t => 
          (t.taskId || t.id) === (task.taskId || task.id)
        );
        return !originalTask || 
               originalTask.taskDate !== task.taskDate ||
               originalTask.order !== task.order ||
               originalTask.linkedTaskGroup !== task.linkedTaskGroup ||
               originalTask.dependentOnPrevious !== task.dependentOnPrevious;
      });
      
      console.log('Multi-task linking - final updates with sequential dates:', finalTasksToUpdate.map(t => ({ name: t.name, date: t.taskDate, order: t.order, sequential: t.dependentOnPrevious })));
      console.log('Insertion order:', insertionOrder, 'Chosen date:', chosenDate);
      
      // Update tasks using batch mutation
      console.log('Submitting multi-task linking updates with sequential date fixes');
      batchUpdateTasksMutation.mutate(finalTasksToUpdate);
    }
  };

  const processFormSubmission = (data: any) => {
    console.log('🔗 processFormSubmission called with data:', data);
    console.log('🔗 Task linkedTaskGroup:', task.linkedTaskGroup);
    console.log('🔗 data.linkToExistingTask:', data.linkToExistingTask);
    
    // Update cost code based on task type
    const TASK_TYPE_TO_COST_CODE = {
      "Traffic Control": "TRAFFIC",
      "Demo/Ex": "Demo/Ex + Base/Grading",
      "Base/Grading": "Demo/Ex + Base/Grading", 
      "Demo/Ex + Base/Grading": "Demo/Ex + Base/Grading",
      "Form": "CONCRETE",
      "Pour": "CONCRETE",
      "Form + Pour": "CONCRETE",
      "Asphalt": "AC",
      "General Labor": "GENERAL LABOR",
      "Landscaping": "LANDSCAPE", 
      "Utility Adjustment": "UTILITY ADJ",
      "Punchlist Demo": "PUNCHLIST DEMO",
      "Punchlist Concrete": "PUNCHLIST CONCRETE",
      "Punchlist General Labor": "PUNCHLIST GENERAL LABOR"
    };
    
    let processedData = {
      ...task, // Keep all existing task data
      ...data, // Override with edited fields only
      // Update cost code if task type changed
      costCode: TASK_TYPE_TO_COST_CODE[data.taskType as keyof typeof TASK_TYPE_TO_COST_CODE] || data.taskType
    };
    
    // Handle the date change action that was set by the dialog
    if (dateChangeAction === 'unsequential_shift_others') {
      // User chose to make non-sequential and shift others
      processedData.dependentOnPrevious = false;
    } else if (dateChangeAction === 'unsequential_move_only') {
      // User chose to make non-sequential and just move the task
      processedData.dependentOnPrevious = false;
    }
    // For 'sequential', keep the existing dependency status

    // Early variable declarations
    const dateChanged = data.taskDate !== task.taskDate;
    const dependencyChanged = data.dependentOnPrevious !== task.dependentOnPrevious;
    
    console.log('🔍 CHANGE DETECTION:', {
      taskId: task.taskId || task.id,
      taskName: task.name,
      dateChanged,
      dependencyChanged,
      oldDate: task.taskDate,
      newDate: data.taskDate,
      oldDependency: task.dependentOnPrevious,
      newDependency: data.dependentOnPrevious
    });
    
    // Handle linking changes
    let linkingChanged = data.linkToExistingTask !== !!task.linkedTaskGroup;
    
    // CRITICAL: If task is already linked, and user just changed the date (not the linking), 
    // we should NOT show position dialog - just update all linked tasks to the new date
    const isAlreadyLinked = task.linkedTaskGroup && data.linkToExistingTask && data.linkedTaskIds && data.linkedTaskIds.length > 0;
    const isNewLinking = !task.linkedTaskGroup && data.linkToExistingTask && data.linkedTaskIds && data.linkedTaskIds.length > 0;
    
    console.log('🔗 Linking status analysis:', {
      wasLinked: !!task.linkedTaskGroup,
      wantsToLink: data.linkToExistingTask,
      hasLinkedTaskIds: data.linkedTaskIds && data.linkedTaskIds.length > 0,
      isAlreadyLinked,
      isNewLinking,
      linkingChanged,
      dateChanged
    });
    
    if (isNewLinking) {
      // LINKING TO MULTIPLE TASKS (NEW LINKING)
      const linkedTasks = (existingTasks as any[]).filter((t: any) => 
        data.linkedTaskIds!.includes((t.taskId || t.id).toString())
      );
      if (linkedTasks.length > 0) {
        // Collect all available dates from selected tasks plus current task
        const allTasks = [task, ...linkedTasks];
        const availableDates = allTasks.map(t => ({
          date: t.taskDate,
          taskName: t.name
        }));
        
        // Remove duplicates by date
        const uniqueDates = availableDates.filter((item, index, self) => 
          self.findIndex(d => d.date === item.date) === index
        );
        
        // Check for special case: non-consecutive task (not first) + sequential task after it
        const allTasksSorted = [task, ...linkedTasks].sort((a, b) => (parseFloat(a.order) || 0) - (parseFloat(b.order) || 0));
        
        console.log('🔍 ALL TASKS SORTED FOR LINKING:', allTasksSorted.map(t => ({
          name: t.name,
          order: t.order,
          orderParsed: parseFloat(t.order) || 0,
          sequential: t.dependentOnPrevious
        })));
        
        if (allTasksSorted.length === 2) {
          const firstTask = allTasksSorted[0];
          const secondTask = allTasksSorted[1];
          
          // Check if tasks are adjacent (no tasks between them by order)
          const firstTaskOrder = parseFloat(firstTask.order) || 0;
          const secondTaskOrder = parseFloat(secondTask.order) || 0;
          const isConsecutiveOrder = secondTaskOrder === firstTaskOrder + 1;
          
          // Check if current task has new date from form (using formData passed through)
          const currentTaskWithNewDate = data.taskDate !== task.taskDate;
          const newDateToUse = data.taskDate;
          
          console.log('🔍 LINKING DEBUG - Task details:', {
            firstTask: { name: firstTask.name, order: firstTaskOrder, sequential: firstTask.dependentOnPrevious },
            secondTask: { name: secondTask.name, order: secondTaskOrder, sequential: secondTask.dependentOnPrevious },
            isConsecutiveOrder,
            orderDifference: secondTaskOrder - firstTaskOrder,
            currentTaskHasNewDate: currentTaskWithNewDate,
            newDate: newDateToUse,
            formDataSequential: data.dependentOnPrevious
          });
          
          // Special case 1: Adjacent tasks + both sequential - auto-link as sequential
          const isBothSequential = firstTask.dependentOnPrevious && secondTask.dependentOnPrevious;
          
          console.log('🔍 SPECIAL CASE CHECK:', {
            isBothSequential,
            isConsecutiveOrder,
            shouldAutoLink: isBothSequential && isConsecutiveOrder
          });
          
          // Check for unsequential with date change
          const isOneUnsequentialWithDateChange = (!firstTask.dependentOnPrevious || !secondTask.dependentOnPrevious) && currentTaskWithNewDate && !data.dependentOnPrevious;
          
          if (isConsecutiveOrder && isOneUnsequentialWithDateChange) {
            console.log('🔗 SPECIAL CASE: Adjacent tasks + one unsequential with date change - auto-linking as unsequential at new date');
            
            // Auto-link them as unsequential at the new date
            const linkedTaskGroup = generateLinkedTaskGroupId();
            const targetDate = newDateToUse;
            
            const tasksToUpdate = allTasksSorted.map(taskToUpdate => ({
              ...taskToUpdate,
              linkedTaskGroup: linkedTaskGroup,
              taskDate: targetDate,
              dependentOnPrevious: false // Both become unsequential
            }));
            
            console.log('Unsequential with date change auto-linking:', tasksToUpdate.map(t => ({ 
              name: t.name, 
              date: t.taskDate, 
              sequential: t.dependentOnPrevious 
            })));
            
            const allTasks = [...(existingTasks as any[])];
            
            tasksToUpdate.forEach(updatedTask => {
              const existingIndex = allTasks.findIndex(t => 
                (t.taskId || t.id) === (updatedTask.taskId || updatedTask.id)
              );
              if (existingIndex >= 0) {
                allTasks[existingIndex] = {
                  ...allTasks[existingIndex],
                  linkedTaskGroup: updatedTask.linkedTaskGroup,
                  taskDate: updatedTask.taskDate,
                  dependentOnPrevious: updatedTask.dependentOnPrevious
                };
              }
            });
            
            allTasks.sort((a, b) => (a.order || 0) - (b.order || 0));
            
            console.log('🔧 Using targeted realignment for linking task updates');
            const realignedTasks = realignDependentTasksAfter(allTasks, task.taskId || task.id);
            
            const finalTasksToUpdate = realignedTasks.filter(task => {
              const originalTask = (existingTasks as any[]).find(t => 
                (t.taskId || t.id) === (task.taskId || task.id)
              );
              return !originalTask || 
                     originalTask.taskDate !== task.taskDate ||
                     originalTask.linkedTaskGroup !== task.linkedTaskGroup ||
                     originalTask.dependentOnPrevious !== task.dependentOnPrevious ||
                     originalTask.order !== task.order;
            });
            
            console.log('Final linking updates (unsequential with date change):', finalTasksToUpdate.map(t => ({ 
              name: t.name, 
              date: t.taskDate, 
              sequential: t.dependentOnPrevious 
            })));
            
            batchUpdateTasksMutation.mutate(finalTasksToUpdate);
            return;
          }
          
          if (isBothSequential && isConsecutiveOrder) {
            console.log('🔗 SPECIAL CASE: Both sequential adjacent tasks - auto-linking (first sequential, second unsequential)');
            
            // Auto-link them at the first task's date
            const linkedTaskGroup = generateLinkedTaskGroupId();
            const targetDate = firstTask.taskDate;
            
            const tasksToUpdate = allTasksSorted.map((taskToUpdate, index) => ({
              ...taskToUpdate,
              linkedTaskGroup: linkedTaskGroup,
              taskDate: targetDate,
              // First task stays sequential, second becomes unsequential (linked on same date)
              dependentOnPrevious: index === 0 ? true : false
            }));
            
            console.log('Both sequential case auto-linking:', tasksToUpdate.map(t => ({ 
              name: t.name, 
              date: t.taskDate, 
              sequential: t.dependentOnPrevious 
            })));
            
            // CRITICAL: After linking tasks, we need to realign subsequent sequential tasks
            const allTasks = [...(existingTasks as any[])];
            
            // Update the linked tasks in the full task list
            tasksToUpdate.forEach(updatedTask => {
              const existingIndex = allTasks.findIndex(t => 
                (t.taskId || t.id) === (updatedTask.taskId || updatedTask.id)
              );
              if (existingIndex >= 0) {
                allTasks[existingIndex] = {
                  ...allTasks[existingIndex],
                  linkedTaskGroup: updatedTask.linkedTaskGroup,
                  taskDate: updatedTask.taskDate,
                  dependentOnPrevious: updatedTask.dependentOnPrevious
                };
              }
            });
            
            allTasks.sort((a, b) => (a.order || 0) - (b.order || 0));
            
            console.log('🔧 Using targeted realignment for linking task updates');
            const realignedTasks = realignDependentTasksAfter(allTasks, task.taskId || task.id);
            
            const finalTasksToUpdate = realignedTasks.filter(task => {
              const originalTask = (existingTasks as any[]).find(t => 
                (t.taskId || t.id) === (task.taskId || task.id)
              );
              return !originalTask || 
                     originalTask.taskDate !== task.taskDate ||
                     originalTask.linkedTaskGroup !== task.linkedTaskGroup ||
                     originalTask.dependentOnPrevious !== task.dependentOnPrevious ||
                     originalTask.order !== task.order;
            });
            
            console.log('Final linking updates (both sequential):', finalTasksToUpdate.map(t => ({ 
              name: t.name, 
              date: t.taskDate, 
              sequential: t.dependentOnPrevious 
            })));
            
            batchUpdateTasksMutation.mutate(finalTasksToUpdate);
            return;
          }
          
        }
        
        // Show position dialog for other linking cases
        console.log('🔗 Linking tasks - showing position choice dialog');
        console.log('🔗 Current task:', task.name);
        console.log('🔗 Linked tasks:', linkedTasks.map(t => t.name));
        console.log('🔗 Form data being stored:', data);
        
        const linkingOptionsData = {
          currentTask: task,
          targetTasks: linkedTasks,
          availableDates: [], // No longer used, but keeping for compatibility
          formData: data // CRITICAL: Pass form data to use updated task date/sequential status
        };
        
        console.log('🔗 Setting linking options:', linkingOptionsData);
        console.log('🔗 Form data being passed:', { taskDate: data.taskDate, dependentOnPrevious: data.dependentOnPrevious });
        setLinkingOptions(linkingOptionsData);
        setShowLinkDateDialog(true);
        setPendingFormData(data);
        console.log('🔗 Dialog should now be visible');
        return;
      }
    } else if (isAlreadyLinked && dateChanged) {
      // EXISTING LINKED TASK - DATE CHANGE ONLY
      console.log('🔗 Task is already linked, just updating date for all linked tasks');
      
      // Don't show position dialog - just update all linked tasks to the new date
      // This will be handled in the cascading updates section below
      linkingChanged = false; // Don't treat this as a linking change
      
    } else if (!data.linkToExistingTask && task.linkedTaskGroup) {
      // UNLINKING FROM GROUP
      console.log('🔗 ENTERING UNLINKING LOGIC');
      console.log('🔗 Task linkedTaskGroup:', task.linkedTaskGroup);
      console.log('🔗 skipUnlinkDialog:', skipUnlinkDialog);
      
      const groupTasks = (existingTasks as any[]).filter((t: any) => 
        t.linkedTaskGroup === task.linkedTaskGroup && (t.taskId || t.id) !== (task.taskId || task.id)
      );
      
      console.log('🔗 Found group tasks:', groupTasks.length, groupTasks.map(t => t.name));
      console.log('🔗 UNLINKING DEBUG:', { 
        groupTasksLength: groupTasks.length, 
        skipUnlinkDialog, 
        taskName: task.name,
        taskOrder: task.order 
      });
      
      if (groupTasks.length >= 2 && !skipUnlinkDialog) {
        // Multi-task group (3+ tasks) - show unlink dialog (unless user already chose to skip it)
        setUnlinkingGroupSize(groupTasks.length + 1); // +1 for current task
        setShowUnlinkDialog(true);
        setPendingFormData(data);
        return;
      } else if (skipUnlinkDialog && groupTasks.length >= 1) {
        // User chose "Just unlink this task" - only unlink current task
        console.log('🔗 JUST UNLINKING CURRENT TASK - maintaining current position');
        processedData.linkedTaskGroup = null;
        
        // CRITICAL: Task stays in current position and becomes sequential unless it's first
        processedData.dependentOnPrevious = task.order === 0 ? false : true;
        
        // Mark that linking has changed to trigger downstream updates
        linkingChanged = true;
      } else if (groupTasks.length === 1) {
        // Two-task group - auto-unlink both tasks directly
        console.log('🔗 TWO-TASK GROUP - auto-unlinking both tasks');
        const otherTask = groupTasks[0];
        
        // Check if ANY task in the linked group was sequential
        // (When linking sequential tasks, first stays sequential, second becomes unsequential)
        const anyWasSequential = task.dependentOnPrevious || otherTask.dependentOnPrevious;
        
        console.log('🔗 UNLINKING DEBUG:', {
          taskName: task.name,
          taskSequential: task.dependentOnPrevious,
          otherTaskName: otherTask.name,
          otherTaskSequential: otherTask.dependentOnPrevious,
          anyWasSequential
        });
        
        // Sort by order to identify first and second task
        const firstTask = (task.order || 0) < (otherTask.order || 0) ? task : otherTask;
        const secondTask = (task.order || 0) < (otherTask.order || 0) ? otherTask : task;
        
        // If making sequential, calculate date for second task
        let secondTaskDate = secondTask.taskDate;
        if (anyWasSequential) {
          // Calculate next day after first task
          const baseDate = new Date(firstTask.taskDate + 'T00:00:00');
          const nextDate = new Date(baseDate);
          nextDate.setDate(nextDate.getDate() + 1);
          // Skip weekends
          while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
            nextDate.setDate(nextDate.getDate() + 1);
          }
          secondTaskDate = nextDate.toISOString().split('T')[0];
        }
        
        const bothTasks = [
          {
            ...firstTask,
            linkedTaskGroup: null,
            // If any was sequential, both become sequential (restore sequential workflow)
            // If none were sequential, first task (order 0) stays non-sequential, others become sequential
            dependentOnPrevious: anyWasSequential 
              ? true 
              : ((firstTask.order === 0 || firstTask.order === '0' || parseFloat(String(firstTask.order)) === 0) ? false : true),
            order: firstTask.order
          },
          {
            ...secondTask,
            linkedTaskGroup: null,
            dependentOnPrevious: true, // Second task always becomes sequential
            taskDate: secondTaskDate, // Updated date when made sequential
            order: secondTask.order
          }
        ];
        
        console.log('🔗 UNLINKING (preserving order):', bothTasks.map(t => ({
          name: t.name,
          order: t.order,
          sequential: t.dependentOnPrevious
        })));
        
        // Trigger cascading for all subsequent tasks  
        const allTasks = [...(existingTasks as any[])];
        
        // Update the unlinked tasks - keeping same order
        bothTasks.forEach(updatedTask => {
          const existingIndex = allTasks.findIndex(t => 
            (t.taskId || t.id) === (updatedTask.taskId || updatedTask.id)
          );
          if (existingIndex >= 0) {
            allTasks[existingIndex] = {
              ...allTasks[existingIndex],
              linkedTaskGroup: null,
              dependentOnPrevious: updatedTask.dependentOnPrevious
              // DON'T change order - keep it exactly as is
            };
          }
        });
        
        // Use targeted realignment to only shift dates for subsequent sequential tasks
        console.log('🔧 Using targeted realignment for two-task unlink (dates only, not order)');
        const realignedTasks = realignDependentTasksAfter(allTasks, task.taskId || task.id);
        
        // Find tasks that changed (dates or linking status, NOT order)
        const finalTasksToUpdate = realignedTasks.filter(task => {
          const originalTask = (existingTasks as any[]).find(t => 
            (t.taskId || t.id) === (task.taskId || task.id)
          );
          return !originalTask || 
                 originalTask.taskDate !== task.taskDate ||
                 originalTask.linkedTaskGroup !== task.linkedTaskGroup ||
                 originalTask.dependentOnPrevious !== task.dependentOnPrevious;
          // DON'T include order in change detection - we're not changing it!
        });
        
        console.log('🔗 Two-task unlink updates (order preserved):', finalTasksToUpdate.map(t => ({ 
          name: t.name, 
          date: t.taskDate,
          order: t.order,
          sequential: t.dependentOnPrevious 
        })));
        
        batchUpdateTasksMutation.mutate(finalTasksToUpdate);
        return;
      } else {
        // Regular unlinking logic for other cases
        processedData.linkedTaskGroup = null;
        
        // Check if current task is first task overall - first task must stay unsequential
        const allTasksSorted = (existingTasks as any[]).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
        const isCurrentTaskFirst = task.order === 0 || (allTasksSorted.length > 0 && allTasksSorted[0].id === task.id);
        
        if (isCurrentTaskFirst) {
          processedData.dependentOnPrevious = false;
          console.log('Current task is first overall - keeping unsequential');
        } else {
          // Make this task sequential to maintain its current visual position
          // It should follow the task that comes immediately before it in the linked group
          processedData.dependentOnPrevious = true;
          
          // Calculate the proper date for this unlinked task - it should be sequential to the Demo/Ex task
          // Find the task that should be the "previous" task (the linked group it's leaving)
          const remainingLinkedTasks = groupTasks.filter(t => t.linkedTaskGroup === task.linkedTaskGroup);
          if (remainingLinkedTasks.length > 0) {
            // Sort remaining linked tasks by order to find which one should be the predecessor
            const sortedLinkedTasks = remainingLinkedTasks.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
            const predecessorTask = sortedLinkedTasks[0]; // Use the first task in the linked group as predecessor
            
            // Calculate next working day from the predecessor task
            const baseDate = new Date(predecessorTask.taskDate + 'T00:00:00');
            const nextDate = new Date(baseDate);
            nextDate.setDate(nextDate.getDate() + 1);
            // Skip weekends
            while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
              nextDate.setDate(nextDate.getDate() + 1);
            }
            const sequentialDate = nextDate.toISOString().split('T')[0];
            
            processedData.taskDate = sequentialDate;
            console.log('🔗 UNLINK POSITION: Task will be sequential to', predecessorTask.name, 'with date:', sequentialDate);
          }
          
          console.log('Current task will be sequential to maintain its current position after the linked group');
        }
        
        // Mark that linking has changed to trigger downstream updates
        linkingChanged = true;
      }
    } else if (task.linkedTaskGroup && dependencyChanged) {
      // LINKED TASK SEQUENTIAL STATUS CHANGE - sync with partner task
      console.log('Linked task sequential status changed - syncing partner');
      linkingChanged = true; // Use this flag to trigger partner update
    }

    // Handle actualHours based on status
    if (data.status === "complete") {
      // If marking as complete, set actualHours to scheduledHours if not already set
      processedData.actualHours = task.actualHours || task.scheduledHours;
    } else {
      // If not complete, clear actualHours
      processedData.actualHours = null;
    }

    // FIRST TASK ENFORCEMENT - Always make first task unsequential
    const sortedTasks = (existingTasks as any[]) ? [...(existingTasks as any[])].sort((a: any, b: any) => (a.order || 0) - (b.order || 0)) : [];
    const isFirstTask = task.order === 0 || (sortedTasks.length > 0 && (sortedTasks[0].taskId || sortedTasks[0].id) === (task.taskId || task.id));
    
    if (isFirstTask) {
      console.log('🔗 Enforcing first task rule: making first task unsequential', {
        taskId: task.taskId || task.id,
        taskOrder: task.order,
        originalDependency: processedData.dependentOnPrevious,
        forcingToFalse: true
      });
      processedData.dependentOnPrevious = false;
      // Force the form value too to ensure UI updates
      form.setValue('dependentOnPrevious', false);
    } else {
      console.log('🔗 Task is not first, keeping sequential status:', {
        taskId: task.taskId || task.id,
        taskOrder: task.order,
        sequentialStatus: processedData.dependentOnPrevious
      });
    }
    
    if ((dateChanged || linkingChanged || dependencyChanged) && locationTasks && locationTasks.length > 0) {
      console.log('Task changes require cascading updates');
      
      let allUpdatedTasks = [...locationTasks];
      
      // Update the main task first
      const mainTaskIndex = allUpdatedTasks.findIndex(t => (t.taskId || t.id) === (task.taskId || task.id));
      if (mainTaskIndex >= 0) {
        allUpdatedTasks[mainTaskIndex] = { ...allUpdatedTasks[mainTaskIndex], ...processedData };
      }

      // Handle new linking - update all linked tasks based on their sequence position
      if (data.linkToExistingTask && data.linkedTaskIds && data.linkedTaskIds.length > 0 && linkingChanged) {
        const linkedTaskIndices = data.linkedTaskIds.map((taskId: string) => 
          allUpdatedTasks.findIndex((t: any) => (t.taskId || t.id).toString() === taskId)
        ).filter((index: number) => index >= 0);
        
        // Process each linked task
        linkedTaskIndices.forEach((linkedTaskIndex: number) => {
        if (linkedTaskIndex >= 0) {
          const linkedTaskGroup = processedData.linkedTaskGroup;
          const linkedTask = allUpdatedTasks[linkedTaskIndex];
          const currentTask = allUpdatedTasks[mainTaskIndex];
          
          // Sort tasks chronologically to determine proper first/second task
          const sortedTasks = [...allUpdatedTasks].sort((a, b) => {
            const dateA = new Date(a.taskDate).getTime();
            const dateB = new Date(b.taskDate).getTime();
            if (dateA !== dateB) return dateA - dateB;
            return (a.order || 0) - (b.order || 0);
          });
          
          const currentSortedIndex = sortedTasks.findIndex(t => (t.taskId || t.id) === (currentTask.taskId || currentTask.id));
          const linkedSortedIndex = sortedTasks.findIndex(t => (t.taskId || t.id) === (linkedTask.taskId || linkedTask.id));
          
          // Move linked task to be adjacent to current task for better positioning
          const currentTaskOrder = currentTask.order || 0;
          const linkedTaskOrder = linkedTask.order || 0;
          
          // If tasks are not adjacent, move linked task to be next to current task
          if (Math.abs(currentTaskOrder - linkedTaskOrder) > 1) {
            console.log('Moving linked task to be adjacent to current task');
            
            // Move linked task to position right after current task
            const newLinkedOrder = currentTaskOrder + 1;
            
            // Shift other tasks to make space
            allUpdatedTasks.forEach((t, idx) => {
              if (idx !== linkedTaskIndex && idx !== mainTaskIndex) {
                if ((t.order || 0) >= newLinkedOrder) {
                  t.order = (t.order || 0) + 1;
                }
              }
            });
            
            // Update linked task order
            allUpdatedTasks[linkedTaskIndex].order = newLinkedOrder;
            
            // Re-assign order values to ensure consistency
            allUpdatedTasks.sort((a, b) => (a.order || 0) - (b.order || 0));
            allUpdatedTasks.forEach((task, index) => {
              task.order = index;
            });
          }
          
          // First task chronologically should be sequential, second should not be
          let firstTaskIndex, secondTaskIndex;
          if (currentSortedIndex < linkedSortedIndex) {
            firstTaskIndex = mainTaskIndex;
            secondTaskIndex = linkedTaskIndex;
          } else {
            firstTaskIndex = linkedTaskIndex;
            secondTaskIndex = mainTaskIndex;
          }
          
          // Calculate the proper sequential date for the first task
          let sequentialDate = allUpdatedTasks[firstTaskIndex].taskDate;
          
          const firstTaskSortedIndex = Math.min(currentSortedIndex, linkedSortedIndex);
          if (firstTaskSortedIndex > 0) {
            // Find the chronologically previous task (not from same linked group)
            let previousTaskDate = null;
            
            for (let i = firstTaskSortedIndex - 1; i >= 0; i--) {
              const prevTask = sortedTasks[i];
              
              // Skip tasks from the same linked group
              if (prevTask.linkedTaskGroup === linkedTaskGroup) {
                continue;
              }
              
              previousTaskDate = prevTask.taskDate;
              break;
            }
            
            if (previousTaskDate) {
              // Calculate next working day from previous task
              const baseDate = new Date(previousTaskDate + 'T00:00:00');
              const nextDate = new Date(baseDate);
              nextDate.setDate(nextDate.getDate() + 1);
              // Skip weekends
              while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
                nextDate.setDate(nextDate.getDate() + 1);
              }
              sequentialDate = nextDate.toISOString().split('T')[0];
              
              console.log('Calculated sequential date for first task:', sequentialDate, 'based on previous task date:', previousTaskDate);
            }
          }

          // Update both tasks with the synchronized date and proper dependencies
          allUpdatedTasks[firstTaskIndex] = {
            ...allUpdatedTasks[firstTaskIndex],
            linkedTaskGroup: linkedTaskGroup,
            dependentOnPrevious: firstTaskSortedIndex > 0, // Only sequential if not the very first task in the list
            taskDate: sequentialDate
          };
          
          allUpdatedTasks[secondTaskIndex] = {
            ...allUpdatedTasks[secondTaskIndex],
            linkedTaskGroup: linkedTaskGroup,
            dependentOnPrevious: false, // Second task chronologically is just linked, never sequential
            taskDate: sequentialDate // Both tasks get the same synchronized date
          };
          
          console.log('Updated sequential task (first chronologically):', allUpdatedTasks[firstTaskIndex].name, 'with date:', sequentialDate);
          console.log('Updated linked task (second chronologically):', allUpdatedTasks[secondTaskIndex].name, 'with date:', sequentialDate);
        }
        });
      }

      // Handle linked task sequential status sync
      if (task.linkedTaskGroup && linkingChanged && data.linkToExistingTask !== false) {
        console.log('Syncing linked task sequential status');
        
        // Find partner task and sync sequential status
        const partnerTaskIndex = allUpdatedTasks.findIndex(t => 
          t.linkedTaskGroup === task.linkedTaskGroup && (t.taskId || t.id) !== (task.taskId || task.id)
        );
        
        if (partnerTaskIndex >= 0) {
          const newSequentialStatus = processedData.dependentOnPrevious;
          console.log('Updating partner task sequential status to:', newSequentialStatus);
          
          allUpdatedTasks[partnerTaskIndex] = {
            ...allUpdatedTasks[partnerTaskIndex],
            dependentOnPrevious: newSequentialStatus
          };
        }
      }

      // Handle unlinking - different logic for "unlink all" vs "just unlink this task"
      if (!data.linkToExistingTask && task.linkedTaskGroup && linkingChanged) {
        if (skipUnlinkDialog) {
          // User chose "Just unlink this task" - special positioning logic
          console.log('🔗 JUST UNLINKING CURRENT TASK - positioning after linked group');
          
          // Find all other tasks in the linked group
          const linkedGroupTasks = allUpdatedTasks.filter(t => 
            t.linkedTaskGroup === task.linkedTaskGroup && (t.taskId || t.id) !== (task.taskId || task.id)
          );
          
          if (linkedGroupTasks.length > 0) {
            // Find the highest order task in the linked group (including all linked tasks)
            const allLinkedOrders = linkedGroupTasks.map(t => t.order || 0);
            const maxOrderInGroup = Math.max(...allLinkedOrders);
            const newOrder = maxOrderInGroup + 1;
            
            console.log('Positioning unlinked task after linked group:', {
              linkedGroupTasks: linkedGroupTasks.map(t => ({ name: t.name, order: t.order })),
              maxOrderInGroup,
              newOrder
            });
            
            // Shift all tasks after the linked group to make space
            allUpdatedTasks.forEach(t => {
              if ((t.order || 0) >= newOrder && (t.taskId || t.id) !== (task.taskId || task.id)) {
                t.order = (t.order || 0) + 1;
              }
            });
            
            // Position current task right after the linked group
            const currentTaskIndex = allUpdatedTasks.findIndex(t => (t.taskId || t.id) === (task.taskId || task.id));
            if (currentTaskIndex >= 0) {
              allUpdatedTasks[currentTaskIndex].order = newOrder;
            }
            
            // Re-sort and reassign orders
            allUpdatedTasks.sort((a, b) => (a.order || 0) - (b.order || 0));
            allUpdatedTasks.forEach((t, index) => {
              t.order = index;
            });
            
            // Make the current task sequential to the linked group
            processedData.dependentOnPrevious = true;
            
            console.log('Positioned unlinked task after linked group with sequential dependency');
          }
        } else {
          // User chose "Unlink all tasks" - maintain current visual arrangement
          console.log('🔗 UNLINKING ALL TASKS in group - maintaining current positions');
          
          // Find all tasks in the linked group (including current task)
          const allGroupTasks = [task, ...groupTasks];
          
          // Sort the group tasks by their current visual order (order field)
          // to determine which should be sequential to which
          const sortedGroupTasks = allGroupTasks.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
          
          console.log('🔗 Group tasks in visual order:', sortedGroupTasks.map(t => ({ 
            name: t.name, 
            order: t.order,
            currentDate: t.taskDate
          })));
          
          // Check if the entire group is at the very beginning of the task list
          const allTasksSorted = [...allUpdatedTasks].sort((a, b) => (a.order || 0) - (b.order || 0));
          const firstOverallTaskId = allTasksSorted[0]?.taskId || allTasksSorted[0]?.id;
          const firstGroupTaskId = sortedGroupTasks[0]?.taskId || sortedGroupTasks[0]?.id;
          const groupStartsAtBeginning = firstGroupTaskId === firstOverallTaskId;
          
          // Update all tasks in the group
          allUpdatedTasks = allUpdatedTasks.map(t => {
            if (t.linkedTaskGroup === task.linkedTaskGroup) {
              const taskId = t.taskId || t.id;
              
              // Find this task's position within the group
              const positionInGroup = sortedGroupTasks.findIndex(gt => (gt.taskId || gt.id) === taskId);
              
              // First task in group: sequential only if group doesn't start at the very beginning
              // Subsequent tasks in group: always sequential to maintain the chain
              const shouldBeSequential = groupStartsAtBeginning ? (positionInGroup > 0) : true;
              
              console.log('🔗 Unlinking task:', t.name, 'position in group:', positionInGroup, 'should be sequential:', shouldBeSequential);
              
              return { 
                ...t, 
                linkedTaskGroup: null, 
                dependentOnPrevious: shouldBeSequential
              };
            }
            return t;
          });
          
          // Update the current task being edited
          const currentTaskId = task.taskId || task.id;
          const currentPositionInGroup = sortedGroupTasks.findIndex(gt => (gt.taskId || gt.id) === currentTaskId);
          const currentShouldBeSequential = groupStartsAtBeginning ? (currentPositionInGroup > 0) : true;
          
          console.log('🔗 Current task position in group:', currentPositionInGroup, 'should be sequential:', currentShouldBeSequential);
          processedData.linkedTaskGroup = null;
          processedData.dependentOnPrevious = currentShouldBeSequential;
          
          console.log('🔗 Maintaining visual positions - tasks will stay next to each other as sequential chain');
        }
      }

      // Handle dependency changes - when a task becomes sequential OR when linked task becomes sequential
      if ((dependencyChanged && processedData.dependentOnPrevious) || 
          (linkingChanged && processedData.linkedTaskGroup && processedData.dependentOnPrevious)) {
        
        const taskIndex = allUpdatedTasks.findIndex(t => (t.taskId || t.id) === (task.taskId || task.id));
        
        // CRITICAL: Sort by ORDER FIELD, not by date, to maintain logical task sequence
        // This ensures we find the correct predecessor task in the intended workflow order
        const sortedTasks = [...allUpdatedTasks].sort((a, b) => {
          return (a.order || 0) - (b.order || 0);
        });
        
        // Find current task in sorted list to get its logical position
        const currentTask = allUpdatedTasks[taskIndex];
        const sortedTaskIndex = sortedTasks.findIndex(t => (t.taskId || t.id) === (currentTask.taskId || currentTask.id));
        
        if (sortedTaskIndex > 0) {
          // Find the chronologically previous task (not from same linked group)
          let previousTaskDate = null;
          
          for (let i = sortedTaskIndex - 1; i >= 0; i--) {
            const prevTask = sortedTasks[i];
            
            // Skip tasks from the same linked group
            if (processedData.linkedTaskGroup && prevTask.linkedTaskGroup === processedData.linkedTaskGroup) {
              continue;
            }
            
            previousTaskDate = prevTask.taskDate;
            break;
          }
          
          if (previousTaskDate) {
            // Calculate next working day from the chronologically previous task
            const baseDate = new Date(previousTaskDate + 'T00:00:00');
            const nextDate = new Date(baseDate);
            nextDate.setDate(nextDate.getDate() + 1);
            // Skip weekends
            while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
              nextDate.setDate(nextDate.getDate() + 1);
            }
            const newDate = nextDate.toISOString().split('T')[0];
            
            // Update the processedData with calculated sequential date
            processedData.taskDate = newDate;
            
            // Update the task with the calculated date
            allUpdatedTasks[taskIndex] = {
              ...allUpdatedTasks[taskIndex],
              taskDate: newDate
            };
            
            // If this task is linked, update all tasks in the linked group with the sequential date
            if (processedData.linkedTaskGroup) {
              allUpdatedTasks = allUpdatedTasks.map(t => 
                t.linkedTaskGroup === processedData.linkedTaskGroup 
                  ? { ...t, taskDate: newDate }
                  : t
              );
            }
            
            console.log('Updated sequential task date to:', newDate, 'based on chronologically previous task:', previousTaskDate);
            console.log('Sequential calculation triggered by:', dependencyChanged ? 'dependency change' : 'linking change');
          }
        }
      }
      
      // Handle linked task synchronization - ONLY if not already handled by sequential logic above
      const finalLinkedGroup = processedData.linkedTaskGroup || task.linkedTaskGroup;
      if (finalLinkedGroup && dateChanged && !processedData.dependentOnPrevious) {
        console.log('Syncing all tasks in linked group (non-sequential):', finalLinkedGroup, 'to date:', processedData.taskDate);
        
        // Find all tasks in the same linked group (including the current task)
        const linkedTasks = allUpdatedTasks.filter(t => 
          t.linkedTaskGroup === finalLinkedGroup
        );
        
        console.log('Found', linkedTasks.length, 'tasks in linked group to sync');
        
        // Update all tasks in the group to have the same date
        linkedTasks.forEach(linkedTask => {
          const linkedTaskIndex = allUpdatedTasks.findIndex(t => (t.taskId || t.id) === (linkedTask.taskId || linkedTask.id));
          if (linkedTaskIndex >= 0) {
            console.log('Syncing task:', linkedTask.name, 'to date:', processedData.taskDate);
            allUpdatedTasks[linkedTaskIndex] = {
              ...allUpdatedTasks[linkedTaskIndex],
              taskDate: processedData.taskDate // All linked tasks must have same date
            };
          }
        });
      }
      
      // Process sequential dependencies after ANY date changes - shift subsequent tasks chronologically
      if (dateChanged || dependencyChanged) {
        console.log('Processing sequential dependencies after date/dependency change');
        
        // For "unsequential_shift_others" action, shift subsequent sequential tasks based on the changed task's new date
        if (dateChangeAction === 'unsequential_shift_others') {
          console.log('🔧 Handling unsequential_shift_others action - using targeted realignment');
          
          // CRITICAL: If this task is in a linked group, update ALL tasks in the linked group to the new date first
          if (processedData.linkedTaskGroup) {
            console.log('Task is in linked group - updating all linked tasks to new date:', processedData.taskDate);
            
            allUpdatedTasks = allUpdatedTasks.map(t => {
              if (t.linkedTaskGroup === processedData.linkedTaskGroup) {
                console.log('Updating linked task:', t.name, 'from:', t.taskDate, 'to:', processedData.taskDate);
                return { ...t, taskDate: processedData.taskDate };
              }
              return t;
            });
          }
          
          // Use the targeted realignment function to handle all subsequent task shifting
          console.log('🔄 Applying targeted realignment for unsequential_shift_others');
          console.log('Tasks before targeted realignment:', allUpdatedTasks.map(t => ({ name: t.name, date: t.taskDate, order: t.order })));
          allUpdatedTasks = realignDependentTasksAfter(allUpdatedTasks, task.taskId || task.id);
          console.log('Tasks after targeted realignment:', allUpdatedTasks.map(t => ({ name: t.name, date: t.taskDate, order: t.order })));
        } else {
          // For other actions (sequential, unsequential_move_only), use the existing cascading logic
          // This is the original logic for normal sequential dependency processing
          
          // Only reassign order values for non-"unsequential_shift_others" actions
          // CRITICAL: DO NOT reassign order values for linking operations
          // Order changes should only happen during drag-and-drop, not linking
          // Keep original order values to maintain visual task positions
          console.log('🔗 Preserving original task order values during linking operation');
          
          // CRITICAL FIX: Make sure no order reassignment happens anywhere
          console.log('🔗 LINKING ACTION DETECTED - SKIPPING ORDER REASSIGNMENT ENTIRELY');
        }
        
        console.log('Sequential cascading complete');
      }
      
      // CRITICAL: Apply targeted realignment if dependency status changed
      // BUT ONLY if we didn't already handle it in the manual shifting logic above
      if (dependencyChanged && dateChangeAction !== 'unsequential_shift_others') {
        console.log('🔄 DEPENDENCY CHANGED - applying targeted realignment');
        console.log('Modified task:', task.taskId || task.id, 'dependentOnPrevious:', processedData.dependentOnPrevious);
        console.log('Tasks before targeted realignment:', allUpdatedTasks.map(t => ({ name: t.name, date: t.taskDate, order: t.order })));
        allUpdatedTasks = realignDependentTasksAfter(allUpdatedTasks, task.taskId || task.id);
        console.log('Tasks after targeted realignment:', allUpdatedTasks.map(t => ({ name: t.name, date: t.taskDate, order: t.order })));
      } else if (dependencyChanged && dateChangeAction === 'unsequential_shift_others') {
        console.log('🔄 DEPENDENCY CHANGED but already handled by targeted realignment logic above');
      }
      
      // Filter to only tasks that actually changed
      const tasksToUpdate = allUpdatedTasks.filter(updatedTask => {
        const originalTask = locationTasks.find(orig => 
          (orig.taskId || orig.id) === (updatedTask.taskId || updatedTask.id)
        );
        return originalTask && (
          originalTask.taskDate !== updatedTask.taskDate ||
          originalTask.linkedTaskGroup !== updatedTask.linkedTaskGroup ||
          originalTask.dependentOnPrevious !== updatedTask.dependentOnPrevious ||
          originalTask.order !== updatedTask.order ||
          originalTask.costCode !== updatedTask.costCode
        );
      });
      
      console.log('Cascading updates for', tasksToUpdate.length, 'tasks');
      batchUpdateTasksMutation.mutate(tasksToUpdate);
    } else {
      // Single task update
      console.log('Single task update without cascading');
      updateTaskMutation.mutate(processedData);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusInfo = taskStatuses.find(s => s.value === status);
    return statusInfo ? statusInfo : taskStatuses[0];
  };

  const getTaskDisplayName = (taskName: string) => {
    // Extract day information if it exists
    const dayMatch = taskName.match(/Day (\d+)/i);
    if (dayMatch) {
      return taskName;
    }
    return taskName;
  };

  if (!isOpen || !task) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Edit className="w-5 h-5" />
            Edit Task: {getTaskDisplayName(task.name)}
            {getTaskStatus(task, taskAssignments) === 'complete' && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs">
                Limited Editing: Only Notes & Status
              </Badge>
            )}
            {/* Day indicator badge */}
            {(() => {
              if (locationTasks) {
                // Get all tasks with the same cost code at this location, sorted by date then order
                const sameCostCodeTasks = locationTasks
                  .filter(t => t.costCode === task.costCode && t.locationId === task.locationId)
                  .sort((a, b) => {
                    if (a.taskDate !== b.taskDate) {
                      return new Date(a.taskDate).getTime() - new Date(b.taskDate).getTime();
                    }
                    return (a.order || 0) - (b.order || 0);
                  });
                
                const currentTaskIndex = sameCostCodeTasks.findIndex(t => (t.taskId || t.id) === (task.taskId || task.id));
                
                if (currentTaskIndex >= 0 && sameCostCodeTasks.length > 1) {
                  const currentDay = currentTaskIndex + 1;
                  const totalDays = sameCostCodeTasks.length;
                  return (
                    <Badge variant="outline" className="text-xs">
                      Day {currentDay} of {totalDays}
                    </Badge>
                  );
                }
              }
              return null;
            })()}
          </DialogTitle>
          <DialogDescription>
            Edit task name, date, schedule, description, and status. Other fields are based on cost code settings.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Task Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Task Name</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Enter task name"
                        disabled={getTaskStatus(task, taskAssignments) === 'complete'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel className="text-sm font-medium text-gray-700">Task Type</FormLabel>
                <div className="flex items-center gap-2 p-2 bg-gray-50 border rounded-md">
                  <Badge variant="outline">{task.taskType}</Badge>
                </div>
                <p className="text-xs text-gray-500">Based on cost code type</p>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="taskDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Task Date (Editable)</FormLabel>
                    <FormControl>
                      <Input 
                        type="date" 
                        {...field} 
                        disabled={(() => {
                          // Disable date input for completed tasks
                          const taskStatus = getTaskStatus(task, taskAssignments);
                          const isComplete = taskStatus === 'complete';
                          
                          console.log('🔍 EDIT MODAL DATE INPUT DISABLED CHECK:', {
                            taskName: task?.name,
                            taskStatus,
                            isComplete,
                            taskId: task?.id || task?.taskId,
                            assignmentsCount: taskAssignments.length,
                            assignments: taskAssignments.map((a: any) => ({ 
                              id: a.id, 
                              taskId: a.taskId, 
                              actualHours: a.actualHours 
                            })),
                            shouldDisable: isComplete
                          });
                          
                          return isComplete;
                        })()}
                        onChange={(e) => {
                          const newDate = e.target.value;
                          const oldDate = field.value;
                          
                          // Check if the date actually changed
                          if (newDate !== oldDate && newDate) {
                            // Set up pending form data for the appropriate dialog
                            const formData = form.getValues();
                            formData.taskDate = newDate;
                            
                            if (form.watch("dependentOnPrevious")) {
                              // Sequential task - show sequential dialog
                              setPendingFormData(formData);
                              setShowDateChangeDialog(true);
                            } else {
                              // Non-sequential task - show non-sequential dialog
                              setPendingNonSequentialData(formData);
                              setShowNonSequentialDialog(true);
                            }
                          } else {
                            // No real change, update normally
                            field.onChange(e);
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel className="text-sm font-medium text-gray-700">Cost Code Start Date</FormLabel>
                <div className="flex items-center gap-2 p-2 bg-gray-50 border rounded-md">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">
                    {(() => {
                      const dateRange = getCostCodeDateRangeFromTasks(task.costCode, locationTasks);
                      return dateRange.startDate 
                        ? new Date(dateRange.startDate + 'T00:00:00').toLocaleDateString() 
                        : 'Not set';
                    })()}
                  </span>
                </div>
                <p className="text-xs text-gray-500">Based on other tasks with this cost code</p>
              </div>

              <div className="space-y-2">
                <FormLabel className="text-sm font-medium text-gray-700">Cost Code Finish Date</FormLabel>
                <div className="flex items-center gap-2 p-2 bg-gray-50 border rounded-md">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">
                    {(() => {
                      const dateRange = getCostCodeDateRangeFromTasks(task.costCode, locationTasks);
                      return dateRange.finishDate 
                        ? new Date(dateRange.finishDate + 'T00:00:00').toLocaleDateString() 
                        : 'Not set';
                    })()}
                  </span>
                </div>
                <p className="text-xs text-gray-500">Based on other tasks with this cost code</p>
              </div>
            </div>

            {/* Task Dependencies */}
            <div className="space-y-3">
              <FormField
                control={form.control}
                name="dependentOnPrevious"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={(() => {
                          // Disable for completed tasks
                          if (getTaskStatus(task, taskAssignments) === 'complete') {
                            return true;
                          }
                          
                          // Disable sequential checkbox for second task in linked group
                          if (task.linkedTaskGroup && locationTasks) {
                            const linkedTasks = locationTasks
                              .filter((t: any) => t.linkedTaskGroup === task.linkedTaskGroup)
                              .sort((a: any, b: any) => {
                                const dateA = new Date(a.taskDate).getTime();
                                const dateB = new Date(b.taskDate).getTime();
                                if (dateA !== dateB) return dateA - dateB;
                                return (a.order || 0) - (b.order || 0);
                              });
                            
                            // If this is not the first task in the linked group, disable sequential
                            const currentTaskIndex = linkedTasks.findIndex((t: any) => 
                              (t.taskId || t.id) === (task.taskId || task.id)
                            );
                            return currentTaskIndex > 0; // Disable if not first task
                          }
                          return false;
                        })()}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Sequential dependency (automatically shift date based on previous task)
                      </FormLabel>
                      <p className="text-xs text-gray-500">
                        When enabled, this task will automatically shift if previous tasks change dates
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="linkToExistingTask"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        disabled={getTaskStatus(task, taskAssignments) === 'complete'}
                        onCheckedChange={(checked) => {
                          console.log('🔗 Checkbox changed - checked:', checked, 'linkedTaskGroup:', task.linkedTaskGroup);
                          
                          if (!checked && task.linkedTaskGroup && !skipUnlinkDialog) {
                            // User is unchecking link - determine group size for unlink dialog
                            const groupTasks = (existingTasks as any[]).filter((t: any) => 
                              t.linkedTaskGroup === task.linkedTaskGroup && (t.taskId || t.id) !== (task.taskId || task.id)
                            );
                            
                            console.log('🔗 Found groupTasks:', groupTasks.length, 'total group size:', groupTasks.length + 1);
                            
                            if (groupTasks.length === 1) {
                              // Two-task group - auto-unlink both tasks directly
                              console.log('🔗 CHECKBOX TWO-TASK GROUP - auto-unlinking both tasks');
                              const otherTask = groupTasks[0];
                              
                              // Check if ANY task in the linked group was sequential
                              // (When linking sequential tasks, first stays sequential, second becomes unsequential)
                              const anyWasSequential = task.dependentOnPrevious || otherTask.dependentOnPrevious;
                              
                              // CRITICAL: Apply the same fractional order logic as the form submission path
                              const firstTask = (task.order || 0) < (otherTask.order || 0) ? task : otherTask;
                              const secondTask = (task.order || 0) < (otherTask.order || 0) ? otherTask : task;
                              
                              // Convert orders to numbers for calculation
                              const firstOrder = typeof firstTask.order === 'string' ? parseFloat(firstTask.order) : (firstTask.order || 0);
                              const newOrderForSecondTask = firstOrder + 0.1;
                              
                              // If making sequential, calculate date for second task
                              let secondTaskDate = secondTask.taskDate;
                              if (anyWasSequential) {
                                // Calculate next day after first task
                                const baseDate = new Date(firstTask.taskDate + 'T00:00:00');
                                const nextDate = new Date(baseDate);
                                nextDate.setDate(nextDate.getDate() + 1);
                                // Skip weekends
                                while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
                                  nextDate.setDate(nextDate.getDate() + 1);
                                }
                                secondTaskDate = nextDate.toISOString().split('T')[0];
                              }
                              
                              console.log('🔗 CHECKBOX UNLINK ORDER PRESERVATION:', {
                                firstTask: firstTask.name,
                                firstOrder: firstTask.order,
                                firstOrderParsed: firstOrder,
                                secondTask: secondTask.name, 
                                secondOrder: secondTask.order,
                                newOrder: newOrderForSecondTask,
                                anyWasSequential,
                                secondTaskNewDate: secondTaskDate
                              });
                              
                              // Both tasks become unlinked with preserved visual positioning
                              // RULE: If any was sequential, both become sequential (restore sequential workflow)
                              // Otherwise: First task (by order) becomes unsequential, second becomes sequential
                              const bothTasks = [
                                {
                                  ...firstTask,
                                  linkedTaskGroup: null,
                                  dependentOnPrevious: anyWasSequential ? true : false // If any sequential, first becomes sequential
                                },
                                {
                                  ...secondTask,
                                  linkedTaskGroup: null,
                                  dependentOnPrevious: true, // Second task is always sequential
                                  taskDate: secondTaskDate, // Updated date when made sequential
                                  order: newOrderForSecondTask // CRITICAL: Preserve position with fractional order
                                }
                              ];
                              
                              // Trigger cascading for all subsequent tasks
                              const allTasks = [...(existingTasks as any[])];
                              
                              // Update the unlinked tasks with new order and date values
                              bothTasks.forEach(updatedTask => {
                                const existingIndex = allTasks.findIndex(t => 
                                  (t.taskId || t.id) === (updatedTask.taskId || updatedTask.id)
                                );
                                if (existingIndex >= 0) {
                                  allTasks[existingIndex] = {
                                    ...allTasks[existingIndex],
                                    linkedTaskGroup: null,
                                    dependentOnPrevious: updatedTask.dependentOnPrevious,
                                    taskDate: updatedTask.taskDate, // CRITICAL: Update date for sequential tasks
                                    order: updatedTask.order // CRITICAL: Apply the new order value
                                  };
                                }
                              });
                              
                              // Use targeted realignment to only shift tasks after the modified one
                              console.log('🔧 Using targeted realignment for checkbox unlink');
                              const realignedTasks = realignDependentTasksAfter(allTasks, task.taskId || task.id);
                              
                              // Find tasks that changed
                              const finalTasksToUpdate = realignedTasks.filter(task => {
                                const originalTask = (existingTasks as any[]).find(t => 
                                  (t.taskId || t.id) === (task.taskId || task.id)
                                );
                                return !originalTask || 
                                       originalTask.taskDate !== task.taskDate ||
                                       originalTask.linkedTaskGroup !== task.linkedTaskGroup ||
                                       originalTask.dependentOnPrevious !== task.dependentOnPrevious ||
                                       originalTask.order !== task.order; // CRITICAL: Include order changes
                              });
                              
                              console.log('🔗 Two-task unlink with cascading:', finalTasksToUpdate.map(t => ({ 
                                name: t.name, 
                                date: t.taskDate,
                                order: t.order,
                                sequential: t.dependentOnPrevious 
                              })));
                              
                              batchUpdateTasksMutation.mutate(finalTasksToUpdate);
                              return;
                            } else if (groupTasks.length >= 2) {
                              // Multi-task group (3+ tasks) - show unlink dialog
                              setUnlinkingGroupSize(groupTasks.length + 1); // +1 to include current task
                              setShowUnlinkDialog(true);
                              setPendingFormData({ ...form.getValues(), linkToExistingTask: false });
                              console.log('🔗 Showing unlink dialog for group size:', groupTasks.length + 1);
                              return;
                            }
                          }
                          
                          console.log('🔗 Setting linkToExistingTask to:', checked);
                          field.onChange(checked);
                          // Don't automatically change sequential status when linking
                          // Users should be able to control both independently
                        }}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Link to existing task (occur on same date)
                      </FormLabel>
                      <p className="text-xs text-gray-500">
                        Link this task to occur on the same date as another task
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              {/* Multi-Select Linked Tasks */}
              {form.watch("linkToExistingTask") && (
                <FormField
                  control={form.control}
                  name="linkedTaskIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select Tasks to Link With</FormLabel>
                      <div className="relative">
                        <div className="min-h-[40px] w-full border border-input bg-background px-3 py-2 text-sm ring-offset-background rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                          {/* Selected tasks display as chips */}
                          <div className="flex flex-wrap gap-1 mb-2">
                            {(field.value || []).length > 0 && (field.value || []).map((taskId: string) => {
                              const selectedTask = (Array.isArray(existingTasks) ? existingTasks : []).find((t: any) => 
                                (t.taskId || t.id).toString() === taskId
                              );
                              if (!selectedTask) return null;
                              
                              const formatDate = (dateStr: string) => {
                                const [year, month, day] = dateStr.split('-');
                                return `${month}/${day}/${year}`;
                              };
                              
                              return (
                                <div key={taskId} className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                                  <span>{selectedTask.name} ({formatDate(selectedTask.taskDate)})</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      console.log('Removing task from selection:', taskId);
                                      console.log('Current field value:', field.value);
                                      const newValue = (field.value || []).filter((id: string) => id !== taskId);
                                      console.log('New field value after removal:', newValue);
                                      field.onChange(newValue);
                                    }}
                                    className="ml-1 text-blue-600 hover:text-blue-800 w-4 h-4 flex items-center justify-center rounded"
                                  >
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* Dropdown - only show if there are available tasks to select */}
                          {(Array.isArray(existingTasks) ? existingTasks : [])
                            .filter((t: any) => 
                              (t.taskId || t.id) !== (task.taskId || task.id) && // Exclude current task
                              !(field.value || []).includes((t.taskId || t.id).toString())
                            ).length > 0 && (
                            <Select 
                              key={`select-${(field.value || []).join('-')}`}
                              onValueChange={(value) => {
                                if (value && !(field.value || []).includes(value)) {
                                  // Check if selected task is part of a linked group
                                  const linkedGroupIds = getLinkedGroupTaskIds(value, existingTasks as any[]);
                                  
                                  if (linkedGroupIds.length > 1) {
                                    // Auto-select entire linked group
                                    console.log('Auto-selecting linked group:', linkedGroupIds);
                                    const newSelection = [...(field.value || []), ...linkedGroupIds.filter(id => !(field.value || []).includes(id))];
                                    field.onChange(newSelection);
                                  } else {
                                    // Single task selection
                                    field.onChange([...(field.value || []), value]);
                                  }
                                }
                              }}
                            >
                              <SelectTrigger className="border-none shadow-none p-0 h-auto focus:ring-0">
                                <SelectValue placeholder={(field.value || []).length === 0 ? "Choose tasks to link with" : "Add more tasks..."} />
                              </SelectTrigger>
                              <SelectContent>
                                {(Array.isArray(existingTasks) ? existingTasks : [])
                                  .filter((t: any) => {
                                    // Exclude current task
                                    if ((t.taskId || t.id) === (task.taskId || task.id)) {
                                      return false;
                                    }
                                    
                                    // Exclude already selected tasks
                                    if ((field.value || []).includes((t.taskId || t.id).toString())) {
                                      return false;
                                    }
                                    
                                    // Exclude completed tasks from linking options
                                    const taskTaskAssignments = taskAssignments.filter((assignment: any) => 
                                      assignment.taskId === (t.id || t.taskId)
                                    );
                                    const taskStatus = getTaskStatus(t, taskTaskAssignments);
                                    
                                    return taskStatus !== 'complete';
                                  })
                                  .sort((a: any, b: any) => {
                                    const dateA = new Date(a.taskDate).getTime();
                                    const dateB = new Date(b.taskDate).getTime();
                                    if (dateA !== dateB) return dateA - dateB;
                                    return (a.order || 0) - (b.order || 0);
                                  })
                                  .map((taskItem: any) => {
                                    const formatDate = (dateStr: string) => {
                                      const [year, month, day] = dateStr.split('-');
                                      return `${month}/${day}/${year}`;
                                    };
                                    
                                    // Check if this task is part of a linked group
                                    const linkedGroupIds = getLinkedGroupTaskIds((taskItem.taskId || taskItem.id).toString(), existingTasks as any[]);
                                    const isPartOfLinkedGroup = linkedGroupIds.length > 1;
                                    const linkedGroupNames = isPartOfLinkedGroup 
                                      ? linkedGroupIds
                                          .map(id => (existingTasks as any[]).find(t => (t.taskId || t.id).toString() === id)?.name)
                                          .filter(name => name && name !== taskItem.name)
                                          .slice(0, 2) // Show max 2 other names
                                      : [];
                                    
                                    return (
                                      <SelectItem 
                                        key={taskItem.taskId || taskItem.id} 
                                        value={(taskItem.taskId || taskItem.id).toString()}
                                        className={isPartOfLinkedGroup ? "bg-blue-50 border-l-4 border-blue-400" : ""}
                                      >
                                        <div className="flex flex-col">
                                          <div className="flex items-center gap-2">
                                            {isPartOfLinkedGroup && (
                                              <span className="text-blue-600 text-xs font-semibold">🔗</span>
                                            )}
                                            <span className="flex-1">{taskItem.name}</span>
                                            <span className="text-xs text-gray-500 ml-2">
                                              {formatDate(taskItem.taskDate)}
                                            </span>
                                          </div>
                                          {isPartOfLinkedGroup && linkedGroupNames.length > 0 && (
                                            <div className="text-xs text-blue-600 mt-1">
                                              Linked with: {linkedGroupNames.join(", ")}{linkedGroupNames.length === 2 ? "..." : ""}
                                            </div>
                                          )}
                                        </div>
                                      </SelectItem>
                                    );
                                  })}
                              </SelectContent>
                            </Select>
                          )}
                          
                          {/* Show message if no tasks available */}
                          {(Array.isArray(existingTasks) ? existingTasks : [])
                            .filter((t: any) => 
                              (t.taskId || t.id) !== (task.taskId || task.id) && // Exclude current task
                              !(field.value || []).includes((t.taskId || t.id).toString())
                            ).length === 0 && (
                            <p className="text-sm text-gray-500 py-2">
                              No other tasks available to link with
                            </p>
                          )}
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Cost Code - Read Only */}
            <div className="space-y-2">
              <FormLabel className="text-sm font-medium text-gray-700">Cost Code</FormLabel>
              <div className="flex items-center gap-2 p-2 bg-gray-50 border rounded-md">
                <Badge variant="secondary">{task.costCode}</Badge>
              </div>
              <p className="text-xs text-gray-500">Assigned based on task type</p>
            </div>

            {/* Quantity Tracking Method Toggle */}
            <FormField
              control={form.control}
              name="useLineItemQuantities"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Quantity Tracking Method</FormLabel>
                  <div className="flex items-center gap-4">
                    <Button
                      type="button"
                      variant={!field.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => field.onChange(false)}
                      data-testid="btn-single-qty"
                    >
                      Single Quantity
                    </Button>
                    <Button
                      type="button"
                      variant={field.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => field.onChange(true)}
                      data-testid="btn-line-item-qty"
                    >
                      Line Item Quantities
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    {field.value 
                      ? "Track quantities for specific budget line items" 
                      : "Track a single quantity for this task"}
                  </p>
                </FormItem>
              )}
            />

            {/* Single Quantity Mode */}
            {!form.watch("useLineItemQuantities") && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="qty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01"
                          placeholder="Enter quantity"
                          {...field} 
                          data-testid="input-qty"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unitOfMeasure"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit of Measure</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value || ""}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-unit-of-measure">
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {unitOfMeasureOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Line Item Quantities Mode */}
            {form.watch("useLineItemQuantities") && (
              <FormField
                control={form.control}
                name="lineItemQuantities"
                render={({ field }) => {
                  // Get budget items matching this task's cost code
                  const matchingBudgetItems = locationBudgetItems.filter((item: any) => {
                    const itemCostCode = (item.costCode || '').toUpperCase().replace(/\s+/g, '');
                    const taskCostCode = (task?.costCode || '').toUpperCase().replace(/\s+/g, '');
                    if (itemCostCode === taskCostCode) return true;
                    if (taskCostCode === 'DEMO/EX+BASE/GRADING') {
                      return itemCostCode === 'DEMO/EX' || 
                             itemCostCode === 'BASE/GRADING' ||
                             itemCostCode === 'DEMO/EX+BASE/GRADING';
                    }
                    return false;
                  });

                  // Get selected line item IDs
                  const selectedIds = (field.value || []).map((liq: LineItemQuantity) => liq.budgetLineItemId);

                  // Handle adding a line item
                  const addLineItem = (itemId: number) => {
                    if (!selectedIds.includes(itemId)) {
                      field.onChange([...field.value || [], { budgetLineItemId: itemId, qty: "" }]);
                    }
                  };

                  // Handle removing a line item
                  const removeLineItem = (itemId: number) => {
                    field.onChange((field.value || []).filter((liq: LineItemQuantity) => liq.budgetLineItemId !== itemId));
                  };

                  // Handle updating quantity for a line item
                  const updateLineItemQty = (itemId: number, qty: string) => {
                    field.onChange(
                      (field.value || []).map((liq: LineItemQuantity) => 
                        liq.budgetLineItemId === itemId ? { ...liq, qty } : liq
                      )
                    );
                  };

                  // Get item details by ID
                  const getItemById = (id: number) => matchingBudgetItems.find((item: any) => item.id === id);

                  return (
                    <FormItem className="space-y-3">
                      <FormLabel>Budget Line Items</FormLabel>
                      
                      {/* Available line items to add */}
                      {matchingBudgetItems.length > 0 ? (
                        <div className="space-y-3">
                          {/* Dropdown to select line items */}
                          <Select
                            onValueChange={(val) => addLineItem(parseInt(val))}
                            value=""
                          >
                            <SelectTrigger data-testid="select-add-line-item">
                              <SelectValue placeholder="Add a budget line item..." />
                            </SelectTrigger>
                            <SelectContent>
                              {matchingBudgetItems
                                .filter((item: any) => !selectedIds.includes(item.id))
                                .map((item: any) => (
                                  <SelectItem key={item.id} value={item.id.toString()}>
                                    {item.description} ({item.unconvertedUnitOfMeasure || item.convertedUnitOfMeasure || 'N/A'})
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>

                          {/* Selected line items with qty inputs */}
                          {(field.value || []).length > 0 && (
                            <div className="space-y-2 border rounded-md p-3 bg-gray-50">
                              {(field.value || []).map((liq: LineItemQuantity) => {
                                const item = getItemById(liq.budgetLineItemId);
                                if (!item) return null;
                                return (
                                  <div key={liq.budgetLineItemId} className="flex items-center gap-2">
                                    <div className="flex-1 text-sm">
                                      <span className="font-medium">{item.description}</span>
                                      <span className="text-gray-500 ml-2">
                                        ({item.unconvertedUnitOfMeasure || item.convertedUnitOfMeasure || 'N/A'})
                                      </span>
                                    </div>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder="Qty"
                                      value={liq.qty}
                                      onChange={(e) => updateLineItemQty(liq.budgetLineItemId, e.target.value)}
                                      className="w-24"
                                      data-testid={`input-line-item-qty-${liq.budgetLineItemId}`}
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeLineItem(liq.budgetLineItemId)}
                                      data-testid={`btn-remove-line-item-${liq.budgetLineItemId}`}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {(field.value || []).length === 0 && (
                            <p className="text-sm text-gray-500">No line items selected. Use the dropdown above to add budget line items.</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-amber-600">
                          No budget line items found for cost code "{task?.costCode}". 
                          Please add budget items to this location first.
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            )}

            {/* Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <Input 
                        type="time" 
                        {...field} 
                        disabled={getTaskStatus(task, taskAssignments) === 'complete'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="finishTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Finish Time</FormLabel>
                    <FormControl>
                      <Input 
                        type="time" 
                        {...field} 
                        disabled={getTaskStatus(task, taskAssignments) === 'complete'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Status */}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {taskStatuses.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          <div className="flex items-center gap-2">
                            <Badge className={status.color}>{status.label}</Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Work Description */}
            <FormField
              control={form.control}
              name="workDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Work Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      rows={3} 
                      placeholder="Describe the work to be performed..." 
                      {...field} 
                      disabled={getTaskStatus(task, taskAssignments) === 'complete'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Additional notes..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Form Actions */}
            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button type="submit" disabled={updateTaskMutation.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {updateTaskMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
      {/* Date Change Confirmation Dialog */}
      <AlertDialog open={showDateChangeDialog} onOpenChange={(open) => {
        if (!open) {
          // User closed dialog - revert the date change
          form.setValue("taskDate", task.taskDate);
          setPendingFormData(null);
        }
        setShowDateChangeDialog(open);
      }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold">
              Change Sequential Task Date
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 space-y-2">
              <p>This task is currently sequential (automatically positioned after the previous task).</p>
              <p>When you change the date, choose an option:</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col space-y-3 sm:flex-col">
            <Button 
              onClick={() => {
                // Make unsequential and shift others - this preserves the date change logic
                if (pendingFormData) {
                  form.setValue("taskDate", pendingFormData.taskDate);
                  form.setValue("dependentOnPrevious", false);
                  // Mark that we want to shift others when saving
                  setDateChangeAction('unsequential_shift_others');
                }
                setShowDateChangeDialog(false);
                setPendingFormData(null);
              }}
              variant="outline"
              className="w-full"
            >
              <div className="text-center">
                <div className="font-medium">Make Unsequential & Shift Others</div>
                <div className="text-xs mt-1 text-[#6b7280]">
                  Task becomes non-sequential, shift subsequent sequential tasks
                </div>
              </div>
            </Button>
            <Button 
              onClick={() => {
                // Make unsequential and move it - simple case
                if (pendingFormData) {
                  form.setValue("taskDate", pendingFormData.taskDate);
                  form.setValue("dependentOnPrevious", false);
                  // No special action needed - just change date and make non-sequential
                  setDateChangeAction('unsequential_move_only');
                }
                setShowDateChangeDialog(false);
                setPendingFormData(null);
              }}
              variant="outline"
              className="w-full"
            >
              <div className="text-center">
                <div className="font-medium">Make Unsequential & Move It</div>
                <div className="text-xs text-gray-500 mt-1">
                  Remove sequential dependency and move to new date
                </div>
              </div>
            </Button>
            <Button 
              onClick={() => {
                // Keep sequential and move to nearest valid date
                if (pendingFormData) {
                  // Reset the date field to the new date but keep sequential
                  form.setValue("taskDate", pendingFormData.taskDate);
                  // Don't change dependency - keep sequential
                  setDateChangeAction('sequential');
                }
                setShowDateChangeDialog(false);
                setPendingFormData(null);
              }}
              variant="outline"
              className="w-full"
            >
              <div className="text-center">
                <div className="font-medium">Keep Sequential & Move to Nearest Date</div>
                <div className="text-xs mt-1 text-[#6b7280]">
                  Keep sequential dependency, adjust to nearest valid date
                </div>
              </div>
            </Button>
            <Button 
              onClick={() => {
                // Cancel - revert date change
                form.setValue("taskDate", task.taskDate);
                setShowDateChangeDialog(false);
                setPendingFormData(null);
              }}
              variant="ghost"
              className="w-full"
            >
              Cancel
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Non-Sequential Task Date Change Dialog */}
      <AlertDialog open={showNonSequentialDialog} onOpenChange={(open) => {
        if (!open) {
          // User closed dialog - revert the date change
          form.setValue("taskDate", task.taskDate);
          setPendingNonSequentialData(null);
        }
        setShowNonSequentialDialog(open);
      }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold">
              Change Unsequential Task Date
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 space-y-2">
              <p>This task is currently unsequential (positioned independently).</p>
              <p>When you change the date, choose an option:</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col space-y-3 sm:flex-col">
            <Button 
              onClick={() => {
                // Keep unsequential and shift others
                if (pendingNonSequentialData) {
                  form.setValue("taskDate", pendingNonSequentialData.taskDate);
                  // Keep non-sequential (don't change dependentOnPrevious)
                  setDateChangeAction('unsequential_shift_others');
                }
                setShowNonSequentialDialog(false);
                setPendingNonSequentialData(null);
              }}
              variant="outline"
              className="w-full"
            >
              <div className="text-center">
                <div className="font-medium">Keep Unsequential & Shift Others</div>
                <div className="text-xs mt-1 text-[#6b7280]">
                  Stay non-sequential, shift subsequent sequential tasks
                </div>
              </div>
            </Button>
            <Button 
              onClick={() => {
                // Keep unsequential and move it
                if (pendingNonSequentialData) {
                  form.setValue("taskDate", pendingNonSequentialData.taskDate);
                  // Keep non-sequential (don't change dependentOnPrevious)
                  setDateChangeAction('unsequential_move_only');
                }
                setShowNonSequentialDialog(false);
                setPendingNonSequentialData(null);
              }}
              variant="outline"
              className="w-full"
            >
              <div className="text-center">
                <div className="font-medium">Keep Unsequential & Move It</div>
                <div className="text-xs text-gray-500 mt-1">
                  Stay non-sequential and move to new date
                </div>
              </div>
            </Button>
            <Button 
              onClick={() => {
                // Cancel - revert date change
                form.setValue("taskDate", task.taskDate);
                setShowNonSequentialDialog(false);
                setPendingNonSequentialData(null);
              }}
              variant="ghost"
              className="w-full"
            >
              Cancel
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Linking Date Choice Dialog */}
      <AlertDialog open={showLinkDateDialog} onOpenChange={(open) => {
        if (!open) {
          // User closed dialog - cancel linking
          setShowLinkDateDialog(false);
          setLinkingOptions(null);
          setPendingFormData(null);
        }
      }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold">
              Choose Position for Linked Tasks
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 space-y-2">
              <div>
                <div>You're linking "{linkingOptions?.currentTask?.name}" to {linkingOptions?.targetTasks?.length || 0} task(s):</div>
                {linkingOptions?.targetTasks && (
                  <ul className="text-sm mt-1 ml-4 list-disc">
                    {linkingOptions.targetTasks.map((t: any, idx: number) => (
                      <li key={idx}>{t.name}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-2">Choose the position in the task list where linked tasks should be placed:</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col space-y-3 sm:flex-col">
            {(() => {
              if (!linkingOptions?.targetTasks) return null;
              const positionOptions = createPositionOptions(linkingOptions.targetTasks, linkingOptions.formData);
              console.log('🎯 Position options generated:', positionOptions.map(o => ({ 
                name: o.name, 
                date: o.date, 
                type: o.type 
              })));
              return positionOptions.map((option, idx) => (
                <Button 
                  key={idx}
                  onClick={(e) => {
                    console.log('🚨 Button clicked! Event:', e);
                    console.log('🚨 Option:', option);
                    e.preventDefault();
                    e.stopPropagation();
                    handlePositionChoice(option);
                  }}
                  variant="outline"
                  className="w-full text-left px-4 py-3"
                >
                  <div>
                    <div className="font-medium">{option.name}</div>
                    {option.description && (
                      <div className="text-sm text-gray-500">{option.description}</div>
                    )}
                  </div>
                </Button>
              ));
            })()}
            <Button 
              onClick={() => {
                setShowLinkDateDialog(false);
                setLinkingOptions(null);
                setPendingFormData(null);
              }}
              variant="ghost"
              className="w-full"
            >
              Cancel
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unlink Task Dialog */}
      <AlertDialog open={showUnlinkDialog} onOpenChange={(open) => {
        if (!open) {
          // User closed dialog - cancel unlinking
          setShowUnlinkDialog(false);
          setPendingFormData(null);
          setSkipUnlinkDialog(false); // Reset flag
          // Reset checkbox to checked state
          form.setValue('linkToExistingTask', true);
        }
      }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold">
              Unlink Task Options
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 space-y-2">
              <div>
                You're unlinking "{task?.name}" from a group of {unlinkingGroupSize} linked tasks.
              </div>
              <div>
                How would you like to proceed?
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col space-y-3 sm:flex-col">
            <Button 
              onClick={async () => {
                // Unlink whole group
                setShowUnlinkDialog(false);
                
                if (task.linkedTaskGroup && existingTasks) {
                  const groupTasks = (existingTasks as any[]).filter((t: any) => 
                    t.linkedTaskGroup === task.linkedTaskGroup
                  );
                  
                  // Check if any task in the group (including current task) is sequential
                  const anyTaskSequential = groupTasks.some((t: any) => t.dependentOnPrevious) || task.dependentOnPrevious;
                  
                  // CRITICAL: Calculate proper sequential dates for unlinked tasks
                  // Remove duplicates by task ID before processing
                  const uniqueTasks = [task, ...groupTasks].filter((t, index, array) => 
                    array.findIndex(item => (item.taskId || item.id) === (t.taskId || t.id)) === index
                  );
                  const allTasks = uniqueTasks.sort((a, b) => (a.order || 0) - (b.order || 0));
                  const updatedTasks = [];
                  
                  console.log('🔗 ========== UNLINK LOGIC START ==========');
                  console.log('🔗 anyTaskSequential =', anyTaskSequential);
                  console.log('🔗 All tasks sorted by order:', allTasks.map(t => ({ name: t.name, order: t.order, sequential: t.dependentOnPrevious })));
                  console.log('🔗 Number of tasks to unlink:', allTasks.length);
                  
                  // Calculate new dates for tasks that become sequential
                  for (let i = 0; i < allTasks.length; i++) {
                    const currentTask = allTasks[i];
                    const isFirstTask = i === 0;
                    
                    // CORRECTED RULE:
                    // When unlinking, first task (by order) stays/becomes unsequential
                    // All subsequent tasks become sequential to form a proper chain
                    const shouldBeSequential = !isFirstTask;
                    
                    let newDate = currentTask.taskDate;
                    
                    if (shouldBeSequential) {
                      if (i > 0) {
                        // Calculate sequential date based on the UPDATED previous task in the unlinked group
                        const prevTaskUpdate = updatedTasks[i - 1];
                        const baseDate = new Date(prevTaskUpdate.newDate + 'T00:00:00');
                        const nextDate = new Date(baseDate);
                        nextDate.setDate(nextDate.getDate() + 1);
                        // Skip weekends
                        while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
                          nextDate.setDate(nextDate.getDate() + 1);
                        }
                        newDate = nextDate.toISOString().split('T')[0];
                      } else if (isFirstTask && anyTaskSequential) {
                        // First task becomes sequential - calculate based on previous task in overall task order
                        const firstTaskOrder = currentTask.order || 0;
                        if (firstTaskOrder > 0) {
                          // Find the task immediately before this one (not from same linked group)
                          const allLocationTasks = (existingTasks as any[]).sort((a, b) => (a.order || 0) - (b.order || 0));
                          let immediatelyPreviousTask = null;
                          
                          for (let j = 0; j < allLocationTasks.length; j++) {
                            const prevTask = allLocationTasks[j];
                            if ((prevTask.order || 0) === firstTaskOrder - 1 && prevTask.linkedTaskGroup !== task.linkedTaskGroup) {
                              immediatelyPreviousTask = prevTask;
                              break;
                            }
                          }
                          
                          if (immediatelyPreviousTask) {
                            const baseDate = new Date(immediatelyPreviousTask.taskDate + 'T00:00:00');
                            const nextDate = new Date(baseDate);
                            nextDate.setDate(nextDate.getDate() + 1);
                            // Skip weekends
                            while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
                              nextDate.setDate(nextDate.getDate() + 1);
                            }
                            newDate = nextDate.toISOString().split('T')[0];
                            console.log('🔗 First task becoming sequential, calculated date:', newDate, 'based on immediately previous task:', immediatelyPreviousTask.taskDate, 'order:', immediatelyPreviousTask.order);
                          }
                        }
                      }
                    }
                    
                    updatedTasks.push({
                      task: currentTask,
                      newDate,
                      shouldBeSequential
                    });
                    
                    console.log(`🔗 Task ${i + 1}/${allTasks.length}:`, currentTask.name, '-> isFirst:', isFirstTask, 'shouldBeSequential:', shouldBeSequential, 'date:', newDate);
                  }
                  
                  console.log('🔗 Calculated unlink updates:', updatedTasks.map(u => ({
                    name: u.task.name,
                    oldDate: u.task.taskDate,
                    newDate: u.newDate,
                    sequential: u.shouldBeSequential
                  })));
                  console.log('🔗 ========== SENDING UNLINK REQUESTS ==========');
                  
                  // Update all tasks including the current one
                  const unlinkPromises = updatedTasks.map((updateInfo) => 
                    apiRequest(`/api/tasks/${updateInfo.task.id}`, {
                      method: 'PUT',
                      body: JSON.stringify({
                        linkedTaskGroup: null,
                        dependentOnPrevious: updateInfo.shouldBeSequential,
                        taskDate: updateInfo.newDate,
                        startDate: updateInfo.newDate,
                        finishDate: updateInfo.newDate
                      }),
                      headers: {
                        'Content-Type': 'application/json'
                      }
                    })
                  );
                  
                  try {
                    await Promise.all(unlinkPromises);
                    
                    // CRITICAL: After unlinking tasks, recalculate downstream sequential task dates
                    // Find ALL subsequent tasks that come after the unlinked group (not just sequential ones)
                    // because a linked task might become sequential to an unlinked task
                    const maxOrderInGroup = Math.max(...allTasks.map(t => t.order || 0));
                    const subsequentTasks = (existingTasks as any[])
                      .filter(t => (t.order || 0) > maxOrderInGroup)
                      .sort((a, b) => (a.order || 0) - (b.order || 0));
                    
                    console.log('🔗 Found', subsequentTasks.length, 'subsequent sequential tasks to potentially update:', 
                      subsequentTasks.map(t => ({ name: t.name, order: t.order, currentDate: t.taskDate })));
                    
                    if (subsequentTasks.length > 0) {
                      // Get the last date from the unlinked group
                      const lastUnlinkedDate = Math.max(...updatedTasks.map(u => new Date(u.newDate).getTime()));
                      const lastUnlinkedDateString = new Date(lastUnlinkedDate).toISOString().split('T')[0];
                      
                      console.log('🔗 Last unlinked task date:', lastUnlinkedDateString);
                      
                      // Recalculate dates for subsequent sequential tasks
                      let currentDate = lastUnlinkedDateString;
                      const subsequentUpdates = [];
                      
                      for (const subsequentTask of subsequentTasks) {
                        // Only process sequential tasks (but we need to check ALL tasks to maintain chain)
                        if (!subsequentTask.dependentOnPrevious) {
                          // Non-sequential task breaks the chain - update currentDate and continue
                          currentDate = subsequentTask.taskDate;
                          continue;
                        }
                        
                        // Calculate next working day for sequential task
                        const baseDate = new Date(currentDate + 'T00:00:00');
                        const nextDate = new Date(baseDate);
                        nextDate.setDate(nextDate.getDate() + 1);
                        // Skip weekends
                        while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
                          nextDate.setDate(nextDate.getDate() + 1);
                        }
                        const newSequentialDate = nextDate.toISOString().split('T')[0];
                        
                        // Always update sequential tasks to maintain the chain
                        console.log('🔗 Updating subsequent sequential task:', subsequentTask.name, 
                          'from:', subsequentTask.taskDate, 'to:', newSequentialDate);
                        
                        subsequentUpdates.push(
                          apiRequest(`/api/tasks/${subsequentTask.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({
                              taskDate: newSequentialDate,
                              startDate: newSequentialDate,
                              finishDate: newSequentialDate
                            }),
                            headers: {
                              'Content-Type': 'application/json'
                            }
                          })
                        );
                        
                        // Update currentDate for next iteration - CRITICAL for cascading
                        currentDate = newSequentialDate;
                        
                        // If this task is in a linked group, all tasks in the group get the same date
                        if (subsequentTask.linkedTaskGroup) {
                          const linkedTasks = (existingTasks as any[])
                            .filter(t => t.linkedTaskGroup === subsequentTask.linkedTaskGroup && t.id !== subsequentTask.id);
                          
                          for (const linkedTask of linkedTasks) {
                            if (newSequentialDate !== linkedTask.taskDate) {
                              console.log('🔗 Updating linked task in subsequent group:', linkedTask.name, 'to:', newSequentialDate);
                              subsequentUpdates.push(
                                apiRequest(`/api/tasks/${linkedTask.id}`, {
                                  method: 'PUT',
                                  body: JSON.stringify({
                                    taskDate: newSequentialDate,
                                    startDate: newSequentialDate,
                                    finishDate: newSequentialDate
                                  }),
                                  headers: {
                                    'Content-Type': 'application/json'
                                  }
                                })
                              );
                            }
                          }
                        }
                      }
                      
                      // Execute subsequent updates if any
                      if (subsequentUpdates.length > 0) {
                        console.log('🔗 Executing', subsequentUpdates.length, 'subsequent task updates');
                        await Promise.all(subsequentUpdates);
                      }
                    }
                    
                    // Update form and close modal
                    form.setValue('linkToExistingTask', false);
                    form.setValue('linkedTaskIds', []);
                    
                    toast({
                      title: "Success",
                      description: `Unlinked all ${unlinkingGroupSize} tasks from the group and updated downstream tasks`,
                    });
                    
                    queryClient.invalidateQueries({ queryKey: ["/api/locations", task.locationId, "tasks"] });
                    onTaskUpdate();
                    onClose();
                  } catch (error) {
                    console.error('Failed to unlink group:', error);
                    toast({
                      title: "Error",
                      description: "Failed to unlink task group",
                      variant: "destructive",
                    });
                    // Reset checkbox state
                    form.setValue('linkToExistingTask', true);
                  }
                }
              }}
              variant="outline"
              className="w-full"
            >
              <div className="text-center">
                <div className="font-medium">Unlink Whole Group</div>
                <div className="text-xs text-gray-500 mt-1">
                  All {unlinkingGroupSize} tasks become unlinked and sequential if any was sequential
                </div>
              </div>
            </Button>
            
            <Button 
              onClick={async () => {
                // Just unlink this task - apply changes immediately
                setShowUnlinkDialog(false);
                setSkipUnlinkDialog(true); // Set flag to prevent dialog from showing again
                
                // Apply the pending form data and submit immediately
                if (pendingFormData) {
                  try {
                    // Prepare the data for immediate submission
                    const processedData = {
                      ...pendingFormData,
                      linkedTaskGroup: null, // Remove from linked group
                      dependentOnPrevious: true // Make sequential to linked group
                    };
                    
                    console.log('🔗 JUST UNLINKING CURRENT TASK - submitting directly');
                    
                    // Find all other tasks in the linked group to position after them
                    const linkedGroupTasks = (existingTasks as any[]).filter((t: any) => 
                      t.linkedTaskGroup === task.linkedTaskGroup && (t.taskId || t.id) !== (task.taskId || task.id)
                    );
                    
                    console.log('Linked group tasks:', linkedGroupTasks.map(t => ({ name: t.name, order: t.order })));
                    
                    // Trigger batch update with ALL tasks to properly handle positioning logic
                    if (linkedGroupTasks.length > 0) {
                      // Create the full task list with the current task updated
                      let allTasks = [...(existingTasks as any[])];
                      const currentTaskIndex = allTasks.findIndex(t => (t.taskId || t.id) === (task.taskId || task.id));
                      
                      if (currentTaskIndex >= 0) {
                        allTasks[currentTaskIndex] = {
                          ...allTasks[currentTaskIndex],
                          ...processedData
                        };
                      }
                      
                      // Find the highest order in the linked group and position current task after it
                      const maxOrderInGroup = Math.max(...linkedGroupTasks.map(t => t.order || 0));
                      const newOrder = maxOrderInGroup + 1;
                      
                      console.log('Positioning task after order:', maxOrderInGroup, 'new order:', newOrder);
                      
                      // Shift tasks to make space
                      allTasks.forEach(t => {
                        if ((t.order || 0) >= newOrder && (t.taskId || t.id) !== (task.taskId || task.id)) {
                          t.order = (t.order || 0) + 1;
                        }
                      });
                      
                      // Set current task's new order
                      if (currentTaskIndex >= 0) {
                        allTasks[currentTaskIndex].order = newOrder;
                      }
                      
                      // Check if the current task being unlinked was the sequential one in the group
                      const currentTaskWasSequential = task.dependentOnPrevious;
                      if (currentTaskWasSequential) {
                        // Find the new first task in the linked group (lowest order among remaining linked tasks)
                        const remainingLinkedTasks = linkedGroupTasks.filter(t => 
                          t.linkedTaskGroup === task.linkedTaskGroup
                        );
                        
                        if (remainingLinkedTasks.length > 0) {
                          // Sort by order to find the new first task
                          const sortedLinkedTasks = remainingLinkedTasks.sort((a, b) => (a.order || 0) - (b.order || 0));
                          const newFirstLinkedTask = sortedLinkedTasks[0];
                          
                          // Update the new first linked task to be sequential
                          const newFirstTaskIndex = allTasks.findIndex(t => 
                            (t.taskId || t.id) === (newFirstLinkedTask.taskId || newFirstLinkedTask.id)
                          );
                          
                          if (newFirstTaskIndex >= 0) {
                            allTasks[newFirstTaskIndex] = {
                              ...allTasks[newFirstTaskIndex],
                              dependentOnPrevious: true
                            };
                            
                            console.log('Making new first linked task sequential:', {
                              taskName: newFirstLinkedTask.name,
                              previouslySequential: newFirstLinkedTask.dependentOnPrevious,
                              nowSequential: true
                            });
                          }
                        }
                      }
                      
                      // Re-sort and reassign orders
                      allTasks.sort((a, b) => (a.order || 0) - (b.order || 0));
                      allTasks.forEach((t, index) => {
                        t.order = index;
                      });
                      
                      console.log('Final task ordering:', allTasks.map(t => ({ name: t.name, order: t.order, sequential: t.dependentOnPrevious })));
                      
                      // Update all tasks with the new ordering
                      batchUpdateTasksMutation.mutate(allTasks);
                    } else {
                      // Fallback to single task update
                      updateTaskMutation.mutate(processedData);
                    }
                  } catch (error) {
                    console.error('Failed to unlink task:', error);
                    toast({
                      title: "Error",
                      description: "Failed to unlink task",
                      variant: "destructive",
                    });
                  }
                }
                setPendingFormData(null);
              }}
              variant="outline"
              className="w-full"
            >
              <div className="text-center">
                <div className="font-medium">Just Unlink This Task</div>
                <div className="text-xs text-gray-500 mt-1">
                  Continue editing - other tasks stay linked
                </div>
              </div>
            </Button>
            
            <Button 
              onClick={() => {
                // Cancel - keep task linked
                setShowUnlinkDialog(false);
                setPendingFormData(null);
                setSkipUnlinkDialog(false); // Reset flag
                // Reset checkbox to checked state
                form.setValue('linkToExistingTask', true);
              }}
              variant="ghost"
              className="w-full"
            >
              Cancel
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}