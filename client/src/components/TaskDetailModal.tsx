import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Tag, 
  User, 
  Users, 
  Edit, 
  Save, 
  X,
  Plus,
  Trash2
} from "lucide-react";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTaskSchema } from "@shared/schema";
import AssignmentModal from "./AssignmentModal";

interface TaskDetailModalProps {
  taskId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function TaskDetailModal({ taskId, isOpen, onClose }: TaskDetailModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState<any>(null);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);

  const { data: task, isLoading: taskLoading } = useQuery({
    queryKey: ["/api/tasks", taskId],
    enabled: !!taskId,
    staleTime: 30000,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["/api/tasks", taskId, "assignments"],
    enabled: !!taskId,
    staleTime: 30000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["/api/employees"],
    staleTime: 30000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["/api/projects", task?.projectId || 0, "locations"],
    enabled: !!task?.projectId,
    staleTime: 30000,
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('PUT', `/api/tasks/${taskId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Success", description: "Task updated successfully" });
      setIsEditing(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update task", variant: "destructive" });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      await apiRequest('DELETE', `/api/assignments/${assignmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "assignments"] });
      toast({ title: "Success", description: "Assignment removed successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove assignment", variant: "destructive" });
    },
  });

  const form = useForm({
    resolver: zodResolver(insertTaskSchema.partial()),
    defaultValues: {
      name: '',
      taskType: '',
      taskDate: '',
      startDate: '',
      finishDate: '',
      costCode: '',
      scheduledHours: '',
      startTime: '',
      finishTime: '',
      workDescription: '',
      notes: '',
    },
  });

  const onSubmit = (data: any) => {
    const processedData = {
      ...data,
      scheduledHours: data.scheduledHours ? parseFloat(data.scheduledHours) : null,
    };
    updateTaskMutation.mutate(processedData);
  };

  const handleEdit = () => {
    if (task) {
      form.reset({
        name: task.name,
        taskType: task.taskType,
        taskDate: task.taskDate,
        startDate: task.startDate,
        finishDate: task.finishDate,
        costCode: task.costCode,
        scheduledHours: task.scheduledHours?.toString() || '',
        startTime: task.startTime || '',
        finishTime: task.finishTime || '',
        workDescription: task.workDescription || '',
        notes: task.notes || '',
      });
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    form.reset();
  };

  const getEmployee = (employeeId: number) => {
    return employees.find((emp: any) => emp.id === employeeId);
  };

  const getLocation = (locationId: number) => {
    return locations.find((loc: any) => loc.id === locationId);
  };

  const getTaskTypeColor = (taskType: string) => {
    switch (taskType) {
      case 'Form': return 'bg-blue-100 text-blue-800';
      case 'Pour': return 'bg-green-100 text-green-800';
      case 'Demo/Ex': return 'bg-orange-100 text-orange-800';
      case 'Asphalt': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTotalAssignedHours = () => {
    return assignments.reduce((sum: number, assignment: any) => 
      sum + (parseFloat(assignment.assignedHours) || 0), 0
    );
  };

  const getTotalActualHours = () => {
    return assignments.reduce((sum: number, assignment: any) => 
      sum + (parseFloat(assignment.actualHours) || 0), 0
    );
  };

  if (!isOpen || !taskId) return null;

  if (taskLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="space-y-4">
            <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-64 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!task) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Task Not Found</DialogTitle>
          </DialogHeader>
          <p className="text-gray-500">The requested task could not be found.</p>
          <Button onClick={onClose}>Close</Button>
        </DialogContent>
      </Dialog>
    );
  }

  const location = getLocation(task.locationId);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl">{task.name}</DialogTitle>
            <div className="flex items-center space-x-2">
              <Badge className={getTaskTypeColor(task.taskType)}>
                {task.taskType}
              </Badge>
              {!isEditing ? (
                <Button variant="outline" size="sm" onClick={handleEdit}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              ) : (
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={form.handleSubmit(onSubmit)} disabled={updateTaskMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Task Details */}
          <Card>
            <CardHeader>
              <CardTitle>Task Details</CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <Form {...form}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Task Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="taskType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Task Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select task type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Form">Form</SelectItem>
                              <SelectItem value="Pour">Pour</SelectItem>
                              <SelectItem value="Demo/Ex">Demo/Ex</SelectItem>
                              <SelectItem value="Asphalt">Asphalt</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="costCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cost Code</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="scheduledHours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Scheduled Hours</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="taskDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Task Date</FormLabel>
                          <FormControl>
                            <Input 
                              type="date" 
                              {...field} 
                              disabled={task?.status === 'complete' || !isEditing}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
                      name="workDescription"
                      render={({ field }) => (
                        <FormItem className="col-span-full">
                          <FormLabel>Work Description</FormLabel>
                          <FormControl>
                            <Textarea {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem className="col-span-full">
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </Form>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">Task Date</p>
                        <p className="font-medium">{format(new Date(task.taskDate), 'MMMM d, yyyy')}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">Time</p>
                        <p className="font-medium">{task.startTime || 'Not set'} - {task.finishTime || 'Not set'}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">Location</p>
                        <p className="font-medium">{location?.name || 'Unknown'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Tag className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">Cost Code</p>
                        <p className="font-medium">{task.costCode}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">Scheduled Hours</p>
                        <p className="font-medium">{task.scheduledHours || 0} hours</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <User className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">Foreman</p>
                        <p className="font-medium">{task.foremanId || 'Unassigned'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Work Description */}
          {task.workDescription && !isEditing && (
            <Card>
              <CardHeader>
                <CardTitle>Work Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 whitespace-pre-wrap">{task.workDescription}</p>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          {task.notes && !isEditing && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 whitespace-pre-wrap">{task.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Employee Assignments */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Employee Assignments</CardTitle>
                <div className="flex items-center space-x-4">
                  <div className="text-sm text-gray-500">
                    Total Assigned: {getTotalAssignedHours()}h
                  </div>
                  <div className="text-sm text-gray-500">
                    Total Actual: {getTotalActualHours()}h
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setAssignmentModalOpen(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Assignment
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Assigned Hours</TableHead>
                      <TableHead>Actual Hours</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                          No employees assigned to this task
                        </TableCell>
                      </TableRow>
                    ) : (
                      assignments.map((assignment: any) => {
                        const employee = getEmployee(assignment.employeeId);
                        const assignedHours = parseFloat(assignment.assignedHours) || 0;
                        const actualHours = parseFloat(assignment.actualHours) || 0;
                        
                        return (
                          <TableRow key={assignment.id}>
                            <TableCell>
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                                  <User className="text-gray-600 text-sm" />
                                </div>
                                <div>
                                  <p className="font-medium text-gray-800">{employee?.name || 'Unknown'}</p>
                                  <p className="text-sm text-gray-500">{employee?.teamMemberId || 'N/A'}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {employee?.employeeType || 'Unknown'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <Clock className="w-4 h-4 text-gray-500" />
                                <span className="font-medium">{assignedHours}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {actualHours > 0 ? (
                                <div className="flex items-center space-x-2">
                                  <Clock className="w-4 h-4 text-green-500" />
                                  <span className="font-medium">{actualHours}</span>
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={actualHours > 0 ? "default" : "secondary"}>
                                {actualHours > 0 ? "Completed" : "Pending"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setAssignmentToDelete(assignment);
                                  setDeleteConfirmOpen(true);
                                }}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>

      {/* Assignment Modal */}
      <AssignmentModal
        isOpen={assignmentModalOpen}
        onClose={() => setAssignmentModalOpen(false)}
        taskId={taskId || 0}
        taskDate={task?.taskDate || ''}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this assignment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (assignmentToDelete) {
                  deleteAssignmentMutation.mutate(assignmentToDelete.id);
                }
                setDeleteConfirmOpen(false);
                setAssignmentToDelete(null);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
