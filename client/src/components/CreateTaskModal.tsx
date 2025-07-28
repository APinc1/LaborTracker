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

// Create form schema
const createTaskFormSchema = z.object({
  taskDate: z.string().min(1, "Date is required"),
  name: z.string().min(1, "Task name is required"),
  taskType: z.string().min(1, "Task type is required"),
  startTime: z.string().min(1, "Start time is required"),
  finishTime: z.string().min(1, "Finish time is required"),
  status: z.string().min(1, "Status is required"),
  workDescription: z.string().optional(),
  notes: z.string().optional(),
  dependentOnPrevious: z.boolean().default(true),
  linkToExistingTask: z.boolean().default(false),
  linkedTaskId: z.string().optional()
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
    mutationFn: async (data: any) => {
      const response = await apiRequest(`/api/locations/${data.locationId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      });
      return response.json();
    },
    onSuccess: (result, variables) => {
      // Invalidate both general tasks and location-specific tasks
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations", String(variables.locationId), "tasks"] });
      toast({ title: "Success", description: "Task created successfully" });
      onClose();
      form.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create task", variant: "destructive" });
    },
  });

  const form = useForm({
    resolver: zodResolver(createTaskFormSchema),
    defaultValues: {
      taskDate: new Date().toISOString().split('T')[0],
      name: '',
      taskType: '',
      startTime: '08:00',
      finishTime: '17:00',
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
    
    // Handle linked tasks
    let linkedTaskGroup = null;
    let taskDate = data.taskDate;
    
    if (data.linkToExistingTask && data.linkedTaskId) {
      const linkedTask = existingTasks.find((task: any) => task.taskId === data.linkedTaskId || task.id.toString() === data.linkedTaskId);
      if (linkedTask) {
        // Use the linked task's group if it exists, or create new group
        linkedTaskGroup = linkedTask.linkedTaskGroup || generateLinkedTaskGroupId();
        taskDate = linkedTask.taskDate; // Use same date as linked task
      }
    }
    
    const processedData = {
      taskId: `${selectedLocation}_${data.name.replace(/\s+/g, '_')}_${Date.now()}`,
      locationId: selectedLocation,
      name: data.name,
      taskType: data.taskType,
      taskDate: taskDate,
      startDate: taskDate,
      finishDate: taskDate,
      costCode: costCode,
      startTime: data.startTime,
      finishTime: data.finishTime,
      status: data.status,
      workDescription: data.workDescription || '',
      notes: data.notes || '',
      dependentOnPrevious: data.linkToExistingTask ? false : data.dependentOnPrevious, // Linked tasks not dependent
      linkedTaskGroup: linkedTaskGroup,
      superintendentId: null,
      foremanId: null,
      scheduledHours: "8", // Default 8 hours as string
      actualHours: data.status === 'complete' ? 8 : null,
      order: 0 // Will be reordered based on date
    };

    createTaskMutation.mutate(processedData);
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
            {/* Date */}
            <FormField
              control={form.control}
              name="taskDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Dependent on Previous */}
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
                        {existingTasks.map((task: any) => (
                          <SelectItem 
                            key={task.id || task.taskId} 
                            value={(task.taskId || task.id).toString()}
                          >
                            {task.name} ({task.taskDate})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Task Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter task name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Task Type */}
            <FormField
              control={form.control}
              name="taskType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task Type *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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

            {/* Start and Finish Time */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time *</FormLabel>
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
                    <FormLabel>Finish Time *</FormLabel>
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
