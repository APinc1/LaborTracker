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
import { updateTaskDependenciesEnhanced, unlinkTask, getLinkedTasks, generateLinkedTaskGroupId, findLinkedTaskGroups, getLinkedGroupTaskIds, realignDependentTasks, getTaskStatus } from "@shared/taskUtils";
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

  // Fetch assignments to check task completion status
  const { data: allAssignments = [] } = useQuery({
    queryKey: ["/api/assignments"],
    enabled: isOpen,
    staleTime: 30000,
  });

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
  const createPositionOptions = (targetTasks: any[]) => {
    // Include the current task as well as the target tasks for position options
    const allRelevantTasks = [task, ...targetTasks];
    
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
      
      // Sort all tasks to update by their original order to determine which should be first
      const sortedTasksToUpdate = [...allTasksToUpdate].sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        return new Date(a.taskDate).getTime() - new Date(b.taskDate).getTime();
      });
      
      // Update all tasks with the chosen position data
      const tasksToUpdate = allTasksToUpdate.map((taskToUpdate) => {
        // Find if this is the first task in the chronologically sorted linked group
        const isFirstInGroup = sortedTasksToUpdate[0] === taskToUpdate;
        
        if (taskToUpdate === task) {
          // Current task being edited
          const updatedTask = {
            ...task,
            ...data,
            taskDate: baseDate,
            linkedTaskGroup: linkedTaskGroup,
            dependentOnPrevious: makeSequential && isFirstInGroup, // Only first task in group can be sequential
          };
          console.log('Updated main task:', updatedTask);
          return updatedTask;
        } else {
          // Linked task
          const updatedLinkedTask = {
            ...taskToUpdate,
            linkedTaskGroup: linkedTaskGroup,
            taskDate: baseDate,
            dependentOnPrevious: makeSequential && isFirstInGroup, // Only first task in group can be sequential
          };
          console.log('Updated linked task:', updatedLinkedTask);
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
      
      // Sort by order and apply realignment
      allTasksWithUpdates.sort((a, b) => (a.order || 0) - (b.order || 0));
      console.log('🔄 REALIGNING: Sequential tasks after simple linking');
      const realignedTasks = realignDependentTasks(allTasksWithUpdates);
      
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
      
      // CRITICAL: Use proper realignDependentTasks function for weekday-aware sequential calculations
      console.log('🔄 REALIGNING: Sequential tasks after linking in EditTaskModal');
      const realignedTasks = realignDependentTasks(sortedAllTasks);
      
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
      "General Labor": "GENERAL",
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
        const allTasksSorted = [task, ...linkedTasks].sort((a, b) => (a.order || 0) - (b.order || 0));
        
        if (allTasksSorted.length === 2) {
          const firstTask = allTasksSorted[0];
          const secondTask = allTasksSorted[1];
          
          // Check if first task is unsequential and not the first task in the entire list
          // AND second task is sequential and comes right after the first
          const firstTaskOrder = firstTask.order || 0;
          const secondTaskOrder = secondTask.order || 0;
          const isConsecutiveOrder = secondTaskOrder === firstTaskOrder + 1;
          const isFirstTaskNonSequentialNotFirst = !firstTask.dependentOnPrevious && firstTaskOrder > 0;
          const isSecondTaskSequential = secondTask.dependentOnPrevious;
          
          if (isFirstTaskNonSequentialNotFirst && isSecondTaskSequential && isConsecutiveOrder) {
            console.log('🔗 SPECIAL CASE: Non-consecutive + sequential consecutive tasks - auto-linking as unsequential');
            
            // Auto-link them as unsequential at the first task's date
            const linkedTaskGroup = generateLinkedTaskGroupId();
            const targetDate = firstTask.taskDate;
            
            const tasksToUpdate = allTasksSorted.map(taskToUpdate => ({
              ...taskToUpdate,
              linkedTaskGroup: linkedTaskGroup,
              taskDate: targetDate,
              dependentOnPrevious: false // Both become unsequential
            }));
            
            console.log('Special case auto-linking:', tasksToUpdate.map(t => ({ 
              name: t.name, 
              date: t.taskDate, 
              sequential: t.dependentOnPrevious 
            })));
            
            // CRITICAL: After linking tasks, we need to realign subsequent sequential tasks
            // Get all tasks, update the linked ones, then recalculate sequential dates
            const allTasks = [...(existingTasks as any[])];
            
            // Update the linked tasks in the full task list
            tasksToUpdate.forEach(updatedTask => {
              const existingIndex = allTasks.findIndex(t => 
                (t.taskId || t.id) === (updatedTask.taskId || updatedTask.id)
              );
              if (existingIndex >= 0) {
                allTasks[existingIndex] = updatedTask;
              }
            });
            
            // Sort by order and recalculate sequential dates
            allTasks.sort((a, b) => (a.order || 0) - (b.order || 0));
            
            // Use the shared utility to realign dependent tasks
            const realignedTasks = realignDependentTasks(allTasks);
            
            // Find all tasks that changed (either from linking or date realignment)
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
            
            console.log('Final linking updates with realigned dates:', finalTasksToUpdate.map(t => ({ 
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
          availableDates: [] // No longer used, but keeping for compatibility
        };
        
        console.log('🔗 Setting linking options:', linkingOptionsData);
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
        // Two-task group or larger - unlink all tasks and restore natural sequential dependencies
        processedData.linkedTaskGroup = null;
        
        // Get all tasks in the group including current task
        const allGroupTasks = [task, ...groupTasks];
        
        // Sort all tasks by order to determine natural sequential dependencies
        const allTasksSortedByOrder = (existingTasks as any[]).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
        
        // For current task, determine what its sequential status should naturally be
        const currentTaskOrder = task.order || 0;
        const isCurrentTaskFirst = currentTaskOrder === 0 || 
          allTasksSortedByOrder[0] && (allTasksSortedByOrder[0].taskId || allTasksSortedByOrder[0].id) === (task.taskId || task.id);
        
        // Current task should be sequential if it's not the first task in the entire list
        processedData.dependentOnPrevious = !isCurrentTaskFirst;
        
        console.log('Current task unlinking (natural dependencies):', {
          currentTaskOrder,
          isCurrentTaskFirst,
          naturalSequentialStatus: processedData.dependentOnPrevious
        });
        
        // Mark that we need to unlink and restore sequential status for other tasks too
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
          // User chose "Unlink all tasks" - original logic
          console.log('🔗 UNLINKING ALL TASKS in group');
          
          // Find and unlink all partner tasks
          const partnerTasks = allUpdatedTasks.filter(t => 
            t.linkedTaskGroup === task.linkedTaskGroup && (t.taskId || t.id) !== (task.taskId || task.id)
          );
          
          // When unlinking, restore natural sequential dependencies based on task order
          console.log('🔗 Unlinking all tasks - restoring natural sequential dependencies');
          console.log('🔗 All tasks before unlinking:', allUpdatedTasks.map(t => ({ 
            name: t.name, 
            order: t.order, 
            id: t.taskId || t.id, 
            linkedGroup: t.linkedTaskGroup 
          })));
          
          // Get sorted list to determine first task properly
          const sortedForFirstCheck = [...allUpdatedTasks].sort((a, b) => (a.order || 0) - (b.order || 0));
          const firstTaskId = sortedForFirstCheck[0]?.taskId || sortedForFirstCheck[0]?.id;
          console.log('🔗 First task ID in list:', firstTaskId);
          
          allUpdatedTasks = allUpdatedTasks.map(t => {
            if (t.linkedTaskGroup === task.linkedTaskGroup) {
              // Check if this is the first task in the entire list
              const taskId = t.taskId || t.id;
              const isFirstTask = t.order === 0 || taskId === firstTaskId;
              
              // Natural sequential status: sequential if not the first task
              const naturalSequentialStatus = !isFirstTask;
              
              console.log('🔗 Unlinking task:', t.name, 'order:', t.order, 'taskId:', taskId, 'isFirst:', isFirstTask, 'natural sequential:', naturalSequentialStatus);
              
              return { 
                ...t, 
                linkedTaskGroup: null, 
                dependentOnPrevious: naturalSequentialStatus
              };
            }
            return t;
          });
          
          // Also update the current task (processedData) being edited
          const currentTaskId = task.taskId || task.id;
          const isCurrentTaskFirst = task.order === 0 || currentTaskId === firstTaskId;
          const currentTaskNaturalSequential = !isCurrentTaskFirst;
          
          console.log('🔗 Updating current task sequential status:', currentTaskNaturalSequential, 'order:', task.order);
          processedData.linkedTaskGroup = null;
          processedData.dependentOnPrevious = currentTaskNaturalSequential;
          
          // CRITICAL: If current task becomes sequential after unlinking, calculate its new date
          if (currentTaskNaturalSequential && task.order > 0) {
            // Find the previous task by order to calculate sequential date
            const allTasksSortedByOrder = [...allUpdatedTasks].sort((a, b) => (a.order || 0) - (b.order || 0));
            const currentOrderIndex = allTasksSortedByOrder.findIndex(t => (t.taskId || t.id) === currentTaskId);
            
            if (currentOrderIndex > 0) {
              const prevTask = allTasksSortedByOrder[currentOrderIndex - 1];
              const baseDate = new Date(prevTask.taskDate + 'T00:00:00');
              const nextDate = new Date(baseDate);
              nextDate.setDate(nextDate.getDate() + 1);
              // Skip weekends
              while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
                nextDate.setDate(nextDate.getDate() + 1);
              }
              const newDate = nextDate.toISOString().split('T')[0];
              
              // Update current task's date
              processedData.taskDate = newDate;
              console.log('🔗 Updated current task date to sequential:', newDate, 'based on previous task:', prevTask.name);
            }
          }
          
          console.log('Unlinked all tasks from group:', task.linkedTaskGroup, 'restored natural sequential dependencies');
          
          // CRITICAL: Recalculate ALL sequential task dates in order after unlinking
          // This ensures that if task B becomes sequential to A, and C is sequential to B, 
          // then C gets updated with B's new date + 1 day
          const allTasksSortedByOrder = [...allUpdatedTasks].sort((a, b) => (a.order || 0) - (b.order || 0));
          
          for (let i = 0; i < allTasksSortedByOrder.length; i++) {
            const currentTask = allTasksSortedByOrder[i];
            const currentTaskIndex = allUpdatedTasks.findIndex(t => (t.taskId || t.id) === (currentTask.taskId || currentTask.id));
            
            // Skip if task doesn't exist in allUpdatedTasks or isn't sequential
            if (currentTaskIndex < 0 || !allUpdatedTasks[currentTaskIndex].dependentOnPrevious) {
              continue;
            }
            
            // Find the previous task by order
            if (i > 0) {
              const prevTask = allTasksSortedByOrder[i - 1];
              const baseDate = new Date(prevTask.taskDate + 'T00:00:00');
              const nextDate = new Date(baseDate);
              nextDate.setDate(nextDate.getDate() + 1);
              // Skip weekends
              while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
                nextDate.setDate(nextDate.getDate() + 1);
              }
              const newDate = nextDate.toISOString().split('T')[0];
              
              // Update task with sequential date
              allUpdatedTasks[currentTaskIndex] = {
                ...allUpdatedTasks[currentTaskIndex],
                taskDate: newDate
              };
              
              // Also update the sorted array reference for chain effect
              allTasksSortedByOrder[i].taskDate = newDate;
              
              console.log('🔗 Updated sequential task date:', currentTask.name, 'to:', newDate, 'based on previous task:', prevTask.name);
            }
          }
          
          // Update current task if it was processed in the loop above
          const updatedCurrentTask = allUpdatedTasks.find(t => (t.taskId || t.id) === currentTaskId);
          if (updatedCurrentTask && processedData.dependentOnPrevious) {
            processedData.taskDate = updatedCurrentTask.taskDate;
            console.log('🔗 Synced current task date with batch update:', processedData.taskDate);
          }
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
          
          // CRITICAL: If this task is in a linked group, update ALL tasks in the linked group to the new date first
          if (processedData.linkedTaskGroup) {
            console.log('Task is in linked group - updating all linked tasks to new date:', processedData.taskDate);
            
            const linkedTasks = allUpdatedTasks.filter(t => 
              t.linkedTaskGroup === processedData.linkedTaskGroup
            );
            
            linkedTasks.forEach(linkedTask => {
              const linkedTaskIndex = allUpdatedTasks.findIndex(t => (t.taskId || t.id) === (linkedTask.taskId || linkedTask.id));
              if (linkedTaskIndex >= 0) {
                console.log('Updating linked task:', linkedTask.name, 'from:', linkedTask.taskDate, 'to:', processedData.taskDate);
                allUpdatedTasks[linkedTaskIndex] = {
                  ...allUpdatedTasks[linkedTaskIndex],
                  taskDate: processedData.taskDate // All linked tasks must have same date
                };
              }
            });
          }
          
          // Find all tasks that come after this task (or the linked group) in the original order
          const originalTaskOrder = task.order || 0;
          
          // If in a linked group, find the maximum order among all linked tasks
          let maxOrderInGroup = originalTaskOrder;
          if (processedData.linkedTaskGroup) {
            const linkedTasks = allUpdatedTasks.filter(t => 
              t.linkedTaskGroup === processedData.linkedTaskGroup
            );
            maxOrderInGroup = Math.max(...linkedTasks.map(t => t.order || 0));
            console.log('Linked group max order:', maxOrderInGroup);
          }
          
          // Get all tasks after this task/group, sorted by order
          const allSubsequentTasks = allUpdatedTasks.filter(t => {
            const taskOrder = t.order || 0;
            // Filter tasks that come after the entire linked group (or just the task if not linked)
            // AND exclude tasks that are in the same linked group
            return taskOrder > maxOrderInGroup && 
                   (!processedData.linkedTaskGroup || t.linkedTaskGroup !== processedData.linkedTaskGroup);
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
                              t.linkedTaskGroup === task.linkedTaskGroup
                            );
                            
                            console.log('🔗 Found groupTasks:', groupTasks.length, 'total group size:', groupTasks.length + 1);
                            
                            if (groupTasks.length >= 2) { // Changed from > 2 to >= 2 (3+ total tasks)
                              // Multi-task group - show unlink dialog
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
              const positionOptions = createPositionOptions(linkingOptions.targetTasks);
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
                  
                  console.log('🔗 UNLINK LOGIC:');
                  console.log('🔗 anyTaskSequential =', anyTaskSequential);
                  console.log('🔗 All tasks sorted by order:', allTasks.map(t => ({ name: t.name, order: t.order, sequential: t.dependentOnPrevious })));
                  
                  // Calculate new dates for tasks that become sequential
                  for (let i = 0; i < allTasks.length; i++) {
                    const currentTask = allTasks[i];
                    const isFirstTask = i === 0;
                    
                    // CORRECTED RULE:
                    // - If ANY linked task was sequential → ALL unlinked tasks become sequential (including first)
                    // - If ALL linked tasks were unsequential → ALL unlinked tasks become sequential (except first)
                    const shouldBeSequential = anyTaskSequential ? true : !isFirstTask;
                    
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
                    
                    console.log('🔗 Task', i + 1, ':', currentTask.name, '-> sequential:', shouldBeSequential, 'date:', newDate);
                  }
                  
                  console.log('🔗 Calculated unlink updates:', updatedTasks.map(u => ({
                    name: u.task.name,
                    oldDate: u.task.taskDate,
                    newDate: u.newDate,
                    sequential: u.shouldBeSequential
                  })));
                  
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
                    // Get all tasks after the unlinked group to see if any need date updates
                    const maxOrderInGroup = Math.max(...allTasks.map(t => t.order || 0));
                    const subsequentTasks = (existingTasks as any[])
                      .filter(t => (t.order || 0) > maxOrderInGroup && t.dependentOnPrevious)
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
                        // Calculate next working day
                        const baseDate = new Date(currentDate + 'T00:00:00');
                        const nextDate = new Date(baseDate);
                        nextDate.setDate(nextDate.getDate() + 1);
                        // Skip weekends
                        while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
                          nextDate.setDate(nextDate.getDate() + 1);
                        }
                        const newSequentialDate = nextDate.toISOString().split('T')[0];
                        
                        // Only update if date actually changed
                        if (newSequentialDate !== subsequentTask.taskDate) {
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
                        }
                        
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
                        
                        currentDate = newSequentialDate;
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