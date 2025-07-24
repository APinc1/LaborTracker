import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { updateTaskDependencies } from "@shared/taskUtils";
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
  taskDate: z.string().min(1, "Task date is required"),
  startTime: z.string().optional(),
  finishTime: z.string().optional(),
  workDescription: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
  dependentOnPrevious: z.boolean().optional(),
});

export default function EditTaskModal({ isOpen, onClose, task, onTaskUpdate, locationTasks = [] }: EditTaskModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      taskDate: "",
      startTime: "",
      finishTime: "",
      workDescription: "",
      notes: "",
      status: "upcoming",
      dependentOnPrevious: true,
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
        taskDate: task.taskDate || "",
        startTime: task.startTime || "",
        finishTime: task.finishTime || "",
        workDescription: task.workDescription || "",
        notes: task.notes || "",
        status: status,
        dependentOnPrevious: task.dependentOnPrevious ?? true,
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
    
    const processedData = {
      ...task, // Keep all existing task data
      ...data, // Override with edited fields only
    };

    // Handle actualHours based on status
    if (data.status === "complete") {
      // If marking as complete, set actualHours to scheduledHours if not already set
      processedData.actualHours = task.actualHours || task.scheduledHours;
    } else {
      // If not complete, clear actualHours
      processedData.actualHours = null;
    }

    // Check if date changed and handle dependency shifting
    const dateChanged = data.taskDate !== task.taskDate;
    const dependencyChanged = data.dependentOnPrevious !== task.dependentOnPrevious;
    
    if (dateChanged && locationTasks && locationTasks.length > 0) {
      // Update all affected tasks with dependency shifting
      const updatedTasks = updateTaskDependencies(
        locationTasks, 
        task.taskId || task.id, 
        data.taskDate, 
        task.taskDate
      );
      
      // Ensure the main task includes the dependency change
      const mainTaskIndex = updatedTasks.findIndex(t => (t.taskId || t.id) === (task.taskId || task.id));
      if (mainTaskIndex >= 0) {
        updatedTasks[mainTaskIndex] = { ...updatedTasks[mainTaskIndex], ...processedData };
      }
      
      // Batch update all affected tasks
      console.log('Date changed - updating all affected tasks:', updatedTasks);
      batchUpdateTasksMutation.mutate(updatedTasks);
    } else {
      // Single task update (including dependency changes)
      console.log('Processed data to send:', processedData);
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
          <DialogTitle className="flex items-center gap-2">
            <Edit className="w-5 h-5" />
            Edit Task: {getTaskDisplayName(task.name)}
          </DialogTitle>
          <DialogDescription>
            Edit task date, schedule, description, and status. Other fields are based on cost code settings.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Task Basic Info - Read Only */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <FormLabel className="text-sm font-medium text-gray-700">Task Name</FormLabel>
                <div className="flex items-center gap-2 p-2 bg-gray-50 border rounded-md">
                  <span className="text-sm text-gray-600 font-medium">{getTaskDisplayName(task.name)}</span>
                </div>
                <p className="text-xs text-gray-500">Generated from task type and sequence</p>
              </div>

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
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="dependentOnPrevious"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Dependent on Previous Task
                      </FormLabel>
                      <p className="text-xs text-gray-500">
                        When enabled, this task will automatically shift if previous tasks change dates
                      </p>
                    </div>
                  </FormItem>
                )}
              />
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