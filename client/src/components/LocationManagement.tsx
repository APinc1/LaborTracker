import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, MapPin, Calendar, CheckCircle, Circle, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertLocationSchema, insertLocationBudgetSchema } from "@shared/schema";

export default function LocationManagement() {
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [isCreateLocationOpen, setIsCreateLocationOpen] = useState(false);
  const [isCreateBudgetOpen, setIsCreateBudgetOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<number | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 30000,
  });

  const { data: locations = [], isLoading: locationsLoading } = useQuery({
    queryKey: ["/api/projects", selectedProject, "locations"],
    enabled: !!selectedProject,
    staleTime: 30000,
  });

  const { data: budgetItems = [] } = useQuery({
    queryKey: ["/api/projects", selectedProject, "budget"],
    enabled: !!selectedProject,
    staleTime: 30000,
  });

  const createLocationMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', `/api/projects/${selectedProject}/locations`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProject, "locations"] });
      toast({ title: "Success", description: "Location created successfully" });
      setIsCreateLocationOpen(false);
      locationForm.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create location", variant: "destructive" });
    },
  });

  const createLocationBudgetMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', `/api/locations/${selectedLocation}/budgets`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations", selectedLocation, "budgets"] });
      toast({ title: "Success", description: "Location budget created successfully" });
      setIsCreateBudgetOpen(false);
      budgetForm.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create location budget", variant: "destructive" });
    },
  });

  const locationForm = useForm({
    resolver: zodResolver(insertLocationSchema),
    defaultValues: {
      locationId: '',
      projectId: selectedProject ? parseInt(selectedProject) : 0,
      name: '',
      description: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      estimatedCost: '',
      actualCost: '',
      isComplete: false,
    },
  });

  const budgetForm = useForm({
    resolver: zodResolver(insertLocationBudgetSchema),
    defaultValues: {
      locationId: selectedLocation || 0,
      budgetLineItemId: '',
      allocatedAmount: '',
      notes: '',
    },
  });

  const onSubmitLocation = (data: any) => {
    const processedData = {
      ...data,
      projectId: parseInt(selectedProject),
      locationId: `${selectedProject}_${data.name.replace(/\s+/g, '')}`,
      estimatedCost: data.estimatedCost ? parseFloat(data.estimatedCost) : null,
      actualCost: data.actualCost ? parseFloat(data.actualCost) : null,
    };
    createLocationMutation.mutate(processedData);
  };

  const onSubmitBudget = (data: any) => {
    const processedData = {
      ...data,
      locationId: selectedLocation,
      budgetLineItemId: parseInt(data.budgetLineItemId),
      allocatedAmount: parseFloat(data.allocatedAmount),
    };
    createLocationBudgetMutation.mutate(processedData);
  };

  const getCompletionPercentage = (location: any) => {
    // Mock calculation - in real app, this would be based on tasks/budget completion
    return Math.floor(Math.random() * 100);
  };

  const getStatusColor = (isComplete: boolean) => {
    return isComplete ? "bg-green-500" : "bg-yellow-500";
  };

  if (projectsLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-strong">Location Management</h2>
            <p className="text-subtle mt-1">Manage project locations and progress</p>
          </div>
          <Dialog open={isCreateLocationOpen} onOpenChange={setIsCreateLocationOpen}>
            <DialogTrigger asChild>
              <Button 
                className="bg-primary hover:bg-primary/90"
                disabled={!selectedProject}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Location
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Location</DialogTitle>
              </DialogHeader>
              <Form {...locationForm}>
                <form onSubmit={locationForm.handleSubmit(onSubmitLocation)} className="space-y-4">
                  <FormField
                    control={locationForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location Name</FormLabel>
                        <FormControl>
                          <Input placeholder="North Section" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={locationForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input placeholder="Location description..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={locationForm.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={locationForm.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={locationForm.control}
                    name="estimatedCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estimated Cost</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="0.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setIsCreateLocationOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createLocationMutation.isPending}>
                      {createLocationMutation.isPending ? 'Creating...' : 'Create Location'}
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
          {/* Project Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Select Project</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="w-full md:w-1/3">
                  <SelectValue placeholder="Choose a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project: any) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name} ({project.projectId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {selectedProject && (
            <>
              {/* Location Summary */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-5 h-5 text-blue-600" />
                      <div>
                        <p className="text-sm text-subtle">Total Locations</p>
                        <p className="text-2xl font-bold text-blue-600">{locations.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="text-sm text-subtle">Completed</p>
                        <p className="text-2xl font-bold text-green-600">
                          {locations.filter((loc: any) => loc.isComplete).length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <Circle className="w-5 h-5 text-orange-600" />
                      <div>
                        <p className="text-sm text-subtle">In Progress</p>
                        <p className="text-2xl font-bold text-orange-600">
                          {locations.filter((loc: any) => !loc.isComplete).length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-5 h-5 text-purple-600" />
                      <div>
                        <p className="text-sm text-subtle">Avg. Duration</p>
                        <p className="text-2xl font-bold text-purple-600">21 days</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Locations Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {locationsLoading ? (
                  [...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-64" />
                  ))
                ) : locations.length === 0 ? (
                  <Card className="col-span-full">
                    <CardContent className="text-center py-8">
                      <p className="text-muted">No locations found for this project</p>
                      <Button className="mt-4">
                        <Plus className="w-4 h-4 mr-2" />
                        Add First Location
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  locations.map((location: any) => {
                    const completionPercentage = getCompletionPercentage(location);
                    return (
                      <Card key={location.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">{location.name}</CardTitle>
                            <div className="flex items-center space-x-2">
                              <div className={`w-3 h-3 ${getStatusColor(location.isComplete)} rounded-full`}></div>
                              {location.isComplete ? (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              ) : (
                                <Circle className="w-4 h-4 text-orange-600" />
                              )}
                            </div>
                          </div>
                          <Badge variant="outline" className="w-fit">
                            {location.locationId}
                          </Badge>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">Progress</span>
                                <span className="text-sm text-gray-600">
                                  {location.isComplete ? "100%" : `${completionPercentage}%`}
                                </span>
                              </div>
                              <Progress 
                                value={location.isComplete ? 100 : completionPercentage} 
                                className="h-2"
                              />
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2 text-sm text-gray-600">
                                <Calendar className="w-4 h-4" />
                                <span>
                                  Start: {location.startDate ? format(new Date(location.startDate), 'MMM d, yyyy') : 'Not set'}
                                </span>
                              </div>
                              {location.endDate && (
                                <div className="flex items-center space-x-2 text-sm text-gray-600">
                                  <Calendar className="w-4 h-4" />
                                  <span>
                                    End: {location.endDate ? format(new Date(location.endDate), 'MMM d, yyyy') : 'Not set'}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between">
                              <Badge variant={location.isComplete ? "default" : "secondary"}>
                                {location.isComplete ? "Complete" : "In Progress"}
                              </Badge>
                              <div className="flex items-center space-x-2">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => {
                                    setSelectedLocation(location.id);
                                    setIsCreateBudgetOpen(true);
                                  }}
                                >
                                  <DollarSign className="w-4 h-4 mr-1" />
                                  Budget
                                </Button>
                                <Button variant="ghost" size="sm">
                                  View Details
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </main>
      
      {/* Location Budget Modal */}
      <Dialog open={isCreateBudgetOpen} onOpenChange={setIsCreateBudgetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Location Budget</DialogTitle>
          </DialogHeader>
          <Form {...budgetForm}>
            <form onSubmit={budgetForm.handleSubmit(onSubmitBudget)} className="space-y-4">
              <FormField
                control={budgetForm.control}
                name="budgetLineItemId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget Line Item</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select budget line item" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {budgetItems.map((item: any) => (
                          <SelectItem key={item.id} value={item.id.toString()}>
                            {item.lineItemNumber} - {item.description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={budgetForm.control}
                name="allocatedAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Allocated Amount</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={budgetForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional notes..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateBudgetOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createLocationBudgetMutation.isPending}>
                  {createLocationBudgetMutation.isPending ? 'Creating...' : 'Create Budget'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
