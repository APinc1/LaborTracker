import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, User, Clock, AlertTriangle, CheckCircle, Calendar, Filter, Save, X, ChevronLeft, ChevronRight } from "lucide-react";
import { format, parseISO, addDays, subDays } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  const [showEmptyHoursDialog, setShowEmptyHoursDialog] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState<{ id: number; actualHours: number }[]>([]);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [showCrewDropdown, setShowCrewDropdown] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [selectedCrews, setSelectedCrews] = useState<string[]>([]);
  const [crewSearchTerm, setCrewSearchTerm] = useState('');
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingDialogClose, setPendingDialogClose] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [assignmentToDelete, setAssignmentToDelete] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const crewDropdownRef = useRef<HTMLDivElement>(null);
  const actualHoursInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

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

  const { data: tasks = [], refetch: refetchTasks } = useQuery({
    queryKey: ["/api/tasks/date-range", selectedDate, selectedDate],
    staleTime: 0, // Don't cache task data so it updates immediately when date changes
  });

  // Force refetch tasks when selectedDate changes
  useEffect(() => {
    refetchTasks();
  }, [selectedDate, refetchTasks]);

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
      const response = await apiRequest(`/api/tasks/${data.taskId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments/date", selectedDate] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/date-range", selectedDate, selectedDate] });
      toast({ title: "Success", description: "Assignment created successfully" });
      setIsCreateDialogOpen(false);
      setHasUnsavedChanges(false);
      form.reset();
      setSelectedEmployeeIds([]);
      setSelectedCrews([]);
      setEmployeeSearchTerm('');
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create assignment", variant: "destructive" });
    },
  });

  const createMultipleAssignmentsMutation = useMutation({
    mutationFn: async (assignments: any[]) => {
      const promises = assignments.map(data => 
        apiRequest(`/api/tasks/${data.taskId}/assignments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments/date", selectedDate] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/date-range", selectedDate, selectedDate] });
      toast({ title: "Success", description: "Assignments created successfully" });
      setIsCreateDialogOpen(false);
      setHasUnsavedChanges(false);
      form.reset();
      setSelectedEmployeeIds([]);
      setSelectedCrews([]);
      setEmployeeSearchTerm('');
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create assignments", variant: "destructive" });
    },
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest(`/api/assignments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/date-range"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments/date", selectedDate] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/date-range"] });
      toast({ title: "Success", description: "Assignment updated successfully" });
      setEditingAssignment(null);
      setHasUnsavedChanges(false);
      form.reset();
      setSelectedEmployeeIds([]);
      setEmployeeSearchTerm('');
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update assignment", variant: "destructive" });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/assignments/${id}`, { method: 'DELETE' });
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
    resolver: zodResolver(insertEmployeeAssignmentSchema.omit({ assignmentId: true }).extend({
      taskId: z.union([z.string(), z.number()]).transform(val => Number(val)),
      employeeId: z.union([z.string(), z.number()]).transform(val => Number(val)),
      employeeIds: z.array(z.string()).optional(),
    })),
    defaultValues: {
      taskId: undefined,
      employeeId: undefined,
      employeeIds: [] as string[],
      assignmentDate: selectedDate,
      assignedHours: '8',
      actualHours: null,
    },
  });

  // Watch assignment date field for changes and refetch tasks accordingly
  const assignmentDate = form.watch('assignmentDate');

  // Fetch tasks for the assignment date (used by the task dropdown)
  const { data: assignmentTasks = [] } = useQuery({
    queryKey: ["/api/tasks/date-range", assignmentDate, assignmentDate],
    enabled: !!assignmentDate,
    staleTime: 0,
  });

  // Track unsaved changes - only after form is fully initialized
  useEffect(() => {
    let isInitialized = false;
    let initializationTimer: NodeJS.Timeout;
    
    const subscription = form.watch((values, { name }) => {
      // Ignore changes that happen during form initialization
      if (!isInitialized) {
        return;
      }
      
      // Don't flag programmatic assignment date updates as user changes
      if (name === 'assignmentDate') {
        return;
      }
      
      if (name && (isCreateDialogOpen || editingAssignment)) {
        setHasUnsavedChanges(true);
      }
    });

    // Only start tracking changes after dialog opens and a delay for initialization
    if (isCreateDialogOpen || editingAssignment) {
      initializationTimer = setTimeout(() => {
        isInitialized = true;
      }, 300); // Longer delay to ensure form is fully initialized
    }

    return () => {
      subscription.unsubscribe();
      if (initializationTimer) {
        clearTimeout(initializationTimer);
      }
    };
  }, [form.watch, isCreateDialogOpen, editingAssignment]);

  // Track changes to selected employees - only for create mode when user makes selections
  useEffect(() => {
    // Use a timer to ensure this isn't triggered immediately on dialog open
    let timer: NodeJS.Timeout;
    if (isCreateDialogOpen && selectedEmployeeIds.length > 0) {
      timer = setTimeout(() => {
        setHasUnsavedChanges(true);
      }, 500); // Only consider it a change after user has had time to interact
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [selectedEmployeeIds, isCreateDialogOpen]);

  // Update form assignment date when selectedDate changes and dialog opens
  useEffect(() => {
    if (isCreateDialogOpen && !editingAssignment) {
      // Use form.reset to avoid triggering change detection
      form.reset({
        ...form.getValues(),
        assignmentDate: selectedDate,
      });
    }
  }, [selectedDate, isCreateDialogOpen, editingAssignment, form]);

  // Handle clicks outside dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowEmployeeDropdown(false);
      }
      if (crewDropdownRef.current && !crewDropdownRef.current.contains(event.target as Node)) {
        setShowCrewDropdown(false);
      }
    }

    if (showEmployeeDropdown || showCrewDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showEmployeeDropdown, showCrewDropdown]);

  const handleDialogClose = () => {
    // If dropdown is open, close it first instead of the dialog
    if (showEmployeeDropdown) {
      setShowEmployeeDropdown(false);
      return;
    }
    
    if (hasUnsavedChanges) {
      setPendingDialogClose(true);
      setShowUnsavedChangesDialog(true);
    } else {
      // Close immediately if no changes
      setIsCreateDialogOpen(false);
      setEditingAssignment(null);
      setSelectedEmployeeIds([]);
      setSelectedCrews([]);
      setEmployeeSearchTerm('');
      setCrewSearchTerm('');
      setHasUnsavedChanges(false);
      form.reset();
    }
  };

  const confirmCloseDialog = () => {
    setIsCreateDialogOpen(false);
    setEditingAssignment(null);
    setSelectedEmployeeIds([]);
    setSelectedCrews([]);
    setEmployeeSearchTerm('');
    setCrewSearchTerm('');
    setHasUnsavedChanges(false);
    setPendingDialogClose(false);
    setShowUnsavedChangesDialog(false);
    form.reset();
  };

  const cancelCloseDialog = () => {
    setPendingDialogClose(false);
    setShowUnsavedChangesDialog(false);
  };

  const onSubmit = (data: any) => {
    if (editingAssignment) {
      // For editing, still handle single assignment
      const processedData = {
        ...data,
        taskId: parseInt(data.taskId),
        employeeId: parseInt(data.employeeId),
        assignedHours: parseFloat(data.assignedHours),
        actualHours: data.actualHours ? parseFloat(data.actualHours) : null,
      };
      updateAssignmentMutation.mutate({ id: editingAssignment.id, data: processedData });
    } else {
      // For creating, handle multiple employees
      if (selectedEmployeeIds.length === 0) {
        toast({ title: "Error", description: "Please select at least one employee", variant: "destructive" });
        return;
      }
      
      const assignments = selectedEmployeeIds.map(employeeId => ({
        ...data,
        taskId: parseInt(data.taskId),
        employeeId: parseInt(employeeId),
        assignedHours: parseFloat(data.assignedHours),
        actualHours: data.actualHours ? parseFloat(data.actualHours) : null,
      }));
      
      if (assignments.length === 1) {
        createAssignmentMutation.mutate(assignments[0]);
      } else {
        createMultipleAssignmentsMutation.mutate(assignments);
      }
    }
  };

  const handleEdit = (assignment: any) => {
    setEditingAssignment(assignment);
    setSelectedEmployeeIds([assignment.employeeId.toString()]);
    setHasUnsavedChanges(false); // Reset unsaved changes flag
    form.reset({
      taskId: assignment.taskId.toString(),
      employeeId: assignment.employeeId.toString(),
      assignmentDate: assignment.assignmentDate,
      assignedHours: assignment.assignedHours.toString(),
      actualHours: assignment.actualHours?.toString() || null,
    });
  };

  const handleDelete = (id: number) => {
    setAssignmentToDelete(id);
    setShowDeleteConfirmDialog(true);
  };

  const handleBulkSave = () => {
    // Check all assignments for empty hours - both touched and untouched
    const assignmentsNeedingHours = filteredAssignments.filter(assignment => {
      // If the assignment was touched (in editingActualHours), check that value
      if (editingActualHours.hasOwnProperty(assignment.id)) {
        const editedValue = editingActualHours[assignment.id];
        return !editedValue || editedValue.trim() === '';
      }
      // If assignment wasn't touched, check if it already has actual hours
      // If it doesn't have actual hours, it's effectively "empty" for bulk save
      const hasExistingHours = assignment.actualHours !== null && assignment.actualHours !== undefined;
      return !hasExistingHours;
    });
    
    // Prepare updates for assignments with actual hours entered  
    const validUpdates = Object.entries(editingActualHours)
      .filter(([_, hours]) => hours && hours.trim() !== '')
      .map(([id, hours]) => ({
        id: parseInt(id),
        actualHours: parseFloat(hours)
      }))
      .filter(update => !isNaN(update.actualHours));
    
    if (assignmentsNeedingHours.length > 0) {
      // Show confirmation dialog for empty hours
      setPendingUpdates(validUpdates);
      setShowEmptyHoursDialog(true);
    } else if (validUpdates.length > 0) {
      // No empty hours, proceed with updates
      bulkUpdateActualHoursMutation.mutate(validUpdates);
    } else {
      // No updates to make
      setBulkEditMode(false);
    }
  };

  const handleConfirmEmptyHours = (setToZero: boolean) => {
    let allUpdates = [...pendingUpdates];
    
    if (setToZero) {
      // Add updates for assignments that need hours set to 0
      const emptyHoursUpdates = filteredAssignments
        .filter(assignment => {
          // If the assignment was touched (in editingActualHours), check that value
          if (editingActualHours.hasOwnProperty(assignment.id)) {
            const editedValue = editingActualHours[assignment.id];
            return !editedValue || editedValue.trim() === '';
          }
          // If assignment wasn't touched, check if it already has actual hours
          return assignment.actualHours === null || assignment.actualHours === undefined;
        })
        .map(assignment => ({
          id: assignment.id,
          actualHours: 0
        }));
      
      allUpdates = [...pendingUpdates, ...emptyHoursUpdates];
    }
    
    if (allUpdates.length > 0) {
      bulkUpdateActualHoursMutation.mutate(allUpdates);
    } else {
      setBulkEditMode(false);
    }
    
    setShowEmptyHoursDialog(false);
    setPendingUpdates([]);
  };

  const updateActualHours = (assignmentId: number, hours: string) => {
    setEditingActualHours(prev => ({
      ...prev,
      [assignmentId]: hours
    }));
    setHasUnsavedChanges(true);
  };

  // Function to handle Enter key navigation between actual hours inputs
  const handleActualHoursKeyDown = (e: React.KeyboardEvent, currentAssignmentId: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      // Get all assignment IDs in order
      const assignmentIds = filteredAssignments.map((assignment: any) => assignment.id);
      const currentIndex = assignmentIds.indexOf(currentAssignmentId);
      
      if (currentIndex < assignmentIds.length - 1) {
        // Move to next input
        const nextAssignmentId = assignmentIds[currentIndex + 1];
        const nextInput = actualHoursInputRefs.current[nextAssignmentId];
        if (nextInput) {
          nextInput.focus();
          nextInput.select(); // Select all text for quick editing
        }
      } else {
        // If at the last input, blur to trigger any validation/save
        const currentInput = actualHoursInputRefs.current[currentAssignmentId];
        if (currentInput) {
          currentInput.blur();
        }
      }
    }
  };

  const getEmployee = (employeeId: number) => {
    return (employees as any[]).find((emp: any) => emp.id === employeeId);
  };

  const getCrew = (crewId: number | null) => {
    if (!crewId) return null;
    return (crews as any[]).find((crew: any) => crew.id === crewId);
  };

  const getTask = (taskId: number) => {
    return (tasks as any[]).find((task: any) => task.id === taskId);
  };

  const getProject = (task: any) => {
    if (!task?.locationId) return null;
    // Find location first, then get project from location
    const location = (locations as any[]).find((loc: any) => loc.locationId === task.locationId);
    if (!location?.projectId) return null;
    return (projects as any[]).find((project: any) => project.id === location.projectId);
  };

  const getLocation = (locationId: string) => {
    return (locations as any[]).find((location: any) => location.locationId === locationId);
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
    return (assignments as any[])
      .filter((assignment: any) => assignment.employeeId === employeeId)
      .reduce((sum: number, assignment: any) => sum + (parseFloat(assignment.assignedHours) || 0), 0);
  };

  // Calculate crew availability status for a specific date
  const getCrewAvailability = (crewId: number, forDate?: string) => {
    const targetDate = forDate || selectedDate;
    const crewMembers = (employees as any[]).filter((emp: any) => emp.crewId === crewId);
    if (crewMembers.length === 0) return { status: 'Available', remainingHours: 0, memberCount: 0 };

    const totalRemainingHours = crewMembers.reduce((total, member) => {
      // Get assignments for this specific date
      const dateAssignments = (assignments as any[]).filter((assignment: any) => 
        assignment.employeeId === member.id && assignment.assignmentDate === targetDate
      );

      const scheduledHours = dateAssignments.reduce((sum: number, assignment: any) => {
        return sum + (parseFloat(assignment.assignedHours) || 0);
      }, 0);

      return total + Math.max(0, 8 - scheduledHours);
    }, 0);

    const avgRemainingHours = totalRemainingHours / crewMembers.length;

    if (avgRemainingHours === 0) {
      return { status: 'Fully Booked', remainingHours: avgRemainingHours, memberCount: crewMembers.length };
    } else if (avgRemainingHours < 8) {
      return { status: 'Partially Booked', remainingHours: avgRemainingHours, memberCount: crewMembers.length };
    } else {
      return { status: 'Available', remainingHours: avgRemainingHours, memberCount: crewMembers.length };
    }
  };

  const filteredAssignments = (assignments as any[]).filter((assignment: any) => {
    const employee = getEmployee(assignment.employeeId);
    const crew = getCrew(employee?.crewId);
    
    if (filterCrew && filterCrew !== "all" && crew?.name !== filterCrew) return false;
    if (filterEmployeeType && filterEmployeeType !== "all" && employee?.employeeType !== filterEmployeeType) return false;
    
    return true;
  });

  const uniqueCrews = Array.from(new Set((crews as any[]).map((crew: any) => crew.name)));
  const uniqueEmployeeTypes = Array.from(new Set((employees as any[]).map((emp: any) => emp.employeeType)));

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
              handleDialogClose();
            }
          }}>
            <DialogTrigger asChild>
              <Button onClick={() => {
                setIsCreateDialogOpen(true);
                setSelectedEmployeeIds([]);
                setSelectedCrews([]);
                setEmployeeSearchTerm('');
                setHasUnsavedChanges(false);
                // Reset form to default values
                form.reset({
                  taskId: '',
                  employeeId: '',
                  assignmentDate: selectedDate,
                  assignedHours: '8',
                  actualHours: null,
                });
              }} className="bg-primary hover:bg-primary/90">
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
                        <FormLabel>Assignment Date *</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field} 
                            disabled={!!editingAssignment}
                            onChange={(e) => {
                              field.onChange(e);
                              // Clear task selection when date changes to force reselection
                              form.setValue('taskId', undefined);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  
                  <FormField
                    control={form.control}
                    name="taskId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Task *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select task" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(assignmentTasks as any[]).filter(task => task && task.id).map((task: any) => (
                              <SelectItem key={task.id} value={String(task.id)}>
                                {task.name} - {task.costCode}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {!editingAssignment && (
                    <div className="space-y-3">
                      <FormLabel className="text-lg font-medium flex items-center">
                        <User className="w-4 h-4 mr-2" />
                        Crews
                      </FormLabel>
                      <div className="relative">
                        {/* Selected crews display */}
                        {selectedCrews.length > 0 && (
                          <div className="mb-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-gray-600">{selectedCrews.length} crew(s) selected</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => {
                                  // Get all employees from selected crews
                                  const allCrewMemberIds = (employees as any[])
                                    .filter(emp => selectedCrews.some(crewId => emp.crewId === parseInt(crewId)))
                                    .map(emp => emp.id.toString());
                                  
                                  // Remove crew members from current selection
                                  const updatedEmployeeIds = selectedEmployeeIds.filter(
                                    empId => !allCrewMemberIds.includes(empId)
                                  );
                                  
                                  form.setValue('employeeIds', updatedEmployeeIds);
                                  setSelectedEmployeeIds(updatedEmployeeIds);
                                  setSelectedCrews([]);
                                }}
                              >
                                Clear All
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {selectedCrews.map((crewId) => {
                                const crew = (crews as any[]).find(c => c.id.toString() === crewId);
                                const formDate = form.getValues('assignmentDate') || selectedDate;
                                const availability = getCrewAvailability(crew?.id || 0, formDate);
                                return (
                                  <div key={crewId} className={`text-xs px-2 py-1 rounded-lg border ${
                                    availability.status === 'Available' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                                    availability.status === 'Partially Booked' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
                                    'bg-red-50 border-red-200 text-red-800'
                                  }`}>
                                    <div className="flex items-center gap-1">
                                      <span className="font-medium">{crew?.name}</span>
                                      <span className="text-xs opacity-75">({availability.memberCount})</span>
                                      <span className={`text-xs px-1 rounded-full ${
                                        availability.status === 'Available' ? 'bg-blue-100 text-blue-700' :
                                        availability.status === 'Partially Booked' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-red-100 text-red-700'
                                      }`}>
                                        {availability.status}
                                      </span>
                                      <button
                                        type="button"
                                        className="ml-1 hover:bg-gray-300 rounded-full w-4 h-4 flex items-center justify-center"
                                        onClick={() => {
                                          const newSelectedCrews = selectedCrews.filter(id => id !== crewId);
                                          setSelectedCrews(newSelectedCrews);
                                          
                                          // Remove this crew's members from selected employees
                                          const crewMemberIds = (employees as any[])
                                            .filter(emp => emp.crewId === parseInt(crewId))
                                            .map(emp => emp.id.toString());
                                          
                                          const updatedEmployeeIds = selectedEmployeeIds.filter(
                                            empId => !crewMemberIds.includes(empId)
                                          );
                                          
                                          form.setValue('employeeIds', updatedEmployeeIds);
                                          setSelectedEmployeeIds(updatedEmployeeIds);
                                        }}
                                      >
                                        ×
                                      </button>
                                    </div>
                                    <div className="text-xs opacity-75 mt-0.5">
                                      Avg {availability.remainingHours.toFixed(1)}h remaining
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        
                        <div className="relative" ref={crewDropdownRef}>
                          <Input
                            type="text"
                            placeholder="Search and select crews..."
                            value={crewSearchTerm}
                            onChange={(e) => setCrewSearchTerm(e.target.value)}
                            onFocus={() => setShowCrewDropdown(true)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const filteredCrews = (crews as any[]).filter((crew: any) => 
                                  crew.name.toLowerCase().includes(crewSearchTerm.toLowerCase())
                                );
                                if (filteredCrews.length > 0) {
                                  const firstCrew = filteredCrews[0];
                                  const crewId = firstCrew.id.toString();
                                  const isSelected = selectedCrews.includes(crewId);
                                  
                                  let newSelectedCrews;
                                  if (isSelected) {
                                    // Remove crew from selection
                                    newSelectedCrews = selectedCrews.filter(id => id !== crewId);
                                  } else {
                                    // Add crew to selection
                                    newSelectedCrews = [...selectedCrews, crewId];
                                  }
                                  
                                  setSelectedCrews(newSelectedCrews);
                                  
                                  if (isSelected) {
                                    // Removing crew - remove only this crew's members
                                    const crewMemberIds = (employees as any[])
                                      .filter(emp => emp.crewId === firstCrew.id)
                                      .map(emp => emp.id.toString());
                                    
                                    const updatedEmployeeIds = selectedEmployeeIds.filter(
                                      empId => !crewMemberIds.includes(empId)
                                    );
                                    
                                    form.setValue('employeeIds', updatedEmployeeIds);
                                    setSelectedEmployeeIds(updatedEmployeeIds);
                                  } else {
                                    // Adding crew - add all crew members to existing selections
                                    const crewMemberIds = (employees as any[])
                                      .filter(emp => emp.crewId === firstCrew.id)
                                      .map(emp => emp.id.toString());
                                    
                                    const updatedEmployeeIds = Array.from(new Set([...selectedEmployeeIds, ...crewMemberIds]));
                                    
                                    form.setValue('employeeIds', updatedEmployeeIds);
                                    setSelectedEmployeeIds(updatedEmployeeIds);
                                  }
                                  
                                  // Clear search term and close dropdown
                                  setCrewSearchTerm('');
                                  setShowCrewDropdown(false);
                                }
                              }
                            }}
                            className="w-full"
                          />
                          
                          {showCrewDropdown && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                              {(crews as any[]).filter((crew: any) => 
                                crew.name.toLowerCase().includes(crewSearchTerm.toLowerCase())
                              ).map((crew: any) => {
                                const formDate = form.getValues('assignmentDate') || selectedDate;
                                const availability = getCrewAvailability(crew.id, formDate);
                                const isSelected = selectedCrews.includes(crew.id.toString());
                                
                                const getCrewCardStyle = () => {
                                  let baseStyle = "px-3 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ";
                                  
                                  if (isSelected) {
                                    baseStyle += "ring-2 ring-blue-500 ";
                                  }

                                  if (availability.status === 'Fully Booked') {
                                    baseStyle += "bg-red-100 hover:bg-red-200 ";
                                  } else if (availability.status === 'Partially Booked') {
                                    baseStyle += "bg-yellow-50 hover:bg-yellow-100 ";
                                  } else {
                                    baseStyle += "bg-blue-50 hover:bg-blue-100 ";
                                  }

                                  return baseStyle;
                                };

                                const getAvailabilityBadge = () => {
                                  if (availability.status === 'Fully Booked') {
                                    return (
                                      <Badge className="bg-red-500 text-white text-xs">
                                        Fully Booked
                                      </Badge>
                                    );
                                  } else if (availability.status === 'Partially Booked') {
                                    return (
                                      <Badge className="bg-yellow-500 text-black text-xs">
                                        Partially Booked
                                      </Badge>
                                    );
                                  } else {
                                    return (
                                      <Badge className="bg-blue-500 text-white text-xs">
                                        Available
                                      </Badge>
                                    );
                                  }
                                };

                                return (
                                  <div
                                    key={crew.id}
                                    className={getCrewCardStyle()}
                                    onClick={() => {
                                      const crewId = crew.id.toString();
                                      let newSelectedCrews;
                                      
                                      if (isSelected) {
                                        // Remove crew from selection
                                        newSelectedCrews = selectedCrews.filter(id => id !== crewId);
                                      } else {
                                        // Add crew to selection
                                        newSelectedCrews = [...selectedCrews, crewId];
                                      }
                                      
                                      setSelectedCrews(newSelectedCrews);
                                      
                                      if (isSelected) {
                                        // Removing crew - remove only this crew's members
                                        const crewMemberIds = (employees as any[])
                                          .filter(emp => emp.crewId === crew.id)
                                          .map(emp => emp.id.toString());
                                        
                                        const updatedEmployeeIds = selectedEmployeeIds.filter(
                                          empId => !crewMemberIds.includes(empId)
                                        );
                                        
                                        form.setValue('employeeIds', updatedEmployeeIds);
                                        setSelectedEmployeeIds(updatedEmployeeIds);
                                      } else {
                                        // Adding crew - add all crew members to existing selections
                                        const crewMemberIds = (employees as any[])
                                          .filter(emp => emp.crewId === crew.id)
                                          .map(emp => emp.id.toString());
                                        
                                        const updatedEmployeeIds = Array.from(new Set([...selectedEmployeeIds, ...crewMemberIds]));
                                        
                                        form.setValue('employeeIds', updatedEmployeeIds);
                                        setSelectedEmployeeIds(updatedEmployeeIds);
                                      }
                                    }}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                          <span className="font-medium text-sm">{crew.name}</span>
                                          {getAvailabilityBadge()}
                                        </div>
                                        <div className="text-xs text-gray-600 mt-1">
                                          {availability.memberCount} members
                                        </div>
                                        <div className="text-xs text-gray-600">
                                          Avg {availability.remainingHours.toFixed(1)}h remaining
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <FormField
                    control={form.control}
                    name="employeeId"
                    render={({ field }) => {
                      // Calculate employee availability for the selected date
                      const calculateEmployeeAvailability = (employee: any) => {
                        // Find assignments for this employee on the selected date
                        const employeeAssignments = (assignments as any[]).filter((assignment: any) => {
                          const assignmentTask = (tasks as any[]).find((task: any) => task.id === assignment.taskId || task.taskId === assignment.taskId);
                          return assignment.employeeId === employee.id && 
                                 assignmentTask && 
                                 assignmentTask.taskDate === selectedDate;
                        });

                        const scheduledHours = employeeAssignments.reduce((total: number, assignment: any) => {
                          return total + (parseFloat(assignment.assignedHours) || 0);
                        }, 0);

                        const remainingHours = Math.max(0, 8 - scheduledHours);
                        let status: 'available' | 'partial' | 'full' = 'available';
                        
                        if (scheduledHours >= 8) {
                          status = 'full';
                        } else if (scheduledHours > 0) {
                          status = 'partial';
                        }

                        return {
                          ...employee,
                          scheduledHours,
                          remainingHours,
                          status
                        };
                      };

                      const employeesWithAvailability = (employees as any[]).map(calculateEmployeeAvailability);
                      
                      const filteredEmployees = employeesWithAvailability.filter((employee: any) =>
                        employee.name.toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
                        employee.teamMemberId.toLowerCase().includes(employeeSearchTerm.toLowerCase())
                      );
                      
                      const selectedEmployees = employeesWithAvailability.filter((emp: any) => 
                        selectedEmployeeIds.includes(emp.id.toString())
                      );

                      const getEmployeeCardStyle = (employee: any) => {
                        const isSelected = selectedEmployeeIds.includes(employee.id.toString());
                        let baseStyle = "px-3 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ";
                        
                        if (isSelected) {
                          baseStyle += "ring-2 ring-blue-500 ";
                        }

                        if (employee.status === 'full') {
                          baseStyle += "bg-red-100 hover:bg-red-200 ";
                        } else if (employee.status === 'partial') {
                          baseStyle += "bg-yellow-50 hover:bg-yellow-100 ";
                        } else {
                          baseStyle += "bg-blue-50 hover:bg-blue-100 ";
                        }

                        return baseStyle;
                      };

                      const getAvailabilityBadge = (employee: any) => {
                        if (employee.status === 'full') {
                          return (
                            <Badge className="bg-red-500 text-white text-xs">
                              {employee.scheduledHours}h Booked
                            </Badge>
                          );
                        } else if (employee.status === 'partial') {
                          return (
                            <Badge className="bg-yellow-500 text-black text-xs">
                              {employee.remainingHours}h Left
                            </Badge>
                          );
                        } else {
                          return (
                            <Badge className="bg-green-500 text-white text-xs">
                              Available
                            </Badge>
                          );
                        }
                      };
                      
                      return (
                        <FormItem>
                          <FormLabel>Employees *</FormLabel>
                          <div className="relative">
                            {/* Selected employees display */}
                            {selectedEmployees.length > 0 && (
                              <div className="mb-2">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm text-gray-600">{selectedEmployees.length} employee(s) selected</span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => {
                                      setSelectedEmployeeIds([]);
                                      field.onChange('');
                                    }}
                                  >
                                    Clear All
                                  </Button>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {selectedEmployees.map((emp: any) => {
                                    // Get availability status colors
                                    const getSelectedEmployeeBadgeStyle = () => {
                                      if (emp.status === 'full') {
                                        return "bg-red-100 border-red-200 text-red-800 hover:bg-red-200";
                                      } else if (emp.status === 'partial') {
                                        return "bg-yellow-100 border-yellow-200 text-yellow-800 hover:bg-yellow-200";
                                      } else {
                                        return "bg-green-100 border-green-200 text-green-800 hover:bg-green-200";
                                      }
                                    };
                                    
                                    return (
                                      <div key={emp.id} className={`text-xs px-2 py-1 rounded-lg border ${getSelectedEmployeeBadgeStyle()}`}>
                                        <div className="flex items-center gap-1">
                                          <span className="font-medium">{emp.name}</span>
                                          <span className="text-xs opacity-75">
                                            ({emp.status === 'full' ? `${emp.scheduledHours}h` : emp.status === 'partial' ? `${emp.remainingHours}h left` : 'Available'})
                                          </span>
                                          <button
                                            type="button"
                                            className="ml-1 hover:bg-gray-300 rounded-full w-4 h-4 flex items-center justify-center transition-colors"
                                            onClick={() => {
                                              const newIds = selectedEmployeeIds.filter(id => id !== emp.id.toString());
                                              setSelectedEmployeeIds(newIds);
                                              field.onChange(newIds.length > 0 ? newIds[0] : '');
                                            }}
                                          >
                                            ×
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            
                            <div className="relative">
                              <Input
                                type="text"
                                placeholder="Search and select employees..."
                                value={employeeSearchTerm}
                                onChange={(e) => {
                                  setEmployeeSearchTerm(e.target.value);
                                  setShowEmployeeDropdown(true);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const currentFilteredEmployees = employeeSearchTerm 
                                      ? filteredEmployees 
                                      : employees as any[];
                                    
                                    if (currentFilteredEmployees.length > 0) {
                                      const topEmployee = currentFilteredEmployees[0];
                                      if (!selectedEmployeeIds.includes(topEmployee.id.toString())) {
                                        const newIds = [...selectedEmployeeIds, topEmployee.id.toString()];
                                        setSelectedEmployeeIds(newIds);
                                        field.onChange(topEmployee.id.toString());
                                      }
                                      setEmployeeSearchTerm('');
                                    }
                                  } else if (e.key === 'Escape') {
                                    setShowEmployeeDropdown(false);
                                  }
                                }}
                                onFocus={() => setShowEmployeeDropdown(true)}
                                disabled={!!editingAssignment}
                              />
                              {showEmployeeDropdown && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="absolute right-1 top-1 h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
                                  onClick={() => setShowEmployeeDropdown(false)}
                                >
                                  ×
                                </Button>
                              )}
                            </div>
                            {showEmployeeDropdown && (
                              <div ref={dropdownRef} className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                                {(employeeSearchTerm ? filteredEmployees : employeesWithAvailability).length > 0 ? (
                                  (employeeSearchTerm ? filteredEmployees : employeesWithAvailability).map((employee: any) => {
                                    const isSelected = selectedEmployeeIds.includes(employee.id.toString());
                                    return (
                                      <div
                                        key={employee.id}
                                        className={getEmployeeCardStyle(employee)}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          if (isSelected) {
                                            const newIds = selectedEmployeeIds.filter(id => id !== employee.id.toString());
                                            setSelectedEmployeeIds(newIds);
                                            field.onChange(newIds.length > 0 ? newIds[0] : '');
                                          } else {
                                            const newIds = [...selectedEmployeeIds, employee.id.toString()];
                                            setSelectedEmployeeIds(newIds);
                                            field.onChange(employee.id.toString());
                                          }
                                        }}
                                      >
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center space-x-2">
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() => {}} // handled by parent onClick
                                              className="rounded"
                                            />
                                            <div className="flex flex-col">
                                              <div className="flex items-center space-x-2">
                                                <span className={`font-medium text-sm ${
                                                  employee.status === 'full' ? 'line-through text-red-600' : ''
                                                }`}>
                                                  {employee.name}
                                                </span>
                                                {employee.employeeType === 'Foreman' && (
                                                  <Badge variant="default" className="text-xs bg-blue-600">
                                                    Foreman
                                                  </Badge>
                                                )}
                                              </div>
                                              <span className="text-xs text-gray-500">
                                                {employee.teamMemberId} • {employee.employeeType}
                                                {employee.primaryTrade && ` • ${employee.primaryTrade}`}
                                              </span>
                                            </div>
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            {getAvailabilityBadge(employee)}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="px-3 py-2 text-sm text-gray-500">
                                    No employees found
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                  <div className={`grid gap-4 ${editingAssignment ? 'grid-cols-2' : 'grid-cols-1'}`}>
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
                    {editingAssignment && (
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
                    )}
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={handleDialogClose}>
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
          
          {/* Unsaved Changes Confirmation Dialog */}
          <AlertDialog open={showUnsavedChangesDialog} onOpenChange={setShowUnsavedChangesDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
                <AlertDialogDescription>
                  You have unsaved changes. Are you sure you want to close this dialog? Your changes will be lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={cancelCloseDialog}>Keep Editing</AlertDialogCancel>
                <AlertDialogAction onClick={confirmCloseDialog} className="bg-red-600 hover:bg-red-700">
                  Discard Changes
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
                <div className="flex items-center space-x-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDate(format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'))}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <CardTitle>
                    Assignments for {format(parseISO(selectedDate), 'MMMM d, yyyy')}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'))}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
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
                      Add Actual Hours
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
                        if (assignment.actualHours && actualHours !== null) {
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
                                  ref={(el) => actualHoursInputRefs.current[assignment.id] = el}
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="24"
                                  placeholder={assignment.actualHours?.toString() || "0"}
                                  value={editingActualHours[assignment.id] || assignment.actualHours?.toString() || ''}
                                  onChange={(e) => updateActualHours(assignment.id, e.target.value)}
                                  onKeyDown={(e) => handleActualHoursKeyDown(e, assignment.id)}
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
                              {!bulkEditMode && (
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
                              )}
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
      {/* Delete assignment confirmation dialog */}
      <AlertDialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this assignment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDeleteConfirmDialog(false);
              setAssignmentToDelete(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (assignmentToDelete) {
                  deleteAssignmentMutation.mutate(assignmentToDelete);
                }
                setShowDeleteConfirmDialog(false);
                setAssignmentToDelete(null);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation dialog for empty actual hours */}
      <AlertDialog open={showEmptyHoursDialog} onOpenChange={setShowEmptyHoursDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty Hours Field</AlertDialogTitle>
            <AlertDialogDescription>
              Some assignments have empty actual hours fields. Would you like to set them to 0 hours (for employees who didn't work) or skip saving those assignments?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleConfirmEmptyHours(false)}>
              Skip Empty Fields
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleConfirmEmptyHours(true)}>
              Set to 0 Hours
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
