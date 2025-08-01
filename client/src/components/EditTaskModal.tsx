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
import { updateTaskDependenciesEnhanced, unlinkTask, getLinkedTasks, generateLinkedTaskGroupId } from "@shared/taskUtils";
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
  "Punchlist Demo",
  "Punchlist Concrete",
  "Punchlist General Labor"
];

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
    areAdjacent?: boolean
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
    mutationFn: async (updatedTasks: any[]) => {
      // Update each task individually but batch the requests
      // Note: First task rule enforcement is handled by drag logic and server-side validation
      const promises = updatedTasks.map(taskData => 
        apiRequest(`/api/tasks/${taskData.id}`, {
          method: 'PUT',
          body: JSON.stringify(taskData),
          headers: { 'Content-Type': 'application/json' }
        })
      );
      
      const responses = await Promise.all(promises);
      return responses.map(response => response.json());
    },
    onSuccess: async () => {
      console.log('🔗 BATCH UPDATE SUCCESS: Running sequential realignment after linking operations');
      
      // Get locationId from the current task
      const currentLocationId = task?.locationId;
      if (!currentLocationId) {
        console.log('❌ No locationId found, skipping sequential realignment');
        onTaskUpdate();
        toast({ 
          title: "Success", 
          description: "Task and dependent tasks updated successfully" 
        });
        onClose();
        return;
      }
      
      // Refetch the latest tasks first and wait for fresh data
      await queryClient.invalidateQueries({ queryKey: [`/api/locations/${currentLocationId}/tasks`] });
      
      // Force refetch to get the latest data
      const refreshedTasksData = await queryClient.fetchQuery({
        queryKey: [`/api/locations/${currentLocationId}/tasks`],
        staleTime: 0 // Force fresh fetch
      });
      
      if (refreshedTasksData && Array.isArray(refreshedTasksData)) {
        console.log('🔄 RUNNING SEQUENTIAL REALIGNMENT after linking operations');
        console.log('🔍 Tasks before realignment:', refreshedTasksData.map(t => ({ 
          name: t.name, 
          order: t.order, 
          date: t.taskDate, 
          sequential: t.dependentOnPrevious,
          linked: !!t.linkedTaskGroup
        })));
        
        // Import the realignment function
        const { realignDependentTasks } = await import('../../../shared/taskUtils');
        
        // Apply sequential realignment to the refreshed tasks sorted by order
        const sortedTasks = [...refreshedTasksData].sort((a, b) => (a.order || 0) - (b.order || 0));
        const realignedTasks = realignDependentTasks(sortedTasks);
        
        // Check if any tasks need additional updates due to sequential realignment
        const additionalUpdates = realignedTasks.filter((realignedTask, index) => {
          const originalTask = sortedTasks[index];
          return originalTask && originalTask.taskDate !== realignedTask.taskDate;
        });
        
        if (additionalUpdates.length > 0) {
          console.log('📝 ADDITIONAL UPDATES needed after sequential realignment:', additionalUpdates.length, 'tasks');
          console.log('📝 Updates needed:', additionalUpdates.map(t => ({ 
            name: t.name, 
            oldDate: sortedTasks.find(st => st.id === t.id)?.taskDate,
            newDate: t.taskDate 
          })));
          
          // Perform additional updates for tasks that need date changes
          const additionalPromises = additionalUpdates.map(taskData => 
            apiRequest(`/api/tasks/${taskData.id}`, {
              method: 'PUT',
              body: JSON.stringify(taskData),
              headers: { 'Content-Type': 'application/json' }
            })
          );
          
          await Promise.all(additionalPromises);
          console.log('✅ SEQUENTIAL REALIGNMENT COMPLETE: All dependent tasks updated');
        } else {
          console.log('✅ NO ADDITIONAL UPDATES needed after sequential realignment');
        }
      } else {
        console.log('❌ Failed to get refreshed tasks data for sequential realignment');
      }
      
      // Final refetch to get the updated state
      onTaskUpdate();
      toast({ 
        title: "Success", 
        description: "Task and dependent tasks updated successfully" 
      });
      onClose();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update tasks with dependencies", 
        variant: "destructive" 
      });
    },
  });

  const onSubmit = (data: any) => {
    console.log('Form submitted with data:', data);
    console.log('Form errors:', form.formState.errors);
    
    // Process the form submission with the current date change action
    processFormSubmission(data);
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
      
      // Recalculate dates for sequential tasks
      for (let i = 1; i < sortedAllTasks.length; i++) {
        const currentTask = sortedAllTasks[i];
        const prevTask = sortedAllTasks[i - 1];
        
        // If this task is sequential and not in a linked group that overrides dates
        if (currentTask.dependentOnPrevious) {
          const baseDate = new Date(prevTask.taskDate + 'T00:00:00');
          const nextDate = new Date(baseDate);
          nextDate.setDate(nextDate.getDate() + 1);
          
          // Skip weekends
          while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
            nextDate.setDate(nextDate.getDate() + 1);
          }
          
          const newSequentialDate = nextDate.toISOString().split('T')[0];
          
          // Update the task date
          currentTask.taskDate = newSequentialDate;
          
          // If this task is part of a linked group, update all linked tasks to the same date
          if (currentTask.linkedTaskGroup) {
            sortedAllTasks.forEach(task => {
              if (task.linkedTaskGroup === currentTask.linkedTaskGroup) {
                task.taskDate = newSequentialDate;
              }
            });
          }
        }
      }
      
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
      "General Labor": "GENERAL",
      "Landscaping": "LANDSCAPE", 
      "Utility Adjustment": "UTILITY ADJ",
      "Punchlist Demo": "PUNCHLIST",
      "Punchlist Concrete": "PUNCHLIST",
      "Punchlist General Labor": "PUNCHLIST"
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
    
    // Handle linking changes
    let linkingChanged = data.linkToExistingTask !== !!task.linkedTaskGroup;
    
    if (data.linkToExistingTask && data.linkedTaskIds && data.linkedTaskIds.length > 0) {
      // LINKING TO MULTIPLE TASKS
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
        
        if (uniqueDates.length === 1) {
          // All tasks already have the same date - proceed with linking directly
          console.log('All tasks have same date - linking directly');
          
          // Create new linked group or use existing one from any of the linked tasks
          const linkedTaskGroup = linkedTasks.find(t => t.linkedTaskGroup)?.linkedTaskGroup || generateLinkedTaskGroupId();
          processedData.linkedTaskGroup = linkedTaskGroup;
          
          // Use the common date (since all tasks have same date at this point)
          processedData.taskDate = uniqueDates[0].date;
        } else {
          // Show date choice dialog for multiple dates
          console.log('Multiple dates available - showing date choice dialog');
          setLinkingOptions({
            currentTask: task,
            targetTasks: linkedTasks,
            availableDates: uniqueDates
          });
          setShowLinkDateDialog(true);
          setPendingFormData(data);
          return;
        }
      }
    } else if (!data.linkToExistingTask && task.linkedTaskGroup) {
      // UNLINKING FROM GROUP
      const groupTasks = (existingTasks as any[]).filter((t: any) => 
        t.linkedTaskGroup === task.linkedTaskGroup && (t.taskId || t.id) !== (task.taskId || task.id)
      );
      
      if (groupTasks.length >= 2 && !skipUnlinkDialog) {
        // Multi-task group - show unlink dialog (unless user already chose to skip it)
        setUnlinkingGroupSize(groupTasks.length + 1); // +1 for current task
        setShowUnlinkDialog(true);
        setPendingFormData(data);
        return;
      } else if (skipUnlinkDialog && groupTasks.length >= 2) {
        // User chose "Just unlink this task" - only unlink current task
        console.log('🔗 JUST UNLINKING CURRENT TASK - other tasks remain linked');
        processedData.linkedTaskGroup = null;
        
        // Check if current task is first task - first task must stay unsequential
        const isCurrentTaskFirst = task.order === 0 || ((existingTasks as any[]).length > 0 && 
          (existingTasks as any[]).sort((a: any, b: any) => (a.order || 0) - (b.order || 0))[0].id === task.id);
        
        // Keep current sequential status unless it's the first task
        processedData.dependentOnPrevious = isCurrentTaskFirst ? false : task.dependentOnPrevious;
        
        console.log('Current task unlinking (just this task):', {
          isCurrentTaskFirst,
          originalSequential: task.dependentOnPrevious,
          finalStatus: processedData.dependentOnPrevious
        });
        
        // Do NOT mark linkingChanged = true because we don't want to affect other tasks
      } else {
        // Two-task group - use existing logic to unlink both
        processedData.linkedTaskGroup = null;
        
        // For current task, determine if either task was sequential
        const partnerTask = groupTasks[0];
        const currentWasSequential = task.dependentOnPrevious;
        const partnerWasSequential = partnerTask ? partnerTask.dependentOnPrevious : false;
        const eitherWasSequential = currentWasSequential || partnerWasSequential;
        
        // Check if current task is first task - first task must stay unsequential
        const isCurrentTaskFirst = task.order === 0 || ((existingTasks as any[]).length > 0 && 
          (existingTasks as any[]).sort((a: any, b: any) => (a.order || 0) - (b.order || 0))[0].id === task.id);
        
        processedData.dependentOnPrevious = isCurrentTaskFirst ? false : eitherWasSequential;
        
        console.log('Current task unlinking (both tasks):', {
          currentWasSequential,
          partnerWasSequential,
          eitherWasSequential,
          isCurrentTaskFirst,
          finalStatus: processedData.dependentOnPrevious
        });
        
        // Mark that we need to unlink the partner task too
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
    const isFirstTask = task.order === 0 || (sortedTasks.length > 0 && sortedTasks[0].id === task.id);
    
    if (isFirstTask) {
      console.log('Enforcing first task rule: making first task unsequential', {
        taskId: task.id,
        taskOrder: task.order,
        originalDependency: data.dependentOnPrevious,
        forcingToFalse: true
      });
      processedData.dependentOnPrevious = false;
      // Force the form value too to ensure UI updates
      form.setValue('dependentOnPrevious', false);
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
            // Find the highest order task in the linked group
            const maxOrderInGroup = Math.max(...linkedGroupTasks.map(t => t.order || 0));
            const newOrder = maxOrderInGroup + 1;
            
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
          // User chose "Unlink all tasks" - original logic
          console.log('🔗 UNLINKING ALL TASKS in group');
          
          // Find and unlink all partner tasks
          const partnerTasks = allUpdatedTasks.filter(t => 
            t.linkedTaskGroup === task.linkedTaskGroup && (t.taskId || t.id) !== (task.taskId || task.id)
          );
          
          // Determine if either task was sequential - use ORIGINAL status before unlinking
          const currentWasSequential = task.dependentOnPrevious;
          const anyPartnerWasSequential = partnerTasks.some(t => t.dependentOnPrevious);
          const eitherWasSequential = currentWasSequential || anyPartnerWasSequential;
          
          console.log('Unlinking sequential status analysis:', {
            currentWasSequential,
            anyPartnerWasSequential,
            eitherWasSequential,
            currentTaskOrder: task.order,
            partnerTaskOrders: partnerTasks.map(t => t.order)
          });
          
          allUpdatedTasks = allUpdatedTasks.map(t => {
            if (t.linkedTaskGroup === task.linkedTaskGroup && (t.taskId || t.id) !== (task.taskId || task.id)) {
              // Check if this is the first task (order 0) - first task must stay unsequential
              const isFirstTask = t.order === 0 || (allUpdatedTasks.length > 0 && 
                allUpdatedTasks.sort((a, b) => (a.order || 0) - (b.order || 0))[0].id === t.id);
              
              return { 
                ...t, 
                linkedTaskGroup: null, 
                dependentOnPrevious: isFirstTask ? false : eitherWasSequential 
              };
            }
            return t;
          });
          
          console.log('Unlinked all tasks from group:', task.linkedTaskGroup, 'all become sequential:', eitherWasSequential);
          
          // If any partner task becomes sequential, recalculate their dates and trigger cascading
          partnerTasks.forEach(partnerTask => {
            if (partnerTask) {
              const partnerIndex = allUpdatedTasks.findIndex(t => (t.taskId || t.id) === (partnerTask.taskId || partnerTask.id));
              if (partnerIndex >= 0) {
                // Sort tasks to find chronological previous task for partner
                const sortedTasks = [...allUpdatedTasks].sort((a, b) => {
                  const dateA = new Date(a.taskDate).getTime();
                  const dateB = new Date(b.taskDate).getTime();
                  if (dateA !== dateB) return dateA - dateB;
                  return (a.order || 0) - (b.order || 0);
                });
                
                const partnerSortedIndex = sortedTasks.findIndex(t => (t.taskId || t.id) === (partnerTask.taskId || partnerTask.id));
                
                if (partnerSortedIndex > 0) {
                  const prevTask = sortedTasks[partnerSortedIndex - 1];
                  // Calculate next working day from previous task
                  const baseDate = new Date(prevTask.taskDate + 'T00:00:00');
                  const nextDate = new Date(baseDate);
                  nextDate.setDate(nextDate.getDate() + 1);
                  // Skip weekends
                  while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
                    nextDate.setDate(nextDate.getDate() + 1);
                  }
                  const newDate = nextDate.toISOString().split('T')[0];
                  
                  // Update partner task with sequential date
                  allUpdatedTasks[partnerIndex] = {
                    ...allUpdatedTasks[partnerIndex],
                    taskDate: newDate
                  };
                  
                  console.log('Updated unlinked partner task sequential date to:', newDate);
                }
              }
            }
          });
        }
      }

      // Handle dependency changes - when a task becomes sequential OR when linked task becomes sequential
      if ((dependencyChanged && processedData.dependentOnPrevious) || 
          (linkingChanged && processedData.linkedTaskGroup && processedData.dependentOnPrevious)) {
        
        const taskIndex = allUpdatedTasks.findIndex(t => (t.taskId || t.id) === (task.taskId || task.id));
        
        // Sort tasks by date and order to find chronological position
        const sortedTasks = [...allUpdatedTasks].sort((a, b) => {
          const dateA = new Date(a.taskDate).getTime();
          const dateB = new Date(b.taskDate).getTime();
          if (dateA !== dateB) return dateA - dateB;
          return (a.order || 0) - (b.order || 0);
        });
        
        // Find current task in sorted list to get its chronological position
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
          console.log('Handling unsequential_shift_others action - task is now non-sequential but should shift following sequential tasks');
          
          // Find all tasks that come after this task in the original order (not by date, but by actual position/order)
          const originalTaskOrder = task.order || 0;
          
          // Get all tasks after this one, sorted by order
          const allSubsequentTasks = allUpdatedTasks.filter(t => {
            const taskOrder = t.order || 0;
            return taskOrder > originalTaskOrder && (t.taskId || t.id) !== (task.taskId || task.id);
          }).sort((a, b) => (a.order || 0) - (b.order || 0));
          
          // Collect ALL sequential tasks, regardless of linked groups in between
          const subsequentTasks: any[] = [];
          for (const subsequentTask of allSubsequentTasks) {
            if (subsequentTask.dependentOnPrevious) {
              subsequentTasks.push(subsequentTask);
            } else if (!subsequentTask.linkedTaskGroup) {
              // Stop only when we hit an unsequential task that's NOT in a linked group
              console.log('Stopping at unsequential non-linked task:', subsequentTask.name, 'order:', subsequentTask.order);
              break;
            }
            // Skip unsequential linked tasks but continue looking for sequential tasks beyond them
          }
          
          console.log('Found', subsequentTasks.length, 'subsequent sequential tasks to shift');
          console.log('Original task order:', originalTaskOrder, 'New date:', processedData.taskDate);
          console.log('Subsequent tasks to shift:', subsequentTasks.map(t => ({ name: t.name, order: t.order, dependentOnPrevious: t.dependentOnPrevious })));
          
          if (subsequentTasks.length > 0) {
            let currentDate = processedData.taskDate; // Start from the changed task's new date
            
            subsequentTasks.forEach(subsequentTask => {
              // Calculate next working day from the current baseline
              const baseDate = new Date(currentDate + 'T00:00:00');
              const nextDate = new Date(baseDate);
              nextDate.setDate(nextDate.getDate() + 1);
              // Skip weekends
              while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
                nextDate.setDate(nextDate.getDate() + 1);
              }
              const newDate = nextDate.toISOString().split('T')[0];
              
              // Update the task in the array
              const originalIndex = allUpdatedTasks.findIndex((t: any) => 
                (t.taskId || t.id) === (subsequentTask.taskId || subsequentTask.id)
              );
              
              if (originalIndex >= 0) {
                console.log('Shifting sequential task:', subsequentTask.name, 'from:', subsequentTask.taskDate, 'to:', newDate);
                
                allUpdatedTasks[originalIndex] = {
                  ...allUpdatedTasks[originalIndex],
                  taskDate: newDate
                };
                
                // If this task is linked, update all tasks in its linked group 
                if (subsequentTask.linkedTaskGroup) {
                  const linkedGroupDate = newDate;
                  allUpdatedTasks = allUpdatedTasks.map(t => {
                    if (t.linkedTaskGroup === subsequentTask.linkedTaskGroup) {
                      console.log('Syncing linked task:', t.name, 'to:', linkedGroupDate);
                      return { ...t, taskDate: linkedGroupDate };
                    }
                    return t;
                  });
                  // Update currentDate to the linked group date for subsequent calculations
                  currentDate = linkedGroupDate;
                } else {
                  currentDate = newDate; // Update baseline for next task
                }
              }
            });
            
            // After shifting all sequential tasks, continue shifting any remaining sequential tasks after linked groups
            const remainingTasks = allSubsequentTasks.filter(t => {
              const taskOrder = t.order || 0;
              const lastShiftedOrder = subsequentTasks.length > 0 ? Math.max(...subsequentTasks.map(st => st.order || 0)) : originalTaskOrder;
              return taskOrder > lastShiftedOrder && t.dependentOnPrevious;
            });
            
            console.log('Found', remainingTasks.length, 'additional sequential tasks after linked groups');
            
            remainingTasks.forEach(remainingTask => {
              // Calculate next working day from the current baseline
              const baseDate = new Date(currentDate + 'T00:00:00');
              const nextDate = new Date(baseDate);
              nextDate.setDate(nextDate.getDate() + 1);
              // Skip weekends
              while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
                nextDate.setDate(nextDate.getDate() + 1);
              }
              const newDate = nextDate.toISOString().split('T')[0];
              
              const originalIndex = allUpdatedTasks.findIndex((t: any) => 
                (t.taskId || t.id) === (remainingTask.taskId || remainingTask.id)
              );
              
              if (originalIndex >= 0) {
                console.log('Shifting remaining sequential task:', remainingTask.name, 'from:', remainingTask.taskDate, 'to:', newDate);
                
                allUpdatedTasks[originalIndex] = {
                  ...allUpdatedTasks[originalIndex],
                  taskDate: newDate
                };
                
                currentDate = newDate; // Update baseline for next task
              }
            });
          }
        } else {
          // For other actions (sequential, unsequential_move_only), use the existing cascading logic
          // This is the original logic for normal sequential dependency processing
          
          // Only reassign order values for non-"unsequential_shift_others" actions
          // After processing dependencies, sort tasks by date and reassign orders to maintain chronological positioning
          const finalSortedTasks = [...allUpdatedTasks].sort((a, b) => {
            const dateA = new Date(a.taskDate).getTime();
            const dateB = new Date(b.taskDate).getTime();
            if (dateA !== dateB) return dateA - dateB;
            return (a.order || 0) - (b.order || 0);
          });
          
          // Reassign order values to maintain chronological positioning
          finalSortedTasks.forEach((sortedTask, index) => {
            const originalIndex = allUpdatedTasks.findIndex(t => (t.taskId || t.id) === (sortedTask.taskId || sortedTask.id));
            if (originalIndex >= 0) {
              allUpdatedTasks[originalIndex] = {
                ...allUpdatedTasks[originalIndex],
                order: index
              };
            }
          });
        }
        
        console.log('Sequential cascading complete');
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
                      <Input {...field} placeholder="Enter task name" />
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
                        onCheckedChange={(checked) => {
                          if (!checked && task.linkedTaskGroup && !skipUnlinkDialog) {
                            // User is unchecking link - determine group size for unlink dialog
                            const groupTasks = (existingTasks as any[]).filter((t: any) => 
                              t.linkedTaskGroup === task.linkedTaskGroup
                            );
                            
                            if (groupTasks.length > 2) {
                              // Multi-task group - show unlink dialog
                              setUnlinkingGroupSize(groupTasks.length);
                              setShowUnlinkDialog(true);
                              setPendingFormData({ ...form.getValues(), linkToExistingTask: false });
                              return;
                            }
                          }
                          
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
                                    onClick={() => {
                                      const newValue = (field.value || []).filter((id: string) => id !== taskId);
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
                              onValueChange={(value) => {
                                if (value && !(field.value || []).includes(value)) {
                                  field.onChange([...(field.value || []), value]);
                                }
                              }}
                            >
                              <SelectTrigger className="border-none shadow-none p-0 h-auto focus:ring-0">
                                <SelectValue placeholder={(field.value || []).length === 0 ? "Choose tasks to link with" : "Add more tasks..."} />
                              </SelectTrigger>
                              <SelectContent>
                                {(Array.isArray(existingTasks) ? existingTasks : [])
                                  .filter((t: any) => 
                                    (t.taskId || t.id) !== (task.taskId || task.id) && // Exclude current task
                                    !(field.value || []).includes((t.taskId || t.id).toString())
                                  )
                                  .sort((a: any, b: any) => {
                                    const dateA = new Date(a.taskDate).getTime();
                                    const dateB = new Date(b.taskDate).getTime();
                                    if (dateA !== dateB) return dateA - dateB;
                                    return (a.order || 0) - (b.order || 0);
                                  })
                                  .map((task: any) => {
                                    const formatDate = (dateStr: string) => {
                                      const [year, month, day] = dateStr.split('-');
                                      return `${month}/${day}/${year}`;
                                    };
                                    
                                    return (
                                      <SelectItem 
                                        key={task.taskId || task.id} 
                                        value={(task.taskId || task.id).toString()}
                                      >
                                        <div className="flex items-center justify-between w-full">
                                          <span className="flex-1">{task.name}</span>
                                          <span className="text-xs text-gray-500 ml-2">
                                            {formatDate(task.taskDate)}
                                          </span>
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

            {/* Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
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
                      <Input type="time" {...field} />
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
                    <Textarea rows={3} placeholder="Describe the work to be performed..." {...field} />
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
              Choose Date for Linked Tasks
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 space-y-2">
              {linkingOptions?.targetTasks ? (
                <div>
                  <div>You're linking "{linkingOptions.currentTask?.name}" to {linkingOptions.targetTasks.length} task(s):</div>
                  <ul className="text-sm mt-1 ml-4 list-disc">
                    {linkingOptions.targetTasks.map((t: any, idx: number) => (
                      <li key={idx}>{t.name}</li>
                    ))}
                  </ul>
                  <div className="mt-2">All tasks must have the same date. Which date should all tasks use?</div>
                </div>
              ) : (
                <div>
                  <div>You're linking "{linkingOptions?.currentTask?.name}" to "{linkingOptions?.targetTasks?.[0]?.name || 'target task'}".</div>
                  <div>Both tasks must have the same date. Which date should both tasks use?</div>
                </div>
              )}
              {linkingOptions?.currentIsSequential !== undefined && linkingOptions?.linkedIsSequential !== undefined && (
                <div className="text-sm text-gray-500 mt-2">
                  {linkingOptions.currentIsSequential && !linkingOptions.linkedIsSequential ? (
                    <div>
                      <div>Current task is <span className="font-medium text-blue-600">sequential</span>, target is <span className="font-medium text-orange-600">unsequential</span>.</div>
                      <div className="mt-1">Choosing <span className="font-medium text-orange-600">unsequential task's date</span> will make both unsequential.</div>
                    </div>
                  ) : !linkingOptions.currentIsSequential && linkingOptions.linkedIsSequential ? (
                    <div>
                      <div>Current task is <span className="font-medium text-orange-600">unsequential</span>, target is <span className="font-medium text-blue-600">sequential</span>.</div>
                      <div className="mt-1">Choosing <span className="font-medium text-orange-600">unsequential task's date</span> will make both unsequential.</div>
                    </div>
                  ) : !linkingOptions.currentIsSequential && !linkingOptions.linkedIsSequential ? (
                    <div className="font-medium text-orange-600">Both tasks are unsequential and will remain unsequential.</div>
                  ) : linkingOptions.areAdjacent ? (
                    <div>Adjacent sequential tasks: Will use earlier date automatically, only earlier task stays sequential.</div>
                  ) : (
                    <div>Both sequential tasks will keep their sequential status.</div>
                  )}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col space-y-3 sm:flex-col">
            {/* Show buttons for available dates */}
            {linkingOptions?.availableDates ? (
              linkingOptions.availableDates.map((dateOption, idx) => (
                <Button 
                  key={idx}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (showLinkDateDialog) {
                      handleLinkDateChoice(dateOption.date);
                    }
                  }}
                  variant="outline"
                  className="w-full"
                  type="button"
                  disabled={!showLinkDateDialog}
                >
                  <div className="text-center">
                    <div className="font-medium">Use "{dateOption.taskName}" Date</div>
                    <div className="text-xs mt-1 text-gray-500">
                      {new Date(dateOption.date + 'T00:00:00').toLocaleDateString('en-US', { 
                        month: '2-digit', 
                        day: '2-digit', 
                        year: 'numeric' 
                      })}
                    </div>
                  </div>
                </Button>
              ))
            ) : (
              <>
                <Button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (showLinkDateDialog) {
                      handleLinkDateChoice(linkingOptions?.currentTask?.taskDate || '');
                    }
                  }}
                  variant="outline"
                  className="w-full"
                  type="button"
                  disabled={!showLinkDateDialog}
                >
                  <div className="text-center">
                    <div className="font-medium">Use "{linkingOptions?.currentTask?.name}" Date</div>
                    <div className="text-xs mt-1 text-gray-500">
                      {linkingOptions?.currentTask?.taskDate && new Date(linkingOptions.currentTask.taskDate + 'T00:00:00').toLocaleDateString('en-US', { 
                        month: '2-digit', 
                        day: '2-digit', 
                        year: 'numeric' 
                      })}
                    </div>
                  </div>
                </Button>
                <Button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (showLinkDateDialog) {
                      // For single task linking fallback, use the first target task
                      const firstTargetTask = linkingOptions?.targetTasks?.[0];
                      handleLinkDateChoice(firstTargetTask?.taskDate || '');
                    }
                  }}
                  variant="outline"
                  className="w-full"
                  type="button"
                  disabled={!showLinkDateDialog}
                >
                  <div className="text-center">
                    <div className="font-medium">Use "{linkingOptions?.targetTasks?.[0]?.name || 'Target Task'}" Date</div>
                    <div className="text-xs mt-1 text-gray-500">
                      {linkingOptions?.targetTasks?.[0]?.taskDate && new Date(linkingOptions.targetTasks[0].taskDate + 'T00:00:00').toLocaleDateString('en-US', { 
                        month: '2-digit', 
                        day: '2-digit', 
                        year: 'numeric' 
                      })}
                    </div>
                  </div>
                </Button>
              </>
            )}
            <Button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (showLinkDateDialog) {
                  // Cancel linking
                  setShowLinkDateDialog(false);
                  setLinkingOptions(null);
                  setPendingFormData(null);
                }
              }}
              variant="ghost"
              className="w-full"
              type="button"
              disabled={!showLinkDateDialog}
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
                  
                  // Determine if any task in the group is sequential
                  const anyTaskSequential = groupTasks.some((t: any) => t.dependentOnPrevious);
                  
                  // Unlink all tasks in the group and make them sequential if any was sequential
                  const unlinkPromises = groupTasks.map((groupTask: any) => 
                    apiRequest(`/api/tasks/${groupTask.id}`, {
                      method: 'PUT',
                      body: JSON.stringify({
                        linkedTaskGroup: null,
                        dependentOnPrevious: anyTaskSequential && groupTask.order > 0 // First task stays unsequential
                      }),
                      headers: {
                        'Content-Type': 'application/json'
                      }
                    })
                  );
                  
                  try {
                    await Promise.all(unlinkPromises);
                    
                    // Update form and close modal
                    form.setValue('linkToExistingTask', false);
                    form.setValue('linkedTaskIds', []);
                    
                    toast({
                      title: "Success",
                      description: `Unlinked all ${unlinkingGroupSize} tasks from the group`,
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
              variant="default"
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
              onClick={() => {
                // Just unlink this task - continue with normal editing
                setShowUnlinkDialog(false);
                setSkipUnlinkDialog(true); // Set flag to prevent dialog from showing again
                
                // Apply the pending form data (which has linkToExistingTask: false)
                if (pendingFormData) {
                  Object.keys(pendingFormData).forEach(key => {
                    if (key in form.getValues()) {
                      form.setValue(key as any, pendingFormData[key]);
                    }
                  });
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