import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  insertPosition: z.string().min(1, "Position is required"),
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
  linkedTaskId: z.string().optional()
}).refine((data) => {
  // Date is required for non-dependent, non-linked tasks
  if (!data.dependentOnPrevious && !data.linkToExistingTask && !data.taskDate) {
    return false;
  }
  // LinkedTaskId is required when linking to existing task
  if (data.linkToExistingTask && !data.linkedTaskId) {
    return false;
  }
  return true;
}, {
  message: "Date is required for non-dependent tasks, or select a task to link with",
  path: ["taskDate"]
});

export default function CreateTaskModal({ 
  isOpen, 
  onClose, 
  selectedProject, 
  selectedLocation 
}: CreateTaskModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch existing tasks for linking
  const { data: existingTasks = [] } = useQuery({
    queryKey: ["/api/locations", selectedLocation, "tasks"],
    enabled: !!selectedLocation && isOpen,
    staleTime: 5000,
  });

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
      linkedTaskId: '',
    },
  });

  const onSubmit = (data: any) => {
    // Get cost code from task type
    const costCode = TASK_TYPE_TO_COST_CODE[data.taskType as keyof typeof TASK_TYPE_TO_COST_CODE] || data.taskType;
    
    // Sort existing tasks for position calculations
    const sortedTasks = [...existingTasks].sort((a, b) => {
      const dateA = new Date(a.taskDate).getTime();
      const dateB = new Date(b.taskDate).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return (a.order || 0) - (b.order || 0);
    });

    let taskDate: string;
    let linkedTaskGroup: string | null = null;
    let insertIndex = sortedTasks.length; // Default to end
    let updatedTasks = [...sortedTasks];

    // Handle different task creation modes
    if (data.linkToExistingTask && data.linkedTaskId) {
      // LINKED TASK MODE: Use same date as linked task
      const linkedTask = existingTasks.find((task: any) => 
        (task.taskId || task.id).toString() === data.linkedTaskId
      );
      if (linkedTask) {
        linkedTaskGroup = linkedTask.linkedTaskGroup || generateLinkedTaskGroupId();
        taskDate = linkedTask.taskDate;
        
        // Update the original linked task to have the group ID and make it sequential + linked
        if (!linkedTask.linkedTaskGroup) {
          const linkedTaskIndex = updatedTasks.findIndex(t => 
            (t.taskId || t.id) === (linkedTask.taskId || linkedTask.id)
          );
          if (linkedTaskIndex >= 0) {
            updatedTasks[linkedTaskIndex] = { 
              ...updatedTasks[linkedTaskIndex], 
              linkedTaskGroup,
              dependentOnPrevious: true // First task in linked group is sequential
            };
          }
        }
        
        // Find position to insert (after the linked task)
        const linkedTaskIndex = sortedTasks.findIndex(t => 
          (t.taskId || t.id) === (linkedTask.taskId || linkedTask.id)
        );
        insertIndex = linkedTaskIndex + 1;
        
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
        if (data.dependentOnPrevious) {
          // First task can't be dependent
          data.dependentOnPrevious = false;
        }
        taskDate = data.taskDate || new Date().toISOString().split('T')[0];
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
          insertIndex = afterTaskIndex + 1;
          const afterTask = sortedTasks[afterTaskIndex];
          
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
      dependentOnPrevious: data.linkToExistingTask ? false : data.dependentOnPrevious,
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
    // Only update tasks that have actually changed (date, linkedTaskGroup, or dependentOnPrevious)
    const tasksToUpdate = updatedTasks.filter(task => {
      const originalTask = existingTasks.find(orig => 
        (orig.taskId || orig.id) === (task.taskId || task.id)
      );
      return originalTask && (
        originalTask.taskDate !== task.taskDate ||
        originalTask.linkedTaskGroup !== task.linkedTaskGroup ||
        originalTask.dependentOnPrevious !== task.dependentOnPrevious
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
            {/* Position Selection */}
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
                      {existingTasks
                        .sort((a, b) => {
                          const dateA = new Date(a.taskDate).getTime();
                          const dateB = new Date(b.taskDate).getTime();
                          if (dateA !== dateB) return dateA - dateB;
                          return (a.order || 0) - (b.order || 0);
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

            {/* Task Type Selection */}
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

              {/* Linked Task Selection */}
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
                          {existingTasks
                            .sort((a, b) => {
                              const dateA = new Date(a.taskDate).getTime();
                              const dateB = new Date(b.taskDate).getTime();
                              if (dateA !== dateB) return dateA - dateB;
                              return (a.order || 0) - (b.order || 0);
                            })
                            .map((task: any) => {
                              // Fix date display - use direct string formatting to avoid timezone issues
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
                            })}
                        </SelectContent>
                      </Select>
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

            {/* Task Type - Now first */}
            <FormField
              control={form.control}
              name="taskType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Type *</FormLabel>
                  <Select onValueChange={(value) => {
                    field.onChange(value);
                    // Auto-fill task name if it's empty
                    const currentName = form.getValues("name");
                    if (!currentName || currentName.trim() === "") {
                      form.setValue("name", value);
                    }
                  }} defaultValue={field.value}>
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

            {/* Task Name - Now second */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter task name" {...field} />
                  </FormControl>
                  <p className="text-xs text-gray-500">
                    Auto-filled from task type selection. You can change it if needed.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

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
    </Dialog>
  );
}
