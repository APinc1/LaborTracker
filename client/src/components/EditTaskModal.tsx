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
    
    let processedData = {
      ...task, // Keep all existing task data
      ...data, // Override with edited fields only
    };

    // Handle linking changes
    const linkingChanged = data.linkToExistingTask !== !!task.linkedTaskGroup;
    
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
        
        // When linking two tasks, the first task in the sequence should be sequential+linked
        // and the second task should be just linked
        
        const currentTaskIndex = allUpdatedTasks.findIndex(t => (t.taskId || t.id) === (task.taskId || task.id));
        const linkedTaskIndex = allUpdatedTasks.findIndex(t => (t.taskId || t.id).toString() === data.linkedTaskId);
        
        // Determine which task comes first in the sequence
        if (currentTaskIndex < linkedTaskIndex) {
          // Current task comes first - it should be sequential+linked
          processedData.dependentOnPrevious = true;
          // Linked task becomes just linked
          linkedTask.dependentOnPrevious = false;
        } else {
          // Linked task comes first - it should be sequential+linked  
          processedData.dependentOnPrevious = false;
          // Linked task becomes sequential+linked
          linkedTask.dependentOnPrevious = true;
        }
      }
    } else if (!data.linkToExistingTask && task.linkedTaskGroup) {
      // UNLINKING FROM GROUP
      processedData.linkedTaskGroup = null;
      processedData.dependentOnPrevious = data.dependentOnPrevious ?? true;
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
          
          // Determine which task should be sequential and calculate the proper date
          let sequentialTaskIndex, nonSequentialTaskIndex;
          if (mainTaskIndex < linkedTaskIndex) {
            // Current task comes first - it should be sequential
            sequentialTaskIndex = mainTaskIndex;
            nonSequentialTaskIndex = linkedTaskIndex;
          } else {
            // Linked task comes first - it should be sequential
            sequentialTaskIndex = linkedTaskIndex;
            nonSequentialTaskIndex = mainTaskIndex;
          }
          
          // Calculate the proper sequential date for the first task
          let sequentialDate = allUpdatedTasks[sequentialTaskIndex].taskDate;
          
          if (sequentialTaskIndex > 0) {
            // Find the previous task (not from same linked group) to calculate sequential date
            let previousTaskDate = null;
            
            for (let i = sequentialTaskIndex - 1; i >= 0; i--) {
              const prevTask = allUpdatedTasks[i];
              
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
          allUpdatedTasks[sequentialTaskIndex] = {
            ...allUpdatedTasks[sequentialTaskIndex],
            linkedTaskGroup: linkedTaskGroup,
            dependentOnPrevious: true, // First task in sequence is sequential
            taskDate: sequentialDate
          };
          
          allUpdatedTasks[nonSequentialTaskIndex] = {
            ...allUpdatedTasks[nonSequentialTaskIndex],
            linkedTaskGroup: linkedTaskGroup,
            dependentOnPrevious: false, // Second task in sequence is just linked
            taskDate: sequentialDate // Both tasks must have same date
          };
          
          // No repositioning needed - tasks stay in their current positions
          // Update order values for consistency
          allUpdatedTasks = allUpdatedTasks.map((task, index) => ({
            ...task,
            order: index
          }));
          
          console.log('Updated sequential task (first in group):', allUpdatedTasks[sequentialTaskIndex].name, 'with date:', sequentialDate);
          console.log('Updated linked task (second in group):', allUpdatedTasks[nonSequentialTaskIndex].name, 'with date:', sequentialDate);
        }
      }

      // Handle dependency changes - when a task becomes sequential, calculate its proper date
      if (dependencyChanged && processedData.dependentOnPrevious) {
        const taskIndex = allUpdatedTasks.findIndex(t => (t.taskId || t.id) === (task.taskId || task.id));
        if (taskIndex > 0) {
          // Find the previous task (not linked task from same group)
          let previousTaskDate = null;
          
          for (let i = taskIndex - 1; i >= 0; i--) {
            const prevTask = allUpdatedTasks[i];
            
            // Skip tasks from the same linked group
            if (processedData.linkedTaskGroup && prevTask.linkedTaskGroup === processedData.linkedTaskGroup) {
              continue;
            }
            
            previousTaskDate = prevTask.taskDate;
            break;
          }
          
          if (previousTaskDate) {
            // Calculate next working day
            const baseDate = new Date(previousTaskDate + 'T00:00:00');
            const nextDate = new Date(baseDate);
            nextDate.setDate(nextDate.getDate() + 1);
            // Skip weekends
            while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
              nextDate.setDate(nextDate.getDate() + 1);
            }
            const newDate = nextDate.toISOString().split('T')[0];
            
            // Update the task and its linked group with the new date
            allUpdatedTasks[taskIndex] = {
              ...allUpdatedTasks[taskIndex],
              taskDate: newDate
            };
            
            // If this task is linked, update all tasks in the linked group
            if (processedData.linkedTaskGroup) {
              allUpdatedTasks = allUpdatedTasks.map(t => 
                t.linkedTaskGroup === processedData.linkedTaskGroup 
                  ? { ...t, taskDate: newDate }
                  : t
              );
            }
            
            console.log('Updated sequential task date to:', newDate);
          }
        }
      }
      
      // Handle linked task synchronization - any task in a linked group should sync dates
      const finalLinkedGroup = processedData.linkedTaskGroup || task.linkedTaskGroup;
      if (finalLinkedGroup && dateChanged) {
        console.log('Syncing all tasks in linked group:', finalLinkedGroup, 'to date:', processedData.taskDate);
        
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
      
      // Process sequential dependencies after date changes
      // Don't sort - use original order to maintain task positioning
      const taskIndex = allUpdatedTasks.findIndex(t => (t.taskId || t.id) === (task.taskId || task.id));
      if (taskIndex >= 0 && dateChanged) {
        // Update subsequent sequential tasks in their original order
        let currentDate = processedData.taskDate;
        for (let i = taskIndex + 1; i < allUpdatedTasks.length; i++) {
          const subsequentTask = allUpdatedTasks[i];
          
          if (subsequentTask.dependentOnPrevious) {
            const baseDate = new Date(currentDate + 'T00:00:00');
            const nextDate = new Date(baseDate);
            nextDate.setDate(nextDate.getDate() + 1);
            // Skip weekends
            while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
              nextDate.setDate(nextDate.getDate() + 1);
            }
            const newDate = nextDate.toISOString().split('T')[0];
            
            allUpdatedTasks[i] = {
              ...allUpdatedTasks[i],
              taskDate: newDate
            };
            
            // If this task is linked, update all tasks in its linked group
            if (subsequentTask.linkedTaskGroup) {
              allUpdatedTasks = allUpdatedTasks.map(t => 
                t.linkedTaskGroup === subsequentTask.linkedTaskGroup 
                  ? { ...t, taskDate: newDate }
                  : t
              );
            }
            
            currentDate = newDate;
          } else {
            currentDate = subsequentTask.taskDate;
          }
        }
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
                        disabled={form.watch("linkToExistingTask")}
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
    </Dialog>
  );
}