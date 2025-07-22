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
import { z } from "zod";

interface EditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: any | null;
  onTaskUpdate: () => void;
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
  "DEMO/EX",
  "BASE/GRADING",
  "CONCRETE", 
  "AC",
  "UTILITY ADJ"
];

// Extended schema for editing with status
const editTaskSchema = insertTaskSchema.extend({
  status: z.string().optional(),
});

export default function EditTaskModal({ isOpen, onClose, task, onTaskUpdate }: EditTaskModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(editTaskSchema),
    defaultValues: {
      taskDate: "",
      startTime: "",
      finishTime: "",
      workDescription: "",
      notes: "",
      status: "upcoming",
    },
  });

  // Update form when task changes
  useEffect(() => {
    if (task) {
      const currentDate = new Date().toISOString().split('T')[0];
      let status = "upcoming";
      
      // Determine status based on date and completion
      if (task.actualHours && parseFloat(task.actualHours) > 0) {
        status = "complete";
      } else if (task.taskDate === currentDate) {
        status = "in_progress";
      }

      form.reset({
        taskDate: task.taskDate || "",
        startTime: task.startTime || "",
        finishTime: task.finishTime || "",
        workDescription: task.workDescription || "",
        notes: task.notes || "",
        status: status,
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

  const onSubmit = (data: any) => {
    const processedData = {
      ...task, // Keep all existing task data
      ...data, // Override with edited fields only
      // If status is complete, set actualHours to scheduledHours if not already set
      actualHours: data.status === "complete" && !task.actualHours 
        ? task.scheduledHours
        : task.actualHours,
    };

    updateTaskMutation.mutate(processedData);
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
                    {task.startDate ? new Date(task.startDate).toLocaleDateString() : 'Not set'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">Based on cost code schedule</p>
              </div>

              <div className="space-y-2">
                <FormLabel className="text-sm font-medium text-gray-700">Cost Code Finish Date</FormLabel>
                <div className="flex items-center gap-2 p-2 bg-gray-50 border rounded-md">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">
                    {task.finishDate ? new Date(task.finishDate).toLocaleDateString() : 'Not set'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">Based on cost code schedule</p>
              </div>
            </div>

            {/* Cost Code and Hours - Read Only */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <FormLabel className="text-sm font-medium text-gray-700">Cost Code</FormLabel>
                <div className="flex items-center gap-2 p-2 bg-gray-50 border rounded-md">
                  <Badge variant="secondary">{task.costCode}</Badge>
                </div>
                <p className="text-xs text-gray-500">Assigned based on task type</p>
              </div>

              <div className="space-y-2">
                <FormLabel className="text-sm font-medium text-gray-700">Scheduled Hours</FormLabel>
                <div className="flex items-center gap-2 p-2 bg-gray-50 border rounded-md">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600 font-medium">{task.scheduledHours} hours</span>
                </div>
                <p className="text-xs text-gray-500">Based on budget allocation</p>
              </div>
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