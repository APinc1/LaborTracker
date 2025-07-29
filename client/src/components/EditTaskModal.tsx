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
  linkedTaskId: z.string().optional(),
});

export default function EditTaskModal({ isOpen, onClose, task, onTaskUpdate, locationTasks = [] }: EditTaskModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDateChangeDialog, setShowDateChangeDialog] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<any>(null);

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
      linkedTaskId: "",
    },
  });

  // Update form when task changes
  useEffect(() => {
    if (task) {
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
        linkedTaskId: "",
      });
    }
  }, [task, form]);

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
    onSuccess: () => {
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
    
    const dateChanged = data.taskDate !== task.taskDate;
    
    // If date changed and task is sequential, show confirmation dialog
    if (dateChanged && task.dependentOnPrevious) {
      setPendingFormData(data);
      setShowDateChangeDialog(true);
      return;
    }

    // Process the form submission
    processFormSubmission(data);
  };

  const processFormSubmission = (data: any, keepSequential = false) => {
    let processedData = {
      ...task, // Keep all existing task data
      ...data, // Override with edited fields only
    };
    
    // Handle date change dialog choice
    if (keepSequential === false && pendingFormData) {
      // User chose to make non-sequential - override dependency
      processedData.dependentOnPrevious = false;
    }

    // Handle linking changes
    let linkingChanged = data.linkToExistingTask !== !!task.linkedTaskGroup;
    
    if (data.linkToExistingTask && data.linkedTaskId) {
      // LINKING TO A TASK
      const linkedTask = (existingTasks as any[]).find((t: any) => 
        (t.taskId || t.id).toString() === data.linkedTaskId
      );
      if (linkedTask) {
        // Create new linked group or use existing one
        const linkedTaskGroup = linkedTask.linkedTaskGroup || generateLinkedTaskGroupId();
        processedData.linkedTaskGroup = linkedTaskGroup;
        processedData.taskDate = linkedTask.taskDate; // Must use same date as linked task
        
        // When linking two tasks, we need to determine which should be sequential based on their positions
        // This will be handled in the cascading updates section where we have access to the task list
      }
    } else if (!data.linkToExistingTask && task.linkedTaskGroup) {
      // UNLINKING FROM GROUP - also unlink the other task in the group
      processedData.linkedTaskGroup = null;
      processedData.dependentOnPrevious = data.dependentOnPrevious ?? true;
      
      // Mark that we need to unlink the partner task too
      linkingChanged = true;
    }

    // Handle actualHours based on status
    if (data.status === "complete") {
      // If marking as complete, set actualHours to scheduledHours if not already set
      processedData.actualHours = task.actualHours || task.scheduledHours;
    } else {
      // If not complete, clear actualHours
      processedData.actualHours = null;
    }

    // Check if changes require cascading updates
    const dateChanged = data.taskDate !== task.taskDate;
    const dependencyChanged = data.dependentOnPrevious !== task.dependentOnPrevious;
    
    if ((dateChanged || linkingChanged || dependencyChanged) && locationTasks && locationTasks.length > 0) {
      console.log('Task changes require cascading updates');
      
      let allUpdatedTasks = [...locationTasks];
      
      // Update the main task first
      const mainTaskIndex = allUpdatedTasks.findIndex(t => (t.taskId || t.id) === (task.taskId || task.id));
      if (mainTaskIndex >= 0) {
        allUpdatedTasks[mainTaskIndex] = { ...allUpdatedTasks[mainTaskIndex], ...processedData };
      }

      // Handle new linking - update both tasks based on their sequence position
      if (data.linkToExistingTask && data.linkedTaskId && linkingChanged) {
        const linkedTaskIndex = allUpdatedTasks.findIndex(t => 
          (t.taskId || t.id).toString() === data.linkedTaskId
        );
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
            dependentOnPrevious: true, // First task chronologically is sequential
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
      }

      // Handle unlinking - unlink the partner task and trigger sequential cascading
      if (!data.linkToExistingTask && task.linkedTaskGroup && linkingChanged) {
        // Find and unlink the partner task
        const partnerTask = allUpdatedTasks.find(t => 
          t.linkedTaskGroup === task.linkedTaskGroup && (t.taskId || t.id) !== (task.taskId || task.id)
        );
        
        allUpdatedTasks = allUpdatedTasks.map(t => 
          t.linkedTaskGroup === task.linkedTaskGroup && (t.taskId || t.id) !== (task.taskId || task.id)
            ? { ...t, linkedTaskGroup: null, dependentOnPrevious: true } // Make partner sequential by default
            : t
        );
        
        console.log('Unlinked partner task from group:', task.linkedTaskGroup);
        
        // If the partner task becomes sequential, recalculate its date and trigger cascading
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
        
        // Sort all tasks chronologically to process sequential dependencies correctly  
        const sortedTasks = [...allUpdatedTasks].sort((a, b) => {
          const dateA = new Date(a.taskDate).getTime();
          const dateB = new Date(b.taskDate).getTime();
          if (dateA !== dateB) return dateA - dateB;
          return (a.order || 0) - (b.order || 0);
        });
        
        // Find the changed task in sorted order
        const changedTaskSortedIndex = sortedTasks.findIndex(t => (t.taskId || t.id) === (task.taskId || task.id));
        
        if (changedTaskSortedIndex >= 0) {
          let currentDate = processedData.taskDate;
          console.log('Starting cascade from task:', task.name, 'at date:', currentDate);
          
          // Process all tasks chronologically after the changed task
          for (let i = changedTaskSortedIndex + 1; i < sortedTasks.length; i++) {
            const subsequentTask = sortedTasks[i];
            
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
              
              // Update in original array
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
                  allUpdatedTasks = allUpdatedTasks.map(t => {
                    if (t.linkedTaskGroup === subsequentTask.linkedTaskGroup) {
                      console.log('Syncing linked task:', t.name, 'to:', newDate);
                      return { ...t, taskDate: newDate };
                    }
                    return t;
                  });
                }
                
                currentDate = newDate;
              }
            } else {
              // Non-sequential task - use its existing date as the baseline for next sequential tasks
              currentDate = subsequentTask.taskDate;
              console.log('Non-sequential task baseline:', subsequentTask.name, 'at:', currentDate);
            }
          }
        }
        
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
          originalTask.order !== updatedTask.order
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
                      <Input type="date" {...field} />
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

              {form.watch("linkToExistingTask") && (
                <FormField
                  control={form.control}
                  name="linkedTaskId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select Task to Link With</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose an existing task" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(existingTasks as any[])
                            .filter((t: any) => (t.taskId || t.id) !== (task.taskId || task.id))
                            .sort((a: any, b: any) => {
                              // Sort by date first, then by order
                              const dateA = new Date(a.taskDate).getTime();
                              const dateB = new Date(b.taskDate).getTime();
                              if (dateA !== dateB) return dateA - dateB;
                              return (a.order || 0) - (b.order || 0);
                            })
                            .map((linkTask: any) => {
                              // Fix date display - use direct string formatting to avoid timezone issues
                              const formatDate = (dateStr: string) => {
                                const [year, month, day] = dateStr.split('-');
                                return `${month}/${day}/${year}`;
                              };
                              return (
                                <SelectItem 
                                  key={linkTask.id || linkTask.taskId} 
                                  value={(linkTask.taskId || linkTask.id).toString()}
                                >
                                  {linkTask.name} ({formatDate(linkTask.taskDate)})
                                </SelectItem>
                              );
                            })
                          }
                        </SelectContent>
                      </Select>
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
      <AlertDialog open={showDateChangeDialog} onOpenChange={setShowDateChangeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sequential Task Date Change</AlertDialogTitle>
            <AlertDialogDescription>
              This task is currently sequential (automatically positioned after the previous task). 
              When you change the date, you can either:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col space-y-2">
            <AlertDialogAction 
              onClick={() => {
                processFormSubmission(pendingFormData, true);
                setShowDateChangeDialog(false);
                setPendingFormData(null);
              }}
              className="w-full"
            >
              Keep Sequential & Move Position
              <span className="text-xs block mt-1">
                Move to the new date and maintain sequential dependency
              </span>
            </AlertDialogAction>
            <AlertDialogCancel 
              onClick={() => {
                processFormSubmission(pendingFormData, false);
                setShowDateChangeDialog(false);
                setPendingFormData(null);
              }}
              className="w-full"
            >
              Make Non-Sequential & Shift Others
              <span className="text-xs block mt-1">
                Remove sequential dependency and shift following tasks
              </span>
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}