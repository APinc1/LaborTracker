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
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, Trash2, User, Users, Phone, Mail } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertEmployeeSchema, insertCrewSchema } from "@shared/schema";
import { z } from "zod";

// Custom validation schema for employee form with required fields
const employeeFormSchema = insertEmployeeSchema.extend({
  teamMemberId: z.string().min(1, "Team Member ID is required"),
  name: z.string().min(1, "Full name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(), // Phone is now optional
  employeeType: z.string().min(1, "Employee type is required"),
  crewId: z.string().min(1, "Crew selection is required"),
  primaryTrade: z.string().min(1, "Primary trade is required"),
  secondaryTrade: z.string().optional(), // Optional field
  tertiaryTrade: z.string().optional(), // Optional field
  isForeman: z.boolean().optional(),
  isUnion: z.boolean().optional(),
});

// Validation schema for creating user from employee
const createUserFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  role: z.string().min(1, "Role is required"),
});

export default function EmployeeManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateEmployeeOpen, setIsCreateEmployeeOpen] = useState(false);
  const [isCreateCrewOpen, setIsCreateCrewOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [editingCrew, setEditingCrew] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"employees" | "crews">("employees");
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [selectedEmployeeForUser, setSelectedEmployeeForUser] = useState<any>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<any>(null);

  const { data: employees = [], isLoading: employeesLoading } = useQuery({
    queryKey: ["/api/employees"],
    staleTime: 30000,
  });

  // Create dynamic validation schema that checks for unique team member IDs
  const createEmployeeFormSchema = (existingEmployees: any[], editingId?: number) => {
    return employeeFormSchema.extend({
      teamMemberId: z.string()
        .min(1, "Team Member ID is required")
        .refine((value) => {
          const existingIds = existingEmployees
            .filter(emp => editingId ? emp.id !== editingId : true)
            .map(emp => emp.teamMemberId);
          return !existingIds.includes(value);
        }, "Team Member ID must be unique"),
    });
  };

  const { data: crews = [], isLoading: crewsLoading } = useQuery({
    queryKey: ["/api/crews"],
    staleTime: 30000,
  });

  const createEmployeeMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('/api/employees', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details ? `Validation errors: ${JSON.stringify(errorData.details)}` : errorData.error || 'Failed to create employee');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: "Success", description: "Employee created successfully" });
      setIsCreateEmployeeOpen(false);
      setEditingEmployee(null);
      employeeForm.reset();
    },
    onError: (error: Error) => {
      console.error('Employee creation error:', error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest(`/api/employees/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details ? `Validation errors: ${JSON.stringify(errorData.details)}` : errorData.error || 'Failed to update employee');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: "Success", description: "Employee updated successfully" });
      setIsCreateEmployeeOpen(false);
      setEditingEmployee(null);
      employeeForm.reset();
    },
    onError: (error: Error) => {
      console.error('Employee update error:', error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest(`/api/employees/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete employee');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: "Success", description: "Employee deleted successfully" });
      setDeleteConfirmOpen(false);
      setEmployeeToDelete(null);
    },
    onError: (error: Error) => {
      console.error('Employee deletion error:', error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setDeleteConfirmOpen(false);
      setEmployeeToDelete(null);
    },
  });

  const createCrewMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/crews', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crews"] });
      toast({ title: "Success", description: "Crew created successfully" });
      setIsCreateCrewOpen(false);
      crewForm.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create crew", variant: "destructive" });
    },
  });

  const updateCrewMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest('PUT', `/api/crews/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crews"] });
      toast({ title: "Success", description: "Crew updated successfully" });
      setEditingCrew(null);
      crewForm.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update crew", variant: "destructive" });
    },
  });

  const deleteCrewMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/crews/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crews"] });
      toast({ title: "Success", description: "Crew deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete crew", variant: "destructive" });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async ({ employeeId, data }: { employeeId: number; data: any }) => {
      const response = await apiRequest('POST', `/api/employees/${employeeId}/create-user`, data);
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ 
        title: "Success", 
        description: `User account created for ${result.employee.name}. Default password: AccessPacific2835`
      });
      setIsCreateUserOpen(false);
      setSelectedEmployeeForUser(null);
      createUserForm.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to create user account", 
        variant: "destructive" 
      });
    },
  });

  const currentValidationSchema = createEmployeeFormSchema(employees, editingEmployee?.id);
  
  const employeeForm = useForm({
    resolver: zodResolver(currentValidationSchema),
    defaultValues: {
      teamMemberId: '',
      name: '',
      email: '',
      phone: '',
      crewId: '',
      employeeType: 'Core',
      apprenticeLevel: null,
      isForeman: false,
      isUnion: false,
      primaryTrade: '',
      secondaryTrade: '',
      tertiaryTrade: '',
    },
  });

  const crewForm = useForm({
    resolver: zodResolver(insertCrewSchema),
    defaultValues: {
      name: '',
    },
  });

  const createUserForm = useForm({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: {
      username: '',
      role: '',
    },
  });

  const onSubmitEmployee = (data: any) => {
    const processedData = {
      ...data,
      crewId: data.crewId ? parseInt(data.crewId) : null,
      apprenticeLevel: data.employeeType === "Apprentice" ? data.apprenticeLevel : null,
      isForeman: data.employeeType === "Core" ? data.isForeman : false,
      primaryTrade: data.primaryTrade || null,
      secondaryTrade: data.secondaryTrade === "none" || !data.secondaryTrade ? null : data.secondaryTrade,
      tertiaryTrade: data.tertiaryTrade === "none" || !data.tertiaryTrade ? null : data.tertiaryTrade,
    };
    
    if (editingEmployee) {
      updateEmployeeMutation.mutate({ id: editingEmployee.id, data: processedData });
    } else {
      createEmployeeMutation.mutate(processedData);
    }
  };

  const onSubmitCrew = (data: any) => {
    if (editingCrew) {
      updateCrewMutation.mutate({ id: editingCrew.id, data });
    } else {
      createCrewMutation.mutate(data);
    }
  };

  const onSubmitCreateUser = (data: any) => {
    if (selectedEmployeeForUser) {
      createUserMutation.mutate({ employeeId: selectedEmployeeForUser.id, data });
    }
  };

  const handleCreateUser = (employee: any) => {
    console.log('Creating user for employee:', employee);
    setSelectedEmployeeForUser(employee);
    setIsCreateUserOpen(true);
    
    // Generate username from first_last name format
    const nameParts = employee.name.toLowerCase().split(' ');
    const username = nameParts.length >= 2 ? `${nameParts[0]}_${nameParts[nameParts.length - 1]}` : nameParts[0];
    
    createUserForm.reset({
      username: username,
      role: employee.isForeman ? 'Foreman' : 'Employee',
    });
  };

  const handleEditEmployee = (employee: any) => {
    setEditingEmployee(employee);
    // Update validation schema for editing
    const editValidationSchema = createEmployeeFormSchema(employees, employee.id);
    
    employeeForm.reset({
      teamMemberId: employee.teamMemberId,
      name: employee.name,
      email: employee.email || '',
      phone: employee.phone || '',
      crewId: employee.crewId?.toString() || '',
      employeeType: employee.employeeType,
      apprenticeLevel: employee.apprenticeLevel,
      isForeman: employee.isForeman,
      isUnion: employee.isUnion,
      primaryTrade: employee.primaryTrade || '',
      secondaryTrade: employee.secondaryTrade || '',
      tertiaryTrade: employee.tertiaryTrade || '',
    });
    setIsCreateEmployeeOpen(true);
  };

  const handleEditCrew = (crew: any) => {
    setEditingCrew(crew);
    crewForm.reset({
      name: crew.name,
    });
  };

  const handleDeleteEmployee = (employee: any) => {
    setEmployeeToDelete(employee);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteEmployee = () => {
    if (employeeToDelete) {
      deleteEmployeeMutation.mutate(employeeToDelete.id);
    }
  };

  const handleCancelEmployeeDialog = () => {
    setIsCreateEmployeeOpen(false);
    setEditingEmployee(null);
    employeeForm.reset();
  };

  const handleAddEmployee = () => {
    setEditingEmployee(null);
    employeeForm.reset();
    setIsCreateEmployeeOpen(true);
  };

  const handleDeleteCrew = (id: number) => {
    if (confirm('Are you sure you want to delete this crew?')) {
      deleteCrewMutation.mutate(id);
    }
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

  const getCrewName = (crewId: number | null) => {
    if (!crewId) return "Unassigned";
    const crew = crews.find((c: any) => c.id === crewId);
    return crew?.name || "Unknown";
  };

  if (employeesLoading || crewsLoading) {
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
            <h2 className="text-2xl font-bold text-gray-800">Employee Management</h2>
            <p className="text-gray-600 mt-1">Manage employees and crews</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <Button
                variant={activeTab === "employees" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("employees")}
              >
                <User className="w-4 h-4 mr-2" />
                Employees
              </Button>
              <Button
                variant={activeTab === "crews" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("crews")}
              >
                <Users className="w-4 h-4 mr-2" />
                Crews
              </Button>
            </div>
            {activeTab === "employees" ? (
              <Dialog open={isCreateEmployeeOpen || !!editingEmployee} onOpenChange={(open) => {
                if (!open) {
                  setIsCreateEmployeeOpen(false);
                  setEditingEmployee(null);
                  employeeForm.reset();
                }
              }}>
                <DialogTrigger asChild>
                  <Button onClick={handleAddEmployee} className="bg-primary hover:bg-primary/90">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Employee
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editingEmployee ? 'Edit Employee' : 'Add New Employee'}
                    </DialogTitle>
                  </DialogHeader>
                  <Form {...employeeForm}>
                    <form onSubmit={employeeForm.handleSubmit(onSubmitEmployee)} className="space-y-4">
                      <FormField
                        control={employeeForm.control}
                        name="teamMemberId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Team Member ID *</FormLabel>
                            <FormControl>
                              <Input placeholder="EMP-001" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={employeeForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name *</FormLabel>
                            <FormControl>
                              <Input placeholder="John Smith" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={employeeForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email *</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="john@example.com" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={employeeForm.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Phone</FormLabel>
                              <FormControl>
                                <Input placeholder="(555) 123-4567" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={employeeForm.control}
                          name="employeeType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Employee Type *</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Core">Core</SelectItem>
                                  <SelectItem value="Freelancer">Freelancer</SelectItem>
                                  <SelectItem value="Apprentice">Apprentice</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {employeeForm.watch("employeeType") === "Apprentice" && (
                          <FormField
                            control={employeeForm.control}
                            name="apprenticeLevel"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Apprentice Level</FormLabel>
                                <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select level" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="1">Level 1</SelectItem>
                                    <SelectItem value="2">Level 2</SelectItem>
                                    <SelectItem value="3">Level 3</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                        <FormField
                          control={employeeForm.control}
                          name="crewId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Crew *</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select crew" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">No Crew</SelectItem>
                                  {crews.map((crew: any) => (
                                    <SelectItem key={crew.id} value={crew.id.toString()}>
                                      {crew.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={employeeForm.control}
                          name="primaryTrade"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Primary Trade *</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select trade" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Mason">Mason</SelectItem>
                                  <SelectItem value="Formsetter">Formsetter</SelectItem>
                                  <SelectItem value="Laborer">Laborer</SelectItem>
                                  <SelectItem value="Operator">Operator</SelectItem>
                                  <SelectItem value="Driver">Driver</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={employeeForm.control}
                          name="secondaryTrade"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Secondary Trade</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select trade (optional)" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  <SelectItem value="Mason">Mason</SelectItem>
                                  <SelectItem value="Formsetter">Formsetter</SelectItem>
                                  <SelectItem value="Laborer">Laborer</SelectItem>
                                  <SelectItem value="Operator">Operator</SelectItem>
                                  <SelectItem value="Driver">Driver</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={employeeForm.control}
                          name="tertiaryTrade"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tertiary Trade</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select trade (optional)" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  <SelectItem value="Mason">Mason</SelectItem>
                                  <SelectItem value="Formsetter">Formsetter</SelectItem>
                                  <SelectItem value="Laborer">Laborer</SelectItem>
                                  <SelectItem value="Operator">Operator</SelectItem>
                                  <SelectItem value="Driver">Driver</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={employeeForm.control}
                          name="isForeman"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                  disabled={employeeForm.watch("employeeType") !== "Core"}
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>Is Foreman</FormLabel>
                                {employeeForm.watch("employeeType") !== "Core" && (
                                  <p className="text-sm text-muted-foreground">Only Core employees can be foremen</p>
                                )}
                              </div>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={employeeForm.control}
                          name="isUnion"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                              <FormControl>
                                <Checkbox
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>Is Union</FormLabel>
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex justify-end space-x-2">
                        <Button type="button" variant="outline" onClick={handleCancelEmployeeDialog}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createEmployeeMutation.isPending || updateEmployeeMutation.isPending}>
                          {editingEmployee ? 'Update' : 'Create'}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            ) : (
              <Dialog open={isCreateCrewOpen || !!editingCrew} onOpenChange={(open) => {
                if (!open) {
                  setIsCreateCrewOpen(false);
                  setEditingCrew(null);
                  crewForm.reset();
                }
              }}>
                <DialogTrigger asChild>
                  <Button onClick={() => setIsCreateCrewOpen(true)} className="bg-primary hover:bg-primary/90">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Crew
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>
                      {editingCrew ? 'Edit Crew' : 'Add New Crew'}
                    </DialogTitle>
                  </DialogHeader>
                  <Form {...crewForm}>
                    <form onSubmit={crewForm.handleSubmit(onSubmitCrew)} className="space-y-4">
                      <FormField
                        control={crewForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Crew Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Concrete Crew A" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end space-x-2">
                        <Button type="button" variant="outline" onClick={() => {
                          setIsCreateCrewOpen(false);
                          setEditingCrew(null);
                          crewForm.reset();
                        }}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createCrewMutation.isPending || updateCrewMutation.isPending}>
                          {editingCrew ? 'Update' : 'Create'}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </header>
      {/* Create User Dialog */}
      <Dialog open={isCreateUserOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCreateUserOpen(false);
          setSelectedEmployeeForUser(null);
          createUserForm.reset();
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Create User Account
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Create a user account for {selectedEmployeeForUser?.name}. They will receive the default password and be prompted to change it on first login.
            </p>
          </DialogHeader>
          <Form {...createUserForm}>
            <form onSubmit={createUserForm.handleSubmit(onSubmitCreateUser)} className="space-y-4">
              <FormField
                control={createUserForm.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createUserForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Admin">Admin</SelectItem>
                        <SelectItem value="Superintendent">Superintendent</SelectItem>
                        <SelectItem value="Project Manager">Project Manager</SelectItem>
                        <SelectItem value="Foreman">Foreman</SelectItem>
                        <SelectItem value="Employee">Employee</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => {
                  setIsCreateUserOpen(false);
                  setSelectedEmployeeForUser(null);
                  createUserForm.reset();
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createUserMutation.isPending}>
                  Create User
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <main className="p-6">
        {activeTab === "employees" ? (
          <Card>
            <CardHeader>
              <CardTitle>Employees ({employees.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Trades</TableHead>
                      <TableHead>Crew</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                          No employees found. Add your first employee to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      employees.map((employee: any) => (
                        <TableRow key={employee.id}>
                          <TableCell>
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                                <User className="text-gray-600 text-sm" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">{employee.name}</p>
                                <p className="text-sm text-gray-500">{employee.teamMemberId}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Badge variant={getEmployeeTypeVariant(employee.employeeType)}>
                                {employee.employeeType}
                                {employee.apprenticeLevel && ` L${employee.apprenticeLevel}`}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {employee.primaryTrade && (
                                <div className="text-sm font-medium text-gray-700">{employee.primaryTrade}</div>
                              )}
                              {employee.secondaryTrade && (
                                <div className="text-xs text-gray-500">{employee.secondaryTrade}</div>
                              )}
                              {employee.tertiaryTrade && (
                                <div className="text-xs text-gray-500">{employee.tertiaryTrade}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-gray-600">{getCrewName(employee.crewId)}</span>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {employee.isForeman && (
                                <Badge variant="secondary" className="text-xs">Foreman</Badge>
                              )}
                              {employee.isUnion && (
                                <Badge variant="outline" className="text-xs">Union</Badge>
                              )}
                              {employee.userId && (
                                <Badge variant="default" className="text-xs bg-green-100 text-green-800">User Account</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {employee.email && (
                                <div className="flex items-center space-x-2 text-sm text-gray-600">
                                  <Mail className="w-4 h-4" />
                                  <span>{employee.email}</span>
                                </div>
                              )}
                              {employee.phone && (
                                <div className="flex items-center space-x-2 text-sm text-gray-600">
                                  <Phone className="w-4 h-4" />
                                  <span>{employee.phone}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditEmployee(employee)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  console.log('User button clicked for:', employee.name);
                                  handleCreateUser(employee);
                                }}
                                disabled={!!employee.userId}
                                title={employee.userId ? "User account already exists" : "Create user account"}
                                className="hover:bg-blue-50 hover:text-blue-600"
                              >
                                <User className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteEmployee(employee)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Crews ({crews.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {crews.length === 0 ? (
                  <Card className="col-span-full">
                    <CardContent className="text-center py-8">
                      <p className="text-muted">No crews found. Add your first crew to get started.</p>
                    </CardContent>
                  </Card>
                ) : (
                  crews.map((crew: any) => {
                    const crewMembers = employees.filter((emp: any) => emp.crewId === crew.id);
                    return (
                      <Card key={crew.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">{crew.name}</CardTitle>
                            <div className="flex space-x-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditCrew(crew)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteCrew(crew.id)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                              <Users className="w-4 h-4 text-subtle" />
                              <span className="text-sm text-subtle">
                                {crewMembers.length} members
                              </span>
                            </div>
                            <div className="space-y-2">
                              {crewMembers.slice(0, 3).map((member: any) => (
                                <div key={member.id} className="flex items-center space-x-2">
                                  <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                                    <User className="text-subtle text-xs" />
                                  </div>
                                  <span className="text-sm text-content">{member.name}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {member.employeeType}
                                  </Badge>
                                </div>
                              ))}
                              {crewMembers.length > 3 && (
                                <p className="text-sm text-muted">
                                  +{crewMembers.length - 3} more
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
      {/* Delete Employee Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {employeeToDelete?.name}? This action cannot be undone and will remove all associated data including task assignments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteEmployee}
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteEmployeeMutation.isPending}
            >
              {deleteEmployeeMutation.isPending ? "Deleting..." : "Delete Employee"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
