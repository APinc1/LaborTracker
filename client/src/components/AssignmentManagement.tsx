import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, User, Clock, AlertTriangle, CheckCircle, Calendar, Filter, Save, X } from "lucide-react";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertEmployeeAssignmentSchema } from "@shared/schema";

export default function AssignmentManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterCrew, setFilterCrew] = useState<string>("all");
  const [filterEmployeeType, setFilterEmployeeType] = useState<string>("all");
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [editingActualHours, setEditingActualHours] = useState<Record<number, string>>({});

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["/api/assignments/date", selectedDate],
    staleTime: 30000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["/api/employees"],
    staleTime: 30000,
  });

  const { data: crews = [] } = useQuery({
    queryKey: ["/api/crews"],
    staleTime: 30000,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["/api/tasks/date-range", selectedDate, selectedDate],
    staleTime: 30000,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 30000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["/api/locations"],
    staleTime: 30000,
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', `/api/tasks/${data.taskId}/assignments`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Success", description: "Assignment created successfully" });
      setIsCreateDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create assignment", variant: "destructive" });
    },
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest('PUT', `/api/assignments/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments/date", selectedDate] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/date-range"] });
      toast({ title: "Success", description: "Assignment updated successfully" });
      setEditingAssignment(null);
      form.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update assignment", variant: "destructive" });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/assignments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments/date", selectedDate] });
      toast({ title: "Success", description: "Assignment deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete assignment", variant: "destructive" });
    },
  });

  const bulkUpdateActualHoursMutation = useMutation({
    mutationFn: async (updates: { id: number; actualHours: number }[]) => {
      console.log('Bulk updating assignments:', updates);
      const results = await Promise.all(
        updates.map(async update => {
          console.log(`Updating assignment ${update.id} with actualHours:`, update.actualHours);
          try {
            console.log(`Making API request to PUT /api/assignments/${update.id} with data:`, { actualHours: update.actualHours.toString() });
            const response = await fetch(`/api/assignments/${update.id}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ actualHours: update.actualHours.toString() })
            });
            
            console.log(`Response status: ${response.status}, ok: ${response.ok}`);
            
            if (!response.ok) {
              const errorText = await response.text();
              console.error(`HTTP ${response.status}: ${errorText}`);
              throw new Error(`Failed to update assignment: ${response.status} ${errorText}`);
            }
            
            const result = await response.json();
            console.log(`Assignment ${update.id} updated successfully:`, result);
            return result;
          } catch (error: any) {
            console.error(`Error updating assignment ${update.id}:`, error);
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            throw error;
          }
        })
      );
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments/date", selectedDate] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/date-range"] });
      toast({ title: "Success", description: "Actual hours updated successfully" });
      setBulkEditMode(false);
      setEditingActualHours({});
    },
    onError: (error: any) => {
      console.error('Bulk update error:', error);
      toast({ title: "Error", description: `Failed to update actual hours: ${error.message || 'Unknown error'}`, variant: "destructive" });
    },
  });

  const form = useForm({
    resolver: zodResolver(insertEmployeeAssignmentSchema),
    defaultValues: {
      assignmentId: '',
      taskId: '',
      employeeId: '',
      assignmentDate: selectedDate,
      assignedHours: '8',
      actualHours: null,
    },
  });

  const onSubmit = (data: any) => {
    const processedData = {
      ...data,
      taskId: parseInt(data.taskId),
      employeeId: parseInt(data.employeeId),
      assignedHours: parseFloat(data.assignedHours),
      actualHours: data.actualHours ? parseFloat(data.actualHours) : null,
    };

    if (editingAssignment) {
      updateAssignmentMutation.mutate({ id: editingAssignment.id, data: processedData });
    } else {
      createAssignmentMutation.mutate(processedData);
    }
  };

  const handleEdit = (assignment: any) => {
    setEditingAssignment(assignment);
    form.reset({
      assignmentId: assignment.assignmentId,
      taskId: assignment.taskId.toString(),
      employeeId: assignment.employeeId.toString(),
      assignmentDate: assignment.assignmentDate,
      assignedHours: assignment.assignedHours.toString(),
      actualHours: assignment.actualHours?.toString() || null,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this assignment?')) {
      deleteAssignmentMutation.mutate(id);
    }
  };

  const handleBulkSave = () => {
    const updates = Object.entries(editingActualHours)
      .filter(([_, hours]) => hours.trim() !== '')
      .map(([id, hours]) => ({
        id: parseInt(id),
        actualHours: parseFloat(hours)
      }))
      .filter(update => !isNaN(update.actualHours));

    if (updates.length > 0) {
      bulkUpdateActualHoursMutation.mutate(updates);
    } else {
      setBulkEditMode(false);
    }
  };

  const updateActualHours = (assignmentId: number, hours: string) => {
    setEditingActualHours(prev => ({
      ...prev,
      [assignmentId]: hours
    }));
  };

  const getEmployee = (employeeId: number) => {
    return employees.find((emp: any) => emp.id === employeeId);
  };

  const getCrew = (crewId: number | null) => {
    if (!crewId) return null;
    return crews.find((crew: any) => crew.id === crewId);
  };

  const getTask = (taskId: number) => {
    return tasks.find((task: any) => task.id === taskId);
  };

  const getProject = (task: any) => {
    if (!task?.locationId) return null;
    // Find location first, then get project from location
    const location = locations.find((loc: any) => loc.locationId === task.locationId);
    if (!location?.projectId) return null;
    return projects.find((project: any) => project.id === location.projectId);
  };

  const getLocation = (locationId: string) => {
    return locations.find((location: any) => location.locationId === locationId);
  };

  const getEmployeeStatus = (hours: number) => {
    if (hours > 8) return { 
      color: "bg-red-500", 
      text: "Overbooked", 
      textColor: "text-red-600",
      rowBg: "bg-red-50"
    };
    if (hours < 8) return { 
      color: "bg-yellow-500", 
      text: "Underbooked", 
      textColor: "text-yellow-600",
      rowBg: "bg-yellow-50"
    };
    return { 
      color: "bg-green-500", 
      text: "Optimal", 
      textColor: "text-green-600",
      rowBg: ""
    };
  };

  const getEmployeeTypeVariant = (type: string) => {
    switch (type) {
      case "Core": return "default";
      case "Foreman": return "secondary";
      case "Driver": return "outline";
      case "Apprentice": return "outline";
      default: return "default";
    }
  };

  const getEmployeeHours = (employeeId: number) => {
    return assignments
      .filter((assignment: any) => assignment.employeeId === employeeId)
      .reduce((sum: number, assignment: any) => sum + (parseFloat(assignment.assignedHours) || 0), 0);
  };

  const filteredAssignments = assignments.filter((assignment: any) => {
    const employee = getEmployee(assignment.employeeId);
    const crew = getCrew(employee?.crewId);
    
    if (filterCrew && filterCrew !== "all" && crew?.name !== filterCrew) return false;
    if (filterEmployeeType && filterEmployeeType !== "all" && employee?.employeeType !== filterEmployeeType) return false;
    
    return true;
  });

  const uniqueCrews = [...new Set(crews.map((crew: any) => crew.name))];
  const uniqueEmployeeTypes = [...new Set(employees.map((emp: any) => emp.employeeType))];

  if (assignmentsLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Assignment Management</h2>
            <p className="text-gray-600 mt-1">Manage employee task assignments and track conflicts</p>
          </div>
          <Dialog open={isCreateDialogOpen || !!editingAssignment} onOpenChange={(open) => {
            if (!open) {
              setIsCreateDialogOpen(false);
              setEditingAssignment(null);
              form.reset();
            }
          }}>
            <DialogTrigger asChild>
              <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-primary hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" />
                Add Assignment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingAssignment ? 'Edit Assignment' : 'Create New Assignment'}
                </DialogTitle>
                {editingAssignment && (
                  <div className="mt-2 pb-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-800">
                      {employees.find((emp: any) => emp.id.toString() === form.getValues('employeeId'))?.name || 'Unknown Employee'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {employees.find((emp: any) => emp.id.toString() === form.getValues('employeeId'))?.teamMemberId || 'N/A'}
                    </p>
                  </div>
                )}
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  
                  {/* Assignment Date */}
                  <FormField
                    control={form.control}
                    name="assignmentDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assignment Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} disabled={!!editingAssignment} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Assignment ID - only show for create mode */}
                  {!editingAssignment && (
                    <FormField
                      control={form.control}
                      name="assignmentId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assignment ID</FormLabel>
                          <FormControl>
                            <Input placeholder="AUTO-GENERATED" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  
                  <FormField
                    control={form.control}
                    name="taskId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Task</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select task" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {tasks
                              .filter((task: any) => {
                                if (!editingAssignment) return true;
                                // Filter tasks to only show tasks for the assignment date
                                const assignmentDate = form.getValues('assignmentDate');
                                return task.startDate <= assignmentDate && task.finishDate >= assignmentDate;
                              })
                              .map((task: any) => (
                                <SelectItem key={task.id} value={task.id.toString()}>
                                  {task.name} - {task.costCode}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Employee - only show for create mode (edit mode shows at top) */}
                  {!editingAssignment && (
                    <FormField
                      control={form.control}
                      name="employeeId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Employee</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select employee" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {employees.map((employee: any) => (
                                <SelectItem key={employee.id} value={employee.id.toString()}>
                                  {employee.name} ({employee.employeeType})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="assignedHours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assigned Hours</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.5" min="0" max="24" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="actualHours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Actual Hours</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.5" min="0" max="24" {...field} value={field.value || ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => {
                      setIsCreateDialogOpen(false);
                      setEditingAssignment(null);
                      form.reset();
                    }}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createAssignmentMutation.isPending || updateAssignmentMutation.isPending}>
                      {editingAssignment ? 'Update' : 'Create'}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="p-6">
        <div className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-48"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="crew">Crew</Label>
                  <Select value={filterCrew} onValueChange={setFilterCrew}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="All crews" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All crews</SelectItem>
                      {uniqueCrews.map((crewName) => (
                        <SelectItem key={crewName} value={crewName}>
                          {crewName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employeeType">Employee Type</Label>
                  <Select value={filterEmployeeType} onValueChange={setFilterEmployeeType}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {uniqueEmployeeTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setFilterCrew("all");
                    setFilterEmployeeType("all");
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Status Legend */}
          <div className="flex items-center space-x-6 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="text-gray-600">8+ Hours (Overbooked)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span className="text-gray-600">Underbooked (&lt;8 Hours)</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-gray-600">8 Hours (Optimal)</span>
            </div>
          </div>

          {/* Assignments Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  Assignments for {format(new Date(selectedDate), 'MMMM d, yyyy')} ({filteredAssignments.length})
                </CardTitle>
                <div className="flex items-center gap-2">
                  {bulkEditMode ? (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setBulkEditMode(false);
                          setEditingActualHours({});
                        }}
                      >
                        Cancel
                      </Button>
                      <Button 
                        size="sm"
                        onClick={handleBulkSave}
                        disabled={bulkUpdateActualHoursMutation.isPending}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Save className="w-4 h-4 mr-1" />
                        {bulkUpdateActualHoursMutation.isPending ? 'Saving...' : 'Save All'}
                      </Button>
                    </>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setBulkEditMode(true)}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit Hours
                    </Button>
                  )}
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
                      <TableHead>Crew</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Task</TableHead>
                      <TableHead>Assigned Hours</TableHead>
                      <TableHead>Daily Total Assigned</TableHead>
                      <TableHead>Schedule Status</TableHead>
                      <TableHead>Actual Hours</TableHead>
                      <TableHead>Under/Over</TableHead>
                      <TableHead>Actual Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssignments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="text-center py-8 text-gray-500">
                          No assignments found for the selected date and filters
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAssignments.map((assignment: any) => {
                        const employee = getEmployee(assignment.employeeId);
                        const crew = getCrew(employee?.crewId);
                        const task = getTask(assignment.taskId);
                        const totalHours = getEmployeeHours(assignment.employeeId);
                        const status = getEmployeeStatus(totalHours);
                        
                        // Calculate actual status and under/over values
                        const actualHours = assignment.actualHours ? parseFloat(assignment.actualHours) : null;
                        const assignedHours = parseFloat(assignment.assignedHours);
                        const underOver = actualHours !== null ? actualHours - assignedHours : null;
                        
                        let actualStatus = "";
                        if (actualHours !== null) {
                          if (actualHours === assignedHours) {
                            actualStatus = "On schedule";
                          } else if (actualHours > assignedHours) {
                            actualStatus = "Over schedule";
                          } else {
                            actualStatus = "Under schedule";
                          }
                        }

                        // Determine row background based on actual hours if they exist
                        let rowBgClass = status.rowBg;
                        if (assignment.actualHours) {
                          if (actualHours <= assignedHours) {
                            rowBgClass = "bg-green-50";
                          } else {
                            rowBgClass = "bg-red-50";
                          }
                        }
                        
                        return (
                          <TableRow key={assignment.id} className={`hover:bg-gray-50 ${rowBgClass}`}>
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
                              <Badge variant={getEmployeeTypeVariant(employee?.employeeType || '')}>
                                {employee?.employeeType || 'Unknown'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-gray-600">{crew?.name || 'Unassigned'}</span>
                            </TableCell>
                            <TableCell>
                              <p className="font-medium text-gray-800">{getProject(task)?.name || 'Unknown Project'}</p>
                            </TableCell>
                            <TableCell>
                              <p className="font-medium text-gray-800">{getLocation(task?.locationId)?.name || 'Unknown Location'}</p>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-gray-800">{task?.name || 'Unknown Task'}</p>
                                <p className="text-sm text-gray-500">{task?.costCode || 'N/A'}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <Clock className="w-4 h-4 text-gray-500" />
                                <span className="font-medium">{assignment.assignedHours}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className={`font-medium ${status.textColor}`}>
                                {totalHours.toFixed(1)}h
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <div className={`w-3 h-3 ${status.color} rounded-full`}></div>
                                <span className={`text-sm ${status.textColor} font-medium`}>
                                  {status.text}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {bulkEditMode ? (
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="24"
                                  placeholder={assignment.actualHours?.toString() || "0"}
                                  value={editingActualHours[assignment.id] || assignment.actualHours?.toString() || ''}
                                  onChange={(e) => updateActualHours(assignment.id, e.target.value)}
                                  className="w-20 h-8"
                                />
                              ) : assignment.actualHours ? (
                                <div className="flex items-center space-x-2">
                                  {parseFloat(assignment.actualHours) <= parseFloat(assignment.assignedHours) ? (
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <X className="w-4 h-4 text-red-500" />
                                  )}
                                  <span className="font-medium">{assignment.actualHours}</span>
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {underOver !== null ? (
                                <span className={`font-medium ${underOver > 0 ? 'text-red-600' : underOver < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                  {underOver > 0 ? '+' : ''}{underOver.toFixed(1)}h
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {actualStatus ? (
                                <div className="flex items-center space-x-2">
                                  {actualStatus === "On schedule" && <CheckCircle className="w-4 h-4 text-green-500" />}
                                  {actualStatus === "Over schedule" && <X className="w-4 h-4 text-red-500" />}
                                  {actualStatus === "Under schedule" && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
                                  <span className={`text-sm font-medium ${
                                    actualStatus === "On schedule" ? 'text-green-600' :
                                    actualStatus === "Over schedule" ? 'text-red-600' :
                                    'text-yellow-600'
                                  }`}>
                                    {actualStatus}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex space-x-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEdit(assignment)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(assignment.id)}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
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
      </main>
    </div>
  );
}
