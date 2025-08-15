import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTaskSchema } from "@shared/schema";
import { z } from "zod";
import { generateLinkedTaskGroupId, getLinkedTasks, realignDependentTasks, findLinkedTaskGroups, getLinkedGroupTaskIds, getTaskStatus } from "@shared/taskUtils";

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProject?: number;
  selectedLocation?: number;
}

// Task type to cost code mapping
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

const TASK_TYPES = [
  "Traffic Control",
  "Demo/Ex", 
  "Base/Grading",
  "Demo/Ex + Base/Grading",
  "Form",
  "Pour", 
  "Form + Pour",
  "Asphalt",
  "General Labor",
  "Landscaping",
  "Utility Adjustment",
  "Punchlist Demo",
  "Punchlist Concrete", 
  "Punchlist General Labor"
];

const STATUS_OPTIONS = [
  "upcoming",
  "in progress", 
  "complete"
];

// Create form schema with conditional validation
const createTaskFormSchema = z.object({
  insertPosition: z.string().optional(),
  taskDate: z.string().optional(),
  name: z.string().min(1, "Task name is required"),
  taskType: z.string().min(1, "Task type is required"),
  startTime: z.string().optional(),
  finishTime: z.string().optional(),
  status: z.string().min(1, "Status is required"),
  workDescription: z.string().optional(),
  notes: z.string().optional(),
  dependentOnPrevious: z.boolean().default(true),
  linkToExistingTask: z.boolean().default(false),
  linkedTaskIds: z.array(z.string()).default([])
}).refine((data) => {
  // Insert position is required UNLESS linking to existing task
  if (!data.linkToExistingTask && !data.insertPosition) {
    return false;
  }
  // Date is required for non-dependent, non-linked tasks
  if (!data.dependentOnPrevious && !data.linkToExistingTask && !data.taskDate) {
    return false;
  }
  // LinkedTaskIds is required when linking to existing task
  if (data.linkToExistingTask && data.linkedTaskIds.length === 0) {
    return false;
  }
  return true;
}, {
  message: "Position is required unless linking to existing task, and date is required for non-dependent tasks",
  path: ["insertPosition"]
});

export default function CreateTaskModal({ 
  isOpen, 
  onClose, 
  selectedProject: initialProject, 
  selectedLocation: initialLocation 
}: CreateTaskModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hasManuallyEditedName, setHasManuallyEditedName] = useState(false);
  const [selectedProject, setSelectedProject] = useState<number | undefined>(initialProject);
  const [selectedLocation, setSelectedLocation] = useState<number | undefined>(initialLocation);
  
  // Date selection dialog states
  const [showLinkDateDialog, setShowLinkDateDialog] = useState(false);
  const [linkingOptions, setLinkingOptions] = useState<{
    currentTask: any;
    targetTasks: any[];
    availableDates: { date: string; taskName: string }[];
  } | null>(null);
  const [pendingFormData, setPendingFormData] = useState<any>(null);

  // Fetch projects for selection
  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
    enabled: isOpen,
    staleTime: 30000,
  });

  // Fetch locations for selected project
  const { data: locations = [] } = useQuery({
    queryKey: ["/api/projects", selectedProject, "locations"],
    enabled: !!selectedProject && isOpen,
    staleTime: 30000,
  });

  // Get selected location details
  const selectedLocationData = selectedLocation ? (locations as any[]).find((loc: any) => loc.id === selectedLocation) : null;

  // Fetch existing tasks for linking - use locationId string format for API
  const { data: existingTasks = [] } = useQuery({
    queryKey: ["/api/locations", selectedLocationData?.locationId, "tasks"],
    enabled: !!selectedLocationData?.locationId && isOpen,
    staleTime: 5000,
  }) as { data: any[] };

  // Fetch assignments for completion status checking
  const { data: assignments = [] } = useQuery({
    queryKey: ["/api/assignments"],
    enabled: isOpen,
    staleTime: 5000,
  }) as { data: any[] };

  const createTaskMutation = useMutation({
    mutationFn: async (data: { newTask: any; updatedTasks: any[] }) => {
      console.log('Creating task with position:', data.newTask.name, 'order:', data.newTask.order);
      console.log('Updating', data.updatedTasks.length, 'existing tasks');
      
      // First create the new task - use locationId string for API endpoint
      const locationIdString = selectedLocationData?.locationId;
      
      // Validate locationIdString before making API call
      if (!locationIdString || locationIdString === 'undefined') {
        throw new Error('No valid location selected. Please select a location first.');
      }
      
      console.log('Creating task for location:', locationIdString);
      const createResponse = await apiRequest(`/api/locations/${locationIdString}/tasks`, {
        method: 'POST',
        body: JSON.stringify(data.newTask),
        headers: { 'Content-Type': 'application/json' }
      });
      
      // Then update existing tasks if needed (for date shifting)
      if (data.updatedTasks.length > 0) {
        console.log('Tasks to update:', data.updatedTasks.map(t => ({ name: t.name, newDate: t.taskDate })));
        const updatePromises = data.updatedTasks.map(task => 
          apiRequest(`/api/tasks/${task.id}`, {
            method: 'PUT',
            body: JSON.stringify(task),
            headers: { 'Content-Type': 'application/json' }
          })
        );
        await Promise.all(updatePromises);
      }
      
      return createResponse.json();
    },
    onSuccess: async (result, variables) => {
      const successMsg = variables.updatedTasks.length > 0 
        ? `Task created and ${variables.updatedTasks.length} existing tasks shifted`
        : "Task created successfully";
      
      // Force immediate cache invalidation and refetch
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/locations", variables.newTask.locationId, "tasks"] });
      
      // Also refetch the current location tasks immediately
      await queryClient.refetchQueries({ queryKey: ["/api/locations", selectedLocationData?.locationId, "tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks/date-range"] });
      
      console.log('Cache invalidated and refetched after task creation');
      toast({ title: "Success", description: successMsg });
      onClose();
      form.reset();
    },
    onError: (error: any) => {
      console.error('Task creation error:', error);
      toast({ title: "Error", description: "Failed to create task", variant: "destructive" });
    },
  });

  const form = useForm({
    resolver: zodResolver(createTaskFormSchema),
    defaultValues: {
      insertPosition: 'end',
      taskDate: '',
      name: '',
      taskType: '',
      startTime: '',
      finishTime: '',
      status: 'upcoming',
      workDescription: '',
      notes: '',
      dependentOnPrevious: true,
      linkToExistingTask: false,
      linkedTaskIds: [],
    },
  });

  // Function to analyze task list and create position-based options (matches EditTaskModal)
  const createPositionOptions = (targetTasks: any[]) => {
    // Only consider the target tasks being linked to, not all existing tasks
    const sortedTargetTasks = targetTasks
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
              description: `${sequentialGroup[0].taskDate} (will make first linked task sequential)`,
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
          description: `${currentTask.taskDate} (will make first linked task sequential)`,
          date: currentTask.taskDate,
          position: i
        });
      } else {
        options.push({
          type: 'unsequential',
          task: currentTask,
          name: currentTask.name,
          description: `${currentTask.taskDate} (will make tasks unsequential and linked)`,
          date: currentTask.taskDate,
          position: i
        });
      }
      
      i++;
    }
    
    return options;
  };

  // Handle position choice from dialog (replaces handleDateChoice)
  const handlePositionChoice = (selectedOption: any) => {
    console.log('Position choice made:', selectedOption);
    setShowLinkDateDialog(false);
    
    if (pendingFormData && linkingOptions) {
      // Process the linking with the chosen position
      console.log('Processing link with chosen position:', selectedOption);
      processTaskCreationWithPosition(pendingFormData, selectedOption);
    }
    
    setLinkingOptions(null);
    setPendingFormData(null);
  };

  // Process task creation with chosen position for linking
  const processTaskCreationWithPosition = (data: any, selectedOption: any) => {
    const costCode = TASK_TYPE_TO_COST_CODE[data.taskType as keyof typeof TASK_TYPE_TO_COST_CODE] || data.taskType;
    const sortedTasks = [...(existingTasks as any[])].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
    
    // Process with the chosen date - use same logic as EditTaskModal
    const linkedTasks = (existingTasks as any[]).filter((task: any) => 
      data.linkedTaskIds.includes((task.taskId || task.id).toString())
    );
    
    const linkedTaskGroup = linkedTasks.find(t => t.linkedTaskGroup)?.linkedTaskGroup || generateLinkedTaskGroupId();
    
    // CRITICAL: When linking to existing tasks, the new task should be UNSEQUENTIAL if it's not the first linked task
    // For linked groups: only the first task in the group can be sequential, others are unsequential (linked)
    const isLinkingToExistingTasks = data.linkedTaskIds && data.linkedTaskIds.length > 0;
    let shouldNewTaskBeSequential = false;
    
    if (isLinkingToExistingTasks) {
      // When linking: new task is always unsequential (it's not the first in the group)
      shouldNewTaskBeSequential = false;
      console.log('🔗 Linking to existing tasks - new task will be unsequential (not first in group)');
    } else {
      // Use position choice for non-linked tasks
      shouldNewTaskBeSequential = selectedOption.type.includes('sequential');
      console.log('🔗 Not linking - using position-based sequential status:', shouldNewTaskBeSequential);
    }
    
    console.log('🔗 New task sequential logic:', {
      hasLinkedTasks: data.linkedTaskIds && data.linkedTaskIds.length > 0,
      positionBasedSequential: selectedOption.type.includes('sequential'),
      finalSequentialStatus: shouldNewTaskBeSequential
    });

    const newTask = {
      taskId: `${selectedLocationData?.locationId}_${data.name.replace(/\s+/g, '_')}_${Date.now()}`,
      locationId: selectedLocationData?.locationId,
      projectId: selectedLocationData?.projectId,
      name: data.name,
      taskType: data.taskType,
      costCode,
      taskDate: selectedOption.date,
      startDate: selectedOption.date,
      finishDate: selectedOption.date,
      startTime: data.startTime || null,
      finishTime: data.finishTime || null,
      status: data.status,
      workDescription: data.workDescription || '',
      notes: data.notes || '',
      dependentOnPrevious: shouldNewTaskBeSequential, // Use calculated sequential status
      linkedTaskGroup,
      superintendentId: null,
      foremanId: null,
      scheduledHours: "0.00",
      actualHours: data.status === 'complete' ? "0.00" : null,
      order: 0 // Will be set correctly below
    };

    // Update all linked tasks to have the same group and chosen date, but preserve their original sequential status
    // CRITICAL: When linking tasks, we MUST preserve the existing sequential status of linked tasks
    const tasksToUpdate = linkedTasks.map((task) => ({
      ...task,
      linkedTaskGroup,
      taskDate: selectedOption.date,
      // PRESERVE the original dependentOnPrevious status of existing tasks - don't change it!
      dependentOnPrevious: task.dependentOnPrevious
    }));
    
    // Create complete task list with ALL tasks (existing + new)
    const allTasks = [...existingTasks.filter(t => !linkedTasks.some(lt => 
      (lt.taskId || lt.id) === (t.taskId || t.id)
    )), ...tasksToUpdate, newTask];
    
    // Group all tasks by linked group or individual tasks
    const taskGroups = new Map<string, any[]>();
    const ungroupedTasks: any[] = [];
    
    allTasks.forEach((task: any) => {
      if (task.linkedTaskGroup) {
        if (!taskGroups.has(task.linkedTaskGroup)) {
          taskGroups.set(task.linkedTaskGroup, []);
        }
        taskGroups.get(task.linkedTaskGroup)!.push(task);
      } else {
        ungroupedTasks.push(task);
      }
    });
    
    // Create array of task groups (each group has a date and tasks)
    const groups: any[] = [];
    
    // Add ungrouped tasks as individual groups
    ungroupedTasks.forEach((task: any) => {
      groups.push({
        date: new Date(task.taskDate).getTime(),
        tasks: [task],
        isLinkedGroup: false
      });
    });
    
    // Add linked groups
    taskGroups.forEach((tasks: any[], groupId: string) => {
      groups.push({
        date: new Date(tasks[0].taskDate).getTime(), // All tasks in group have same date
        tasks: tasks,
        isLinkedGroup: true
      });
    });
    
    // Sort groups by date
    groups.sort((a: any, b: any) => a.date - b.date);
    
    // Flatten groups back to ordered task list
    const orderedTasks: any[] = [];
    groups.forEach((group: any) => {
      orderedTasks.push(...group.tasks);
    });
    
    // Reassign orders and apply sequential logic
    orderedTasks.forEach((task: any, index: number) => {
      task.order = index;
    });
    
    // Apply sequential logic group by group - PRESERVE EXISTING SEQUENTIAL STATUS FOR LINKED TASKS
    groups.forEach((group: any, groupIndex: number) => {
      if (group.isLinkedGroup) {
        // For linked groups, PRESERVE the original sequential status of existing tasks
        // Do NOT modify the sequential status - it was already correctly set above
        // The sequential status should only be determined when the task was first created or explicitly modified
      } else {
        // For individual tasks, make sequential if not first overall
        if (groupIndex > 0) {
          group.tasks[0].dependentOnPrevious = true;
        } else {
          group.tasks[0].dependentOnPrevious = false;
        }
      }
    });
    
    // Update allTasks reference for the rest of the function
    allTasks.length = 0;
    allTasks.push(...orderedTasks);
    
    console.log('Task ordering after linked group placement:', 
                allTasks.map((t, i) => ({ 
                  order: i, name: t.name, date: t.taskDate, 
                  linked: !!t.linkedTaskGroup, sequential: t.dependentOnPrevious 
                })));
    
    // CRITICAL: Apply sequential date logic to align dependent tasks
    console.log('Before realignDependentTasks:', 
                allTasks.map((t, i) => ({ 
                  order: i, name: t.name, date: t.taskDate, 
                  linked: !!t.linkedTaskGroup, sequential: t.dependentOnPrevious 
                })));
    
    const finalOrderedTasks = realignDependentTasks(allTasks);
    
    // Update allTasks with properly aligned dates
    allTasks.length = 0;
    allTasks.push(...finalOrderedTasks);
    
    console.log('After realignDependentTasks:', 
                allTasks.map((t, i) => ({ 
                  order: i, name: t.name, date: t.taskDate, 
                  linked: !!t.linkedTaskGroup, sequential: t.dependentOnPrevious 
                })));
    
    console.log('Linking tasks - updating existing tasks:', tasksToUpdate.map(t => ({ 
      name: t.name, 
      linked: t.linkedTaskGroup, 
      sequential: t.dependentOnPrevious,
      date: t.taskDate 
    })));
    
    // CRITICAL: Only update tasks that have actually changed (date, linkedTaskGroup, dependentOnPrevious, OR order)
    const finalTasksToUpdate = allTasks.filter(task => {
      if (task === newTask) return false; // Exclude new task
      
      const originalTask = (existingTasks as any[]).find((orig: any) => 
        (orig.taskId || orig.id) === (task.taskId || task.id)
      );
      
      if (!originalTask) return false; // Skip if not found in original tasks
      
      const hasChanges = (
        originalTask.taskDate !== task.taskDate ||
        originalTask.linkedTaskGroup !== task.linkedTaskGroup ||
        originalTask.dependentOnPrevious !== task.dependentOnPrevious ||
        originalTask.order !== task.order
      );
      
      if (hasChanges) {
        console.log(`Task "${task.name}" has changes:`, {
          dateChanged: originalTask.taskDate !== task.taskDate ? `${originalTask.taskDate} → ${task.taskDate}` : 'no',
          linkedChanged: originalTask.linkedTaskGroup !== task.linkedTaskGroup ? `${originalTask.linkedTaskGroup} → ${task.linkedTaskGroup}` : 'no',
          sequentialChanged: originalTask.dependentOnPrevious !== task.dependentOnPrevious ? `${originalTask.dependentOnPrevious} → ${task.dependentOnPrevious}` : 'no',
          orderChanged: originalTask.order !== task.order ? `${originalTask.order} → ${task.order}` : 'no'
        });
      }
      
      return hasChanges;
    });
    
    console.log('Final linking updates:', finalTasksToUpdate.map(t => ({ 
      name: t.name, date: t.taskDate, order: t.order, sequential: t.dependentOnPrevious 
    })));
    
    createTaskMutation.mutate({
      newTask,
      updatedTasks: finalTasksToUpdate
    });
  };

  const onSubmit = (data: any) => {
    // Get cost code from task type
    const costCode = TASK_TYPE_TO_COST_CODE[data.taskType as keyof typeof TASK_TYPE_TO_COST_CODE] || data.taskType;
    
    // Sort existing tasks by ORDER first to match display logic  
    const sortedTasks = [...(existingTasks as any[])].sort((a: any, b: any) => {
      // If both tasks have order values, use order as primary sort
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }
      
      // If only one has order, prioritize the one with order
      if (a.order !== undefined && b.order === undefined) {
        return -1;
      }
      if (a.order === undefined && b.order !== undefined) {
        return 1;
      }
      
      // If neither has order, sort by date as fallback
      const dateA = new Date(a.taskDate).getTime();
      const dateB = new Date(b.taskDate).getTime();
      if (dateA !== dateB) return dateA - dateB;
      
      // Final fallback to ID comparison
      return (a.taskId || a.id).localeCompare(b.taskId || b.id);
    });

    let taskDate: string = new Date().toISOString().split('T')[0]; // Default fallback
    let linkedTaskGroup: string | null = null;
    let insertIndex = sortedTasks.length; // Default to end
    let updatedTasks = [...sortedTasks];
    
    // CRITICAL: If this will be the first task (no existing tasks), force it to be non-sequential
    if (sortedTasks.length === 0) {
      insertIndex = 0;
      data.dependentOnPrevious = false;
      taskDate = data.taskDate || new Date().toISOString().split('T')[0];
    }
    // CRITICAL: If inserting at position 0, this becomes the first task - must be non-sequential
    else if (data.insertPosition === 'beginning') {
      insertIndex = 0;
      data.dependentOnPrevious = false;
      console.log('Creating task at beginning - forcing to unsequential');
    }
    // Handle different task creation modes
    else if (data.linkToExistingTask && data.linkedTaskIds && data.linkedTaskIds.length > 0) {
      // LINKED TASK MODE: Check for multiple dates and show dialog if needed
      const linkedTasks = (existingTasks as any[]).filter((task: any) => 
        data.linkedTaskIds.includes((task.taskId || task.id).toString())
      );
      
      if (linkedTasks.length > 0) {
        // Always show position dialog for linked tasks - let user choose where to place them
        console.log('Linking tasks - showing position choice dialog');
        setLinkingOptions({
          currentTask: { name: data.name, taskDate: data.taskDate },
          targetTasks: linkedTasks,
          availableDates: [] // No longer used, but keeping for compatibility
        });
        setShowLinkDateDialog(true);
        setPendingFormData(data);
        return;
      } else {
        taskDate = new Date().toISOString().split('T')[0]; // Fallback
      }
    } else {
      // Calculate position and date based on insertPosition and dependency
      if (data.insertPosition === 'start') {
        insertIndex = 0;
        // First task can't be dependent - force it to be non-sequential
        data.dependentOnPrevious = false;
        taskDate = data.taskDate || new Date().toISOString().split('T')[0];
        
        // Shift all existing tasks down - they maintain their dependency settings
        for (let i = 0; i < updatedTasks.length; i++) {
          const existingTask = updatedTasks[i];
          // Original first task becomes second and can now be sequential if it wasn't already
          if (i === 0 && !existingTask.dependentOnPrevious) {
            updatedTasks[i] = { 
              ...existingTask, 
              dependentOnPrevious: true // Make the displaced first task sequential
            };
          }
        }
      } else if (data.insertPosition === 'end') {
        insertIndex = sortedTasks.length;
        if (data.dependentOnPrevious && sortedTasks.length > 0) {
          // Calculate next date after last task
          const lastTask = sortedTasks[sortedTasks.length - 1];
          const lastDate = new Date(lastTask.taskDate + 'T00:00:00');
          const nextDate = new Date(lastDate);
          nextDate.setDate(nextDate.getDate() + 1);
          // Skip weekends
          while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
            nextDate.setDate(nextDate.getDate() + 1);
          }
          taskDate = nextDate.toISOString().split('T')[0];
        } else {
          taskDate = data.taskDate || new Date().toISOString().split('T')[0];
        }
      } else if (data.insertPosition.startsWith('after-')) {
        // Insert after specific task
        const afterTaskId = data.insertPosition.replace('after-', '');
        const afterTaskIndex = sortedTasks.findIndex(task => 
          (task.taskId || task.id).toString() === afterTaskId
        );
        
        if (afterTaskIndex >= 0) {
          const afterTask = sortedTasks[afterTaskIndex];
          console.log('🔧 DEBUG: After task details:', {
            name: afterTask.name,
            order: afterTask.order,
            linkedTaskGroup: afterTask.linkedTaskGroup
          });
          
          // If the "after" task is linked, find the end of its linked group
          if (afterTask.linkedTaskGroup) {
            // Find all tasks in the same linked group
            const linkedTasks = sortedTasks.filter(t => t.linkedTaskGroup === afterTask.linkedTaskGroup);
            // Find the last task in this linked group (by order)
            const lastLinkedTask = linkedTasks.reduce((last, current) => 
              (current.order || 0) > (last.order || 0) ? current : last
            );
            // Insert after the entire linked group
            const lastLinkedTaskIndex = sortedTasks.findIndex(t => 
              (t.taskId || t.id) === (lastLinkedTask.taskId || lastLinkedTask.id)
            );
            insertIndex = lastLinkedTaskIndex + 1;
            console.log('🔧 DEBUG: Linked task insertIndex:', insertIndex);
          } else {
            // Regular task, insert immediately after it
            insertIndex = afterTaskIndex + 1;
            console.log('🔧 DEBUG: Regular task insertIndex:', insertIndex);
          }
          
          const referenceTask = afterTask;
          
          if (data.dependentOnPrevious) {
            // DEPENDENT TASK: Calculate next date and shift subsequent dependent tasks
            const afterDate = new Date(afterTask.taskDate + 'T00:00:00');
            const nextDate = new Date(afterDate);
            nextDate.setDate(nextDate.getDate() + 1);
            // Skip weekends
            while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
              nextDate.setDate(nextDate.getDate() + 1);
            }
            taskDate = nextDate.toISOString().split('T')[0];
            
            // Shift all subsequent tasks that are after this insertion point (but NOT linked tasks)
            let currentDate = taskDate;
            for (let i = insertIndex; i < updatedTasks.length; i++) {
              const task = updatedTasks[i];
              
              // Skip linked tasks - they maintain their synchronized date
              if (task.linkedTaskGroup) {
                currentDate = task.taskDate;
                continue;
              }
              
              if (task.dependentOnPrevious) {
                // Calculate next date based on the previous task (either new task or previous shifted task)
                const baseDate = new Date(currentDate + 'T00:00:00');
                const shiftedDate = new Date(baseDate);
                shiftedDate.setDate(shiftedDate.getDate() + 1);
                // Skip weekends
                while (shiftedDate.getDay() === 0 || shiftedDate.getDay() === 6) {
                  shiftedDate.setDate(shiftedDate.getDate() + 1);
                }
                updatedTasks[i] = { 
                  ...task, 
                  taskDate: shiftedDate.toISOString().split('T')[0] 
                };
                currentDate = shiftedDate.toISOString().split('T')[0];
              } else {
                // Non-dependent task keeps its date, but this becomes the new reference point
                currentDate = task.taskDate;
              }
            }
          } else {
            // NON-DEPENDENT TASK: Use specified date and shift subsequent dependent tasks
            taskDate = data.taskDate || new Date().toISOString().split('T')[0];
            
            // Shift all subsequent dependent tasks based on new task's date (but NOT linked tasks)
            let lastTaskDate = taskDate;
            for (let i = insertIndex; i < updatedTasks.length; i++) {
              const task = updatedTasks[i];
              
              // Skip linked tasks - they maintain their synchronized date
              if (task.linkedTaskGroup) {
                lastTaskDate = task.taskDate;
                continue;
              }
              
              if (task.dependentOnPrevious) {
                const baseDate = new Date(lastTaskDate + 'T00:00:00');
                const nextDate = new Date(baseDate);
                nextDate.setDate(nextDate.getDate() + 1);
                // Skip weekends
                while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
                  nextDate.setDate(nextDate.getDate() + 1);
                }
                updatedTasks[i] = { 
                  ...task, 
                  taskDate: nextDate.toISOString().split('T')[0] 
                };
                lastTaskDate = nextDate.toISOString().split('T')[0];
              } else {
                lastTaskDate = task.taskDate;
              }
            }
          }
        } else {
          // Fallback to end if task not found
          insertIndex = sortedTasks.length;
          taskDate = data.taskDate || new Date().toISOString().split('T')[0];
        }
      }
    }

    // Calculate proper decimal order value
    console.log('🔧 DEBUG: Order calculation inputs:', {
      insertIndex,
      sortedTasksLength: sortedTasks.length,
      insertPosition: data.insertPosition,
      sortedTaskOrders: sortedTasks.map(t => ({ name: t.name, order: t.order }))
    });
    
    let orderValue = "0.00";
    if (insertIndex === 0) {
      // First position - use order before first task or 0.00
      orderValue = sortedTasks.length > 0 ? 
        Math.max(0, (parseFloat(sortedTasks[0].order as string || "1.00") - 1.00)).toFixed(2) : 
        "0.00";
      console.log('🔧 DEBUG: First position order:', orderValue);
    } else if (insertIndex >= sortedTasks.length) {
      // Last position - use order after last task
      orderValue = sortedTasks.length > 0 ? 
        (parseFloat(sortedTasks[sortedTasks.length - 1].order as string || "0.00") + 1.00).toFixed(2) : 
        "1.00";
      console.log('🔧 DEBUG: Last position order:', orderValue);
    } else {
      // Middle position - calculate order between adjacent tasks
      const prevOrder = parseFloat(sortedTasks[insertIndex - 1]?.order as string || "0.00");
      const nextOrder = parseFloat(sortedTasks[insertIndex]?.order as string || "2.00");
      orderValue = ((prevOrder + nextOrder) / 2).toFixed(2);
      console.log('🔧 DEBUG: Middle position order:', {
        prevTask: sortedTasks[insertIndex - 1]?.name,
        prevOrder,
        nextTask: sortedTasks[insertIndex]?.name,
        nextOrder,
        calculatedOrder: orderValue
      });
    }
    
    console.log('🔧 DEBUG: Final calculated order value:', orderValue);

    // Create the new task
    const newTask = {
      taskId: `${selectedLocationData?.locationId}_${data.name.replace(/\s+/g, '_')}_${Date.now()}`,
      locationId: selectedLocationData?.locationId,
      projectId: selectedLocationData?.projectId,
      name: data.name,
      taskType: data.taskType,
      taskDate: taskDate,
      startDate: taskDate,
      finishDate: taskDate,
      costCode: costCode,
      startTime: data.startTime || null,
      finishTime: data.finishTime || null,
      status: data.status,
      workDescription: data.workDescription || '',
      notes: data.notes || '',
      dependentOnPrevious: (insertIndex === 0 || sortedTasks.length === 0) ? false : (data.linkToExistingTask ? false : data.dependentOnPrevious),
      linkedTaskGroup: linkedTaskGroup,
      superintendentId: null,
      foremanId: null,
      scheduledHours: "0.00",
      actualHours: data.status === 'complete' ? "0.00" : null,
      order: orderValue
    };

    // Insert new task into the array
    updatedTasks.splice(insertIndex, 0, newTask);

    // DO NOT override the carefully calculated order values
    // The newTask already has the correct orderValue calculated above

    // CRITICAL: Apply group-based sequential logic before date alignment
    console.log('Checking for linked task group:', linkedTaskGroup);
    if (linkedTaskGroup) {
      console.log('Applying group-based sequential logic for linked tasks');
      
      // Group all tasks by linked group or individual tasks
      const taskGroups = new Map();
      const ungroupedTasks = [];
      
      updatedTasks.forEach(task => {
        if (task.linkedTaskGroup) {
          if (!taskGroups.has(task.linkedTaskGroup)) {
            taskGroups.set(task.linkedTaskGroup, []);
          }
          taskGroups.get(task.linkedTaskGroup).push(task);
        } else {
          ungroupedTasks.push(task);
        }
      });
      
      // Create array of task groups (each group has a date and tasks)
      const groups = [];
      
      // Add ungrouped tasks as individual groups
      ungroupedTasks.forEach(task => {
        groups.push({
          date: new Date(task.taskDate).getTime(),
          tasks: [task],
          isLinkedGroup: false
        });
      });
      
      // Add linked groups
      taskGroups.forEach((tasks, groupId) => {
        groups.push({
          date: new Date(tasks[0].taskDate).getTime(), // All tasks in group have same date
          tasks: tasks,
          isLinkedGroup: true
        });
      });
      
      // Sort groups by date
      groups.sort((a, b) => a.date - b.date);
      
      // Flatten groups back to ordered task list
      const orderedTasks = [];
      groups.forEach(group => {
        orderedTasks.push(...group.tasks);
      });
      
      // DO NOT reassign orders - preserve the calculated decimal orders
      // orderedTasks.forEach((task, index) => {
      //   task.order = index;
      // });
      
      // Apply sequential logic group by group - PRESERVE EXISTING SEQUENTIAL STATUS FOR LINKED TASKS
      groups.forEach((group, groupIndex) => {
        if (group.isLinkedGroup) {
          // For linked groups, PRESERVE the original sequential status of existing tasks
          // Only modify sequential status for the new task being created
          group.tasks.forEach((task, taskIndex) => {
            // Don't change sequential status of existing tasks - only for the new task
            // The new task's sequential status was already set based on the position choice
          });
        } else {
          // For individual tasks, make sequential if not first overall
          if (groupIndex > 0) {
            group.tasks[0].dependentOnPrevious = true;
          } else {
            group.tasks[0].dependentOnPrevious = false;
          }
        }
      });
      
      // Update updatedTasks with reordered and properly configured tasks
      updatedTasks.length = 0;
      updatedTasks.push(...orderedTasks);
      
      console.log('After group-based sequential logic:', 
                  updatedTasks.map((t, i) => ({ 
                    order: i, name: t.name, date: t.taskDate, 
                    linked: !!t.linkedTaskGroup, sequential: t.dependentOnPrevious 
                  })));
    }

    // CRITICAL: Apply sequential date logic to ensure proper date dependencies
    console.log('Before sequential date alignment:', 
                updatedTasks.map((t, i) => ({ 
                  order: i, name: t.name, date: t.taskDate, 
                  linked: !!t.linkedTaskGroup, sequential: t.dependentOnPrevious 
                })));
    
    updatedTasks = realignDependentTasks(updatedTasks);
    
    console.log('After sequential date alignment:', 
                updatedTasks.map((t, i) => ({ 
                  order: i, name: t.name, date: t.taskDate, 
                  linked: !!t.linkedTaskGroup, sequential: t.dependentOnPrevious 
                })));

    // Create new task first, then update existing tasks if needed
    // Update tasks that have changed (date, linkedTaskGroup, dependentOnPrevious, OR order)
    const tasksToUpdate = updatedTasks.filter(task => {
      const originalTask = (existingTasks as any[]).find((orig: any) => 
        (orig.taskId || orig.id) === (task.taskId || task.id)
      );
      return originalTask && (
        originalTask.taskDate !== task.taskDate ||
        originalTask.linkedTaskGroup !== task.linkedTaskGroup ||
        originalTask.dependentOnPrevious !== task.dependentOnPrevious ||
        originalTask.order !== task.order  // IMPORTANT: Include order changes
      );
    });

    console.log('🔧 DEBUG: About to send newTask to server:');
    console.log('🔧 DEBUG: Task name:', newTask.name);
    console.log('🔧 DEBUG: Task order:', newTask.order);
    console.log('🔧 DEBUG: Insert index:', insertIndex);
    console.log('🔧 DEBUG: Full task object:', newTask);
    
    createTaskMutation.mutate({
      newTask,
      updatedTasks: tasksToUpdate
    });
  };

  const handleClose = () => {
    onClose();
    form.reset();
    setHasManuallyEditedName(false); // Reset manual edit tracking
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>

        {/* Project and Location Selection - Only show if not provided as props */}
        {!initialProject && !initialLocation && (
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project *
              </label>
              <Select 
                value={selectedProject?.toString()} 
                onValueChange={(value) => {
                  const projectId = value ? parseInt(value) : undefined;
                  setSelectedProject(projectId);
                  setSelectedLocation(undefined); // Reset location when project changes
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project..." />
                </SelectTrigger>
                <SelectContent>
                  {(projects as any[]).map((project: any) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location *
              </label>
              <Select 
                value={selectedLocation?.toString()} 
                onValueChange={(value) => {
                  const locationId = value ? parseInt(value) : undefined;
                  setSelectedLocation(locationId);
                }}
                disabled={!selectedProject}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectedProject ? "Select location..." : "Select project first"} />
                </SelectTrigger>
                <SelectContent>
                  {(locations as any[]).map((location: any) => (
                    <SelectItem key={location.id} value={String(location.id)}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Only show form if project and location are selected */}
        {selectedProject && selectedLocation ? (
          <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Position Selection - Hidden when linking to existing task */}
            {!form.watch("linkToExistingTask") && (
              <FormField
                control={form.control}
                name="insertPosition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Insert Position *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select where to insert task" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(() => {
                          // Sort existing tasks by order/date for display - include ALL tasks (including completed)
                          const sortedTasks = (existingTasks as any[])
                            .sort((a: any, b: any) => {
                              // Primary sort by order if both have it
                              if (a.order !== undefined && b.order !== undefined) {
                                return parseFloat(a.order as string || "0") - parseFloat(b.order as string || "0");
                              }
                              // Tasks with order come before tasks without
                              if (a.order !== undefined && b.order === undefined) {
                                return -1;
                              }
                              if (a.order === undefined && b.order !== undefined) {
                                return 1;
                              }
                              // Secondary sort by date, then by ID
                              const dateA = new Date(a.taskDate).getTime();
                              const dateB = new Date(b.taskDate).getTime();
                              if (dateA !== dateB) return dateA - dateB;
                              return (a.taskId || a.id).localeCompare(b.taskId || b.id);
                            });

                          const insertionOptions = [];
                          
                          // Find most recent completed task to enforce business rule
                          let mostRecentCompletedTaskIndex = -1;
                          for (let i = sortedTasks.length - 1; i >= 0; i--) {
                            const taskAssignments = assignments.filter((assignment: any) => 
                              assignment.taskId === (sortedTasks[i].taskId || sortedTasks[i].id)
                            );
                            const taskStatus = getTaskStatus(sortedTasks[i], taskAssignments);
                            const isCompleted = taskStatus === 'complete';
                            
                            console.log(`🔍 DEBUG Task ${sortedTasks[i].name} (index ${i}): status=${taskStatus}, isCompleted=${isCompleted}`);
                            
                            if (isCompleted) {
                              mostRecentCompletedTaskIndex = i;
                              console.log(`✅ Found most recent completed task: ${sortedTasks[i].name} at index ${i}`);
                              break;
                            }
                          }
                          
                          console.log(`📋 Most recent completed task index: ${mostRecentCompletedTaskIndex}`);
                          
                          // Add "At the beginning" option only if no completed tasks exist
                          if (mostRecentCompletedTaskIndex === -1) {
                            console.log('✅ Adding "At the beginning" option - no completed tasks found');
                            insertionOptions.push(
                              <SelectItem key="beginning" value="beginning">At the beginning</SelectItem>
                            );
                          } else {
                            console.log('❌ Skipping "At the beginning" option - completed tasks exist');
                          }
                          
                          // Add option to insert after each existing task (with restrictions)
                          sortedTasks.forEach((task: any, index: number) => {
                            // Get task status for display
                            const taskAssignments = assignments.filter((assignment: any) => 
                              assignment.taskId === (task.id || task.taskId)
                            );
                            const taskStatus = getTaskStatus(task, taskAssignments);
                            const statusIndicator = taskStatus === 'complete' ? ' ✓' : '';
                            
                            // Business rule: Only allow insertion after most recent completed task or any incomplete task
                            // Reject: insertion before most recent completed task
                            if (mostRecentCompletedTaskIndex !== -1 && index < mostRecentCompletedTaskIndex) {
                              console.log(`❌ FILTERING OUT: "After: ${task.name}" (index ${index}) - before most recent completed task (index ${mostRecentCompletedTaskIndex})`);
                              return;
                            } else {
                              console.log(`✅ ALLOWING: "After: ${task.name}" (index ${index}) - ${index >= mostRecentCompletedTaskIndex ? 'at/after most recent completed' : 'no completed tasks exist'}`);
                            }
                            
                            insertionOptions.push(
                              <SelectItem 
                                key={task.id || task.taskId} 
                                value={`after-${(task.taskId || task.id).toString()}`}
                              >
                                After: {task.name}{statusIndicator} ({new Date(task.taskDate).toLocaleDateString('en-US')})
                              </SelectItem>
                            );
                          });
                          
                          // Add "At the end" option
                          insertionOptions.push(
                            <SelectItem key="end" value="end">At the end</SelectItem>
                          );
                          
                          return insertionOptions;
                        })()}

                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Task Type Selection - MUST come before task name */}
            <FormField
              control={form.control}
              name="taskType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Type *</FormLabel>
                  <Select 
                    onValueChange={(value) => {
                      field.onChange(value);
                      // Auto-fill task name if it hasn't been manually edited
                      if (!hasManuallyEditedName) {
                        form.setValue("name", value);
                      }
                    }} 
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select task type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TASK_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Task Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Name *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter task name" 
                      {...field} 
                      onChange={(e) => {
                        field.onChange(e);
                        // Mark as manually edited when user types
                        setHasManuallyEditedName(true);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3">
              {/* Dependency Selection */}
              <FormField
                control={form.control}
                name="dependentOnPrevious"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={form.watch("linkToExistingTask")}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Sequential dependency (follow previous task + 1 day)
                      </FormLabel>
                      <p className="text-xs text-gray-500">
                        Date will be calculated automatically. Subsequent dependent tasks will shift.
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              {/* Link to Existing Task */}
              <FormField
                control={form.control}
                name="linkToExistingTask"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          if (checked) {
                            form.setValue("dependentOnPrevious", false);
                          }
                        }}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Link to existing task (occur on same date)
                      </FormLabel>
                      <p className="text-xs text-gray-500">
                        Select an existing task to occur on the same date.
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
                            {field.value && field.value.length > 0 && field.value.map((taskId: string) => {
                              const selectedTask = (existingTasks as any[]).find((t: any) => 
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
                          {(existingTasks as any[])
                            .filter((t: any) => {
                              // Exclude already selected tasks
                              if ((field.value || []).includes((t.taskId || t.id).toString())) {
                                return false;
                              }
                              
                              // Exclude completed tasks from linking options
                              const taskTaskAssignments = assignments.filter((assignment: any) => 
                                assignment.taskId === (t.id || t.taskId)
                              );
                              const taskStatus = getTaskStatus(t, taskTaskAssignments);
                              
                              return taskStatus !== 'complete';
                            }).length > 0 && (
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
                                {(existingTasks as any[])
                                  .filter((t: any) => {
                                    // Exclude already selected tasks
                                    if ((field.value || []).includes((t.taskId || t.id).toString())) {
                                      return false;
                                    }
                                    
                                    // Exclude completed tasks from linking options
                                    const taskTaskAssignments = assignments.filter((assignment: any) => 
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
                                  .map((task: any) => {
                                    const formatDate = (dateStr: string) => {
                                      const [year, month, day] = dateStr.split('-');
                                      return `${month}/${day}/${year}`;
                                    };
                                    
                                    // Check if this task is part of a linked group
                                    const taskId = (task.taskId || task.id).toString();
                                    const linkedGroupIds = getLinkedGroupTaskIds(taskId, existingTasks as any[]);
                                    const isPartOfLinkedGroup = linkedGroupIds.length > 1;
                                    

                                    
                                    const linkedGroupNames = isPartOfLinkedGroup 
                                      ? linkedGroupIds
                                          .map(id => (existingTasks as any[]).find(t => (t.taskId || t.id).toString() === id)?.name)
                                          .filter(name => name && name !== task.name)
                                          .slice(0, 2) // Show max 2 other names
                                      : [];
                                    
                                    return (
                                      <SelectItem 
                                        key={task.id || task.taskId} 
                                        value={(task.taskId || task.id).toString()}
                                        className={isPartOfLinkedGroup ? "bg-blue-50 border-l-4 border-blue-400" : ""}
                                      >
                                        <div className="flex flex-col">
                                          <div className="flex items-center gap-2">
                                            {isPartOfLinkedGroup && (
                                              <span className="text-blue-600 text-xs font-semibold">🔗</span>
                                            )}
                                            <span>{task.name} ({formatDate(task.taskDate)})</span>
                                          </div>
                                          {isPartOfLinkedGroup && linkedGroupNames.length > 0 && (
                                            <div className="text-xs text-blue-600 mt-1">
                                              Linked with: {linkedGroupNames.join(", ")}{linkedGroupNames.length === 2 ? "..." : ""}
                                            </div>
                                          )}
                                        </div>
                                      </SelectItem>
                                    );
                                  })
                                }
                              </SelectContent>
                            </Select>
                            )}
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Date Selection - Only show for non-dependent tasks */}
            {!form.watch("dependentOnPrevious") && !form.watch("linkToExistingTask") && (
              <FormField
                control={form.control}
                name="taskDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <p className="text-xs text-gray-500">
                      All subsequent dependent tasks will shift based on this date.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}



            {/* Start and Finish Time - Optional */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} placeholder="Optional" />
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
                      <Input type="time" {...field} placeholder="Optional" />
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
                  <FormLabel>Status *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
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
                      placeholder="Describe the work to be done..."
                      className="min-h-[80px]"
                      {...field} 
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
                    <Textarea 
                      placeholder="Additional notes..."
                      className="min-h-[60px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createTaskMutation.isPending}
                className="flex-1"
              >
                {createTaskMutation.isPending ? "Creating..." : "Create Task"}
              </Button>
            </div>
          </form>
        </Form>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>Please select a project and location to create a task.</p>
          </div>
        )}
      </DialogContent>
      
      {/* Date Selection Dialog for Linking */}
      <AlertDialog open={showLinkDateDialog} onOpenChange={setShowLinkDateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Choose Position for Linked Tasks</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 space-y-2">
              <div>
                <div>You're linking "{pendingFormData?.name}" to {linkingOptions?.targetTasks?.length || 0} task(s):</div>
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
                    e.preventDefault();
                    e.stopPropagation();
                    handlePositionChoice(option);
                  }}
                  variant="outline"
                  className="w-full text-left px-4 py-3"
                >
                  <div>
                    {option.type === 'special-unsequential-pair' ? (
                      <div>
                        <div className="font-medium">{option.name}</div>
                        <div className="text-sm text-gray-500">{option.description}</div>
                      </div>
                    ) : option.type === 'sequential-group' ? (
                      <div>
                        <div className="font-medium">{option.names.join(", ")}</div>
                        <div className="text-sm text-gray-500">{option.description}</div>
                      </div>
                    ) : option.type === 'sequential-single' ? (
                      <div>
                        <div className="font-medium">{option.name}</div>
                        <div className="text-sm text-gray-500">{option.description}</div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium">{option.name}</div>
                        <div className="text-sm text-gray-500">{option.description}</div>
                      </div>
                    )}
                  </div>
                </Button>
              ));
            })()}
            <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
