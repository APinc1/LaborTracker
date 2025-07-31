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
import { generateLinkedTaskGroupId, getLinkedTasks } from "@shared/taskUtils";

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
  "General Labor": "GENERAL",
  "Landscaping": "LANDSCAPE", 
  "Utility Adjustment": "UTILITY ADJ",
  "Punchlist Demo": "PUNCHLIST",
  "Punchlist Concrete": "PUNCHLIST",
  "Punchlist General Labor": "PUNCHLIST"
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
  selectedProject, 
  selectedLocation 
}: CreateTaskModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hasManuallyEditedName, setHasManuallyEditedName] = useState(false);
  
  // Date selection dialog states
  const [showLinkDateDialog, setShowLinkDateDialog] = useState(false);
  const [linkingOptions, setLinkingOptions] = useState<{
    currentTask: any;
    targetTasks: any[];
    availableDates: { date: string; taskName: string }[];
  } | null>(null);
  const [pendingFormData, setPendingFormData] = useState<any>(null);

  // Fetch existing tasks for linking
  const { data: existingTasks = [] } = useQuery({
    queryKey: ["/api/locations", selectedLocation, "tasks"],
    enabled: !!selectedLocation && isOpen,
    staleTime: 5000,
  }) as { data: any[] };

  const createTaskMutation = useMutation({
    mutationFn: async (data: { newTask: any; updatedTasks: any[] }) => {
      console.log('Creating task with position:', data.newTask.name, 'order:', data.newTask.order);
      console.log('Updating', data.updatedTasks.length, 'existing tasks');
      
      // First create the new task
      const createResponse = await apiRequest(`/api/locations/${data.newTask.locationId}/tasks`, {
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
    onSuccess: (result, variables) => {
      const successMsg = variables.updatedTasks.length > 0 
        ? `Task created and ${variables.updatedTasks.length} existing tasks shifted`
        : "Task created successfully";
      
      // Invalidate both general tasks and location-specific tasks
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations", variables.newTask.locationId, "tasks"] });
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

  // Handle date choice from dialog
  const handleDateChoice = (chosenDate: string) => {
    console.log('Link date choice made:', chosenDate);
    setShowLinkDateDialog(false);
    
    if (pendingFormData && linkingOptions) {
      // Process the linking with the chosen date
      console.log('Processing link with chosen date:', chosenDate);
      processTaskCreationWithDate(pendingFormData, chosenDate);
    }
    
    setLinkingOptions(null);
    setPendingFormData(null);
  };

  // Process task creation with chosen date for linking
  const processTaskCreationWithDate = (data: any, chosenDate: string) => {
    const costCode = TASK_TYPE_TO_COST_CODE[data.taskType as keyof typeof TASK_TYPE_TO_COST_CODE] || data.taskType;
    const sortedTasks = [...(existingTasks as any[])].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
    
    // Process with the chosen date - use same logic as EditTaskModal
    const linkedTasks = (existingTasks as any[]).filter((task: any) => 
      data.linkedTaskIds.includes((task.taskId || task.id).toString())
    );
    
    const linkedTaskGroup = linkedTasks.find(t => t.linkedTaskGroup)?.linkedTaskGroup || generateLinkedTaskGroupId();
    
    const newTask = {
      taskId: `${selectedLocation}_${data.name.replace(/\s+/g, '_')}_${Date.now()}`,
      locationId: selectedLocation,
      projectId: selectedProject,
      name: data.name,
      taskType: data.taskType,
      costCode,
      taskDate: chosenDate,
      startDate: chosenDate,
      finishDate: chosenDate,
      startTime: data.startTime || null,
      finishTime: data.finishTime || null,
      status: data.status,
      workDescription: data.workDescription || '',
      notes: data.notes || '',
      dependentOnPrevious: false, // New linked task is non-sequential
      linkedTaskGroup,
      superintendentId: null,
      foremanId: null,
      scheduledHours: "0.00",
      actualHours: data.status === 'complete' ? "0.00" : null,
      order: 0 // Will be set correctly below
    };

    // Update all linked tasks to have the same group, chosen date, and proper sequential status
    // Update all tasks to have the same group and chosen date
    const tasksToUpdate = linkedTasks.map((task) => ({
      ...task,
      linkedTaskGroup,
      taskDate: chosenDate,
      dependentOnPrevious: false // Initially set all to non-sequential
    }));
    
    // Create complete task list with ALL tasks (existing + new)
    const allTasks = [...existingTasks.filter(t => !linkedTasks.some(lt => 
      (lt.taskId || lt.id) === (t.taskId || t.id)
    )), ...tasksToUpdate, newTask];
    
    // Sort by chronological order: date first, then original order
    allTasks.sort((a, b) => {
      const dateA = new Date(a.taskDate).getTime();
      const dateB = new Date(b.taskDate).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return (a.order || 0) - (b.order || 0);
    });
    
    // Reassign orders based on chronological position
    allTasks.forEach((task, index) => {
      task.order = index;
    });
    
    // Apply sequential logic and date shifting
    for (let i = 0; i < allTasks.length; i++) {
      const currentTask = allTasks[i];
      
      if (currentTask.linkedTaskGroup === linkedTaskGroup) {
        // This is our linked group - make first one sequential if it has a predecessor
        if (i > 0) {
          currentTask.dependentOnPrevious = true;
          console.log('Making linked task sequential:', currentTask.name, 'Position:', i);
        } else {
          currentTask.dependentOnPrevious = false;
          console.log('First task overall - keeping non-sequential:', currentTask.name);
        }
        
        // All other tasks in this linked group should be non-sequential
        for (let j = i + 1; j < allTasks.length; j++) {
          if (allTasks[j].linkedTaskGroup === linkedTaskGroup) {
            allTasks[j].dependentOnPrevious = false;
          }
        }
        
        // Now shift any sequential tasks that come after this linked group
        const linkedGroupEndIndex = allTasks.findLastIndex(t => t.linkedTaskGroup === linkedTaskGroup);
        let currentDate = chosenDate; // Use the chosen date as baseline
        
        for (let k = linkedGroupEndIndex + 1; k < allTasks.length; k++) {
          const subsequentTask = allTasks[k];
          if (subsequentTask.dependentOnPrevious) {
            // Calculate next working day
            const baseDate = new Date(currentDate + 'T00:00:00');
            const nextDate = new Date(baseDate);
            nextDate.setDate(nextDate.getDate() + 1);
            // Skip weekends
            while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
              nextDate.setDate(nextDate.getDate() + 1);
            }
            const newDate = nextDate.toISOString().split('T')[0];
            
            console.log('Shifting sequential task after linked group:', subsequentTask.name, 'from:', subsequentTask.taskDate, 'to:', newDate);
            subsequentTask.taskDate = newDate;
            currentDate = newDate;
          } else {
            // Non-sequential task - update baseline but don't change its date
            currentDate = subsequentTask.taskDate;
          }
        }
        break; // We've handled the linked group
      }
    }
    
    console.log('Linking tasks - updating existing tasks:', tasksToUpdate.map(t => ({ 
      name: t.name, 
      linked: t.linkedTaskGroup, 
      sequential: t.dependentOnPrevious,
      date: t.taskDate 
    })));
    // Find tasks that need updates (excluding the new task)
    const finalTasksToUpdate = allTasks.filter(task => {
      if (task === newTask) return false; // Exclude new task
      const original = existingTasks.find(t => (t.taskId || t.id) === (task.taskId || task.id));
      return !original || 
             original.order !== task.order ||
             original.linkedTaskGroup !== task.linkedTaskGroup ||
             original.taskDate !== task.taskDate ||
             original.dependentOnPrevious !== task.dependentOnPrevious;
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
        // Collect all available dates from selected tasks
        const availableDates = linkedTasks.map(t => ({
          date: t.taskDate,
          taskName: t.name
        }));
        
        // Remove duplicates by date
        const uniqueDates = availableDates.filter((item, index, self) => 
          self.findIndex(d => d.date === item.date) === index
        );
        
        if (uniqueDates.length > 1) {
          // Show date choice dialog for multiple dates
          console.log('Multiple dates available - showing date choice dialog');
          setLinkingOptions({
            currentTask: { name: data.name, taskDate: data.taskDate },
            targetTasks: linkedTasks,
            availableDates: uniqueDates
          });
          setShowLinkDateDialog(true);
          setPendingFormData(data);
          return;
        }
        
        // All tasks have same date or only one unique date - proceed directly
        console.log('All tasks have same date - linking directly');
        const firstLinkedTask = linkedTasks[0];
        
        // Check if any selected tasks already have a linked group, or create new one
        const existingGroup = data.linkedTaskIds.map((id: string) => {
          const task = (existingTasks as any[]).find((t: any) => (t.taskId || t.id).toString() === id);
          return task?.linkedTaskGroup;
        }).find(group => group);
        
        linkedTaskGroup = existingGroup || generateLinkedTaskGroupId();
        taskDate = firstLinkedTask.taskDate;
        
        // Update all selected linked tasks to have the same group ID
        data.linkedTaskIds.forEach((taskId: string) => {
          const taskIndex = updatedTasks.findIndex(t => 
            (t.taskId || t.id).toString() === taskId
          );
          if (taskIndex >= 0) {
            updatedTasks[taskIndex] = { 
              ...updatedTasks[taskIndex], 
              linkedTaskGroup,
              dependentOnPrevious: true // Linked tasks are sequential
            };
          }
        });
        
        // Find position to insert (after the last linked task)
        const linkedTaskIndices = data.linkedTaskIds.map((id: string) => 
          sortedTasks.findIndex(t => (t.taskId || t.id).toString() === id)
        ).filter(index => index >= 0);
        insertIndex = Math.max(...linkedTaskIndices) + 1;
        
        // Shift all subsequent sequential tasks (but NOT linked tasks)
        let currentDate = taskDate;
        for (let i = insertIndex; i < updatedTasks.length; i++) {
          const task = updatedTasks[i];
          
          // Skip linked tasks - they maintain their synchronized date
          if (task.linkedTaskGroup) {
            currentDate = task.taskDate;
            continue;
          }
          
          if (task.dependentOnPrevious) {
            // Calculate next date based on the current reference date
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
            // Non-dependent task keeps its date
            currentDate = task.taskDate;
          }
        }
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
          // For sequential tasks at the end, we need to find the last sequential task in the chain
          // Sequential tasks should follow each other in a continuous chain
          let latestDate = null;
          let referenceTask = null;
          
          // Walk through all tasks and find the last one in the sequential chain
          for (let i = sortedTasks.length - 1; i >= 0; i--) {
            const task = sortedTasks[i];
            if (task.dependentOnPrevious || i === 0) { // First task or sequential task
              if (!latestDate || new Date(task.taskDate) > new Date(latestDate)) {
                latestDate = task.taskDate;
                referenceTask = task;
              }
            }
          }
          
          // If no sequential tasks found, use the very first task
          if (!referenceTask) {
            referenceTask = sortedTasks[0];
            latestDate = referenceTask.taskDate;
          }
          
          const lastDate = new Date(latestDate + 'T00:00:00');
          const nextDate = new Date(lastDate);
          nextDate.setDate(nextDate.getDate() + 1);
          // Skip weekends
          while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
            nextDate.setDate(nextDate.getDate() + 1);
          }
          taskDate = nextDate.toISOString().split('T')[0];
          console.log('Sequential task at end - following latest sequential task:', referenceTask.name, referenceTask.taskDate, '-> new date:', taskDate);
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
          } else {
            // Regular task, insert immediately after it
            insertIndex = afterTaskIndex + 1;
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

    // Create the new task
    const newTask = {
      taskId: `${selectedLocation}_${data.name.replace(/\s+/g, '_')}_${Date.now()}`,
      locationId: selectedLocation,
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
      order: insertIndex
    };

    // Insert new task into the array
    updatedTasks.splice(insertIndex, 0, newTask);

    // Update order values for all tasks
    updatedTasks = updatedTasks.map((task, index) => ({
      ...task,
      order: index
    }));

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
                        <SelectItem value="start">At the beginning</SelectItem>
                        {(existingTasks as any[])
                          .sort((a: any, b: any) => {
                            // Use same ORDER-first sorting as display and logic
                            if (a.order !== undefined && b.order !== undefined) {
                              return a.order - b.order;
                            }
                            if (a.order !== undefined && b.order === undefined) {
                              return -1;
                            }
                            if (a.order === undefined && b.order !== undefined) {
                              return 1;
                            }
                            const dateA = new Date(a.taskDate).getTime();
                            const dateB = new Date(b.taskDate).getTime();
                            if (dateA !== dateB) return dateA - dateB;
                            return (a.taskId || a.id).localeCompare(b.taskId || b.id);
                          })
                          .map((task: any) => (
                          <SelectItem 
                            key={task.id || task.taskId} 
                            value={`after-${(task.taskId || task.id).toString()}`}
                          >
                            After: {task.name} ({new Date(task.taskDate).toLocaleDateString('en-US')})
                          </SelectItem>
                        ))}
                        <SelectItem value="end">At the end</SelectItem>
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
                                    onClick={() => {
                                      const newValue = field.value.filter((id: string) => id !== taskId);
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
                            .filter((t: any) => 
                              !field.value.includes((t.taskId || t.id).toString())
                            ).length > 0 && (
                            <Select 
                              onValueChange={(value) => {
                                if (value && !field.value.includes(value)) {
                                  field.onChange([...field.value, value]);
                                }
                              }}
                            >
                              <SelectTrigger className="border-none shadow-none p-0 h-auto focus:ring-0">
                                <SelectValue placeholder={field.value.length === 0 ? "Choose tasks to link with" : "Add more tasks..."} />
                              </SelectTrigger>
                              <SelectContent>
                                {(existingTasks as any[])
                                  .filter((t: any) => 
                                    !field.value.includes((t.taskId || t.id).toString())
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
                                        key={task.id || task.taskId} 
                                        value={(task.taskId || task.id).toString()}
                                      >
                                        {task.name} ({formatDate(task.taskDate)})
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
      </DialogContent>
      
      {/* Date Selection Dialog for Linking */}
      <AlertDialog open={showLinkDateDialog} onOpenChange={setShowLinkDateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Choose Date for Linked Tasks</AlertDialogTitle>
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
                <div className="mt-2">All tasks must have the same date. Which date should all tasks use?</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col space-y-3 sm:flex-col">
            {linkingOptions?.availableDates?.map((dateOption, idx) => (
              <Button 
                key={idx}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDateChoice(dateOption.date);
                }}
                variant="outline"
                className="w-full text-center px-4 py-3"
              >
                <div>
                  <div className="font-medium">Use "{dateOption.taskName}" Date</div>
                  <div className="text-sm text-gray-500">{dateOption.date}</div>
                </div>
              </Button>
            ))}
            <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
