import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Calendar, User, DollarSign, Home, Building2, Plus, Edit, Trash2, Clock } from "lucide-react";
import { format } from "date-fns";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface ProjectDetailsProps {
  projectId: string;
}

export default function ProjectDetails({ projectId }: ProjectDetailsProps) {
  const [location, setLocation] = useLocation();
  const [showAddLocationDialog, setShowAddLocationDialog] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationDescription, setNewLocationDescription] = useState("");
  const [newLocationStartDate, setNewLocationStartDate] = useState("");
  const [newLocationEndDate, setNewLocationEndDate] = useState("");
  const [editingLocation, setEditingLocation] = useState<any>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<any>(null);
  const { toast } = useToast();
  
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["/api/projects", projectId],
    staleTime: 30000,
  });

  const { data: locations = [], isLoading: locationsLoading } = useQuery({
    queryKey: ["/api/projects", projectId, "locations"],
    staleTime: 30000,
  });

  // Fetch assignments for hours calculation
  const { data: assignments = [] } = useQuery({
    queryKey: ["/api/assignments"],
    staleTime: 30000,
  });

  // Fetch budget data for all locations
  const locationBudgetQueries = useQuery({
    queryKey: ["/api/projects", projectId, "all-location-budgets", locations.map(l => l.locationId).join(',')],
    queryFn: async () => {
      console.log('🔍 Fetching budget data for locations:', locations.map(l => l.locationId));
      if (!locations.length) return {};
      
      const budgetPromises = locations.map(async (location: any) => {
        try {
          console.log(`📊 Fetching budget for location: ${location.locationId}`);
          const response = await fetch(`/api/locations/${location.locationId}/budget`);
          if (!response.ok) return { locationId: location.locationId, budget: [] };
          const budget = await response.json();
          console.log(`✅ Budget loaded for ${location.locationId}:`, budget.length, 'items');
          return { locationId: location.locationId, budget };
        } catch (error) {
          console.error(`Failed to fetch budget for location ${location.locationId}:`, error);
          return { locationId: location.locationId, budget: [] };
        }
      });
      
      const results = await Promise.all(budgetPromises);
      const budgetData = results.reduce((acc: any, result) => {
        acc[result.locationId] = result.budget;
        return acc;
      }, {});
      
      console.log('📋 All budget data loaded:', budgetData);
      return budgetData;
    },
    enabled: locations.length > 0,
    staleTime: 30000,
  });

  // Fetch tasks for all locations to calculate accurate date ranges
  const locationTaskQueries = useQuery({
    queryKey: ["/api/projects", projectId, "all-location-tasks"],
    queryFn: async () => {
      if (!locations.length) return {};
      
      const taskPromises = locations.map(async (location: any) => {
        try {
          const response = await fetch(`/api/locations/${location.locationId}/tasks`);
          if (!response.ok) return { locationId: location.locationId, tasks: [] };
          const tasks = await response.json();
          return { locationId: location.locationId, tasks };
        } catch (error) {
          console.error(`Failed to fetch tasks for location ${location.locationId}:`, error);
          return { locationId: location.locationId, tasks: [] };
        }
      });
      
      const results = await Promise.all(taskPromises);
      return results.reduce((acc: any, result) => {
        acc[result.locationId] = result.tasks;
        return acc;
      }, {});
    },
    enabled: locations.length > 0,
    staleTime: 30000,
  });

  // Helper function to calculate location duration from tasks (matching LocationDetails logic)
  const getLocationDuration = (locationId: string) => {
    const tasks = locationTaskQueries.data?.[locationId] || [];
    
    if (!tasks || tasks.length === 0) {
      // Fallback to stored location dates if no tasks
      const location = locations.find((loc: any) => loc.locationId === locationId);
      return {
        startDate: location?.startDate ? format(new Date(location.startDate + 'T00:00:00'), 'MMM d, yyyy') : 'No tasks scheduled',
        endDate: location?.endDate ? format(new Date(location.endDate + 'T00:00:00'), 'MMM d, yyyy') : 'No tasks scheduled'
      };
    }

    // Get all task dates and find earliest and latest (same logic as LocationDetails)
    const taskDates = tasks.map((task: any) => new Date(task.taskDate + 'T00:00:00').getTime());
    const earliestTaskDate = new Date(Math.min(...taskDates));
    const latestTaskDate = new Date(Math.max(...taskDates));

    return {
      startDate: format(earliestTaskDate, 'MMM d, yyyy'),
      endDate: format(latestTaskDate, 'MMM d, yyyy')
    };
  };

  // Calculate cost code breakdown for a location
  const getLocationCostCodeBreakdown = (locationId: string) => {
    const budget = locationBudgetQueries.data?.[locationId] || [];
    const tasks = locationTaskQueries.data?.[locationId] || [];
    
    // Group budget hours by cost code
    const costCodeBudget: { [costCode: string]: number } = {};
    budget.forEach((item: any) => {
      // Only include parent items (line numbers without dots) to avoid double counting
      const isParent = item.lineItemNumber && !item.lineItemNumber.includes('.');
      const isStandalone = !item.lineItemNumber || item.lineItemNumber === '';
      
      if (isParent || isStandalone) {
        const costCode = item.costCode || 'Other';
        const hours = parseFloat(item.hours) || 0;
        costCodeBudget[costCode] = (costCodeBudget[costCode] || 0) + hours;
      }
    });
    
    // Group actual hours by cost code from assignments
    const locationTaskIds = tasks.map((task: any) => task.id);
    const locationAssignments = assignments.filter((assignment: any) => 
      locationTaskIds.includes(assignment.taskId)
    );
    
    const costCodeActual: { [costCode: string]: number } = {};
    locationAssignments.forEach((assignment: any) => {
      const task = tasks.find((t: any) => t.id === assignment.taskId);
      if (task) {
        const costCode = task.costCode || 'Other';
        const actualHours = parseFloat(assignment.actualHours) || 0;
        costCodeActual[costCode] = (costCodeActual[costCode] || 0) + actualHours;
      }
    });
    
    // Combine all cost codes
    const allCostCodes = new Set([...Object.keys(costCodeBudget), ...Object.keys(costCodeActual)]);
    
    const costCodeBreakdown = Array.from(allCostCodes).map(costCode => {
      const budgetHours = costCodeBudget[costCode] || 0;
      const actualHours = costCodeActual[costCode] || 0;
      const remainingHours = Math.max(0, budgetHours - actualHours);
      const overageHours = Math.max(0, actualHours - budgetHours);
      const progressPercentage = budgetHours > 0 ? Math.min(100, (actualHours / budgetHours) * 100) : 0;
      
      // Color coding based on remaining hours percentage
      let progressColor = 'bg-green-500'; // Default green
      if (budgetHours > 0) {
        const remainingPercentage = (remainingHours / budgetHours) * 100;
        if (remainingPercentage <= 0) {
          progressColor = 'bg-red-500'; // Red if over budget
        } else if (remainingPercentage <= 15) {
          progressColor = 'bg-yellow-500'; // Yellow if 15% or less remaining
        }
      }
      
      return {
        costCode,
        budgetHours,
        actualHours,
        remainingHours,
        overageHours,
        progressPercentage,
        progressColor
      };
    }).filter(item => item.budgetHours > 0 || item.actualHours > 0) // Only show cost codes with data
     .sort((a, b) => b.budgetHours - a.budgetHours); // Sort by budget hours descending
    
    return costCodeBreakdown;
  };

  // Add location mutation
  const addLocationMutation = useMutation({
    mutationFn: (locationData: any) => 
      apiRequest(`/api/projects/${projectId}/locations`, {
        method: "POST",
        body: JSON.stringify(locationData),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "locations"] });
      setShowAddLocationDialog(false);
      setNewLocationName("");
      setNewLocationDescription("");
      setNewLocationStartDate("");
      setNewLocationEndDate("");
      toast({
        title: "Location added",
        description: "New location has been created successfully",
      });
    },
    onError: (error: any) => {
      console.error('Location creation error:', error?.message || error);
      
      const errorMessage = error?.message || "Failed to add location";
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleAddLocation = () => {
    if (!newLocationName.trim()) {
      toast({
        title: "Validation Error",
        description: "Location name is required",
        variant: "destructive",
      });
      return;
    }

    const locationData: any = {
      name: newLocationName.trim(),
      description: newLocationDescription.trim(),
      projectId: parseInt(projectId),
    };

    // Add start and end dates if provided
    if (newLocationStartDate) {
      locationData.startDate = newLocationStartDate;
    }
    if (newLocationEndDate) {
      locationData.endDate = newLocationEndDate;
    }

    addLocationMutation.mutate(locationData);
  };

  // Edit location mutation
  const editLocationMutation = useMutation({
    mutationFn: ({ locationId, data }: { locationId: string; data: any }) =>
      apiRequest(`/api/locations/${locationId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "locations"] });
      setEditingLocation(null);
      setNewLocationName("");
      setNewLocationDescription("");
      setNewLocationStartDate("");
      setNewLocationEndDate("");
      toast({
        title: "Location updated",
        description: "Location has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update location",
        variant: "destructive",
      });
    },
  });

  // Delete location mutation
  const deleteLocationMutation = useMutation({
    mutationFn: (locationId: string) =>
      apiRequest(`/api/locations/${locationId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "locations"] });
      setDeleteConfirmOpen(false);
      setLocationToDelete(null);
      toast({
        title: "Location deleted",
        description: "Location has been deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete location",
        variant: "destructive",
      });
    },
  });

  const handleEditLocation = (location: any) => {
    setEditingLocation(location);
    setNewLocationName(location.name);
    setNewLocationDescription(location.description || "");
    setNewLocationStartDate(location.startDate || "");
    setNewLocationEndDate(location.endDate || "");
    setShowAddLocationDialog(true);
  };

  const handleDeleteLocation = (location: any) => {
    setLocationToDelete(location);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteLocation = () => {
    if (locationToDelete) {
      deleteLocationMutation.mutate(locationToDelete.locationId);
    }
  };

  const handleSubmitLocation = () => {
    if (!newLocationName.trim()) {
      toast({
        title: "Validation Error",
        description: "Location name is required",
        variant: "destructive",
      });
      return;
    }

    const locationData: any = {
      name: newLocationName.trim(),
      description: newLocationDescription.trim(),
      projectId: parseInt(projectId),
    };

    // Add start and end dates if provided
    if (newLocationStartDate) {
      locationData.startDate = newLocationStartDate;
    }
    if (newLocationEndDate) {
      locationData.endDate = newLocationEndDate;
    }

    if (editingLocation) {
      editLocationMutation.mutate({
        locationId: editingLocation.locationId,
        data: locationData,
      });
    } else {
      addLocationMutation.mutate(locationData);
    }
  };

  if (projectLoading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <Skeleton className="h-8 w-64" />
        </header>
        <main className="p-6">
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/projects">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Projects
              </Button>
            </Link>
            <h2 className="text-2xl font-bold text-gray-800">Project Not Found</h2>
          </div>
        </header>
        <main className="p-6">
          <p className="text-gray-600">The requested project could not be found.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        {/* Breadcrumb Navigation */}
        <div className="mb-4">
          <nav className="flex items-center space-x-2 text-sm text-gray-600">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/")}
              className="p-1 h-auto hover:bg-gray-100"
            >
              <Home className="w-4 h-4" />
            </Button>
            <span>/</span>
            <span className="text-gray-900 font-medium">
              <Building2 className="w-4 h-4 mr-1 inline" />
              {project?.name || 'Project'}
            </span>
          </nav>
        </div>
        
        <div className="flex items-center gap-4">
          <Link href="/projects">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Projects
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{project.name}</h2>
            <p className="text-gray-600 mt-1">Project locations and details</p>
          </div>
        </div>
      </header>

      <main className="p-6">
        {/* Project Overview */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Project Overview
              <Badge variant="outline">{project.projectId}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Duration</p>
                  <p className="font-medium">
                    {project.startDate ? format(new Date(project.startDate + 'T00:00:00'), 'MMM d, yyyy') : 'No start date'} - {project.endDate ? format(new Date(project.endDate + 'T00:00:00'), 'MMM d, yyyy') : 'No end date'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Superintendent</p>
                  <p className="font-medium">{project.defaultSuperintendent || 'Unassigned'}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Project Manager</p>
                  <p className="font-medium">{project.defaultProjectManager || 'Unassigned'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Locations */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Project Locations
                <Badge variant="secondary">{locations.length}</Badge>
              </CardTitle>
              <Button 
                onClick={() => setShowAddLocationDialog(true)}
                size="sm"
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Location
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {locationsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : locations.length === 0 ? (
              <div className="text-center py-8">
                <MapPin className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No locations found for this project</p>
                <p className="text-sm text-gray-400 mt-2">
                  Locations will appear here once they are added to the project
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {locations.map((location: any) => (
                  <Card key={location.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Link href={`/locations/${location.locationId}`}>
                              <h3 className="font-semibold text-lg hover:text-blue-600 cursor-pointer transition-colors">{location.name}</h3>
                            </Link>
                            <Badge variant="secondary" className="text-xs">{location.locationId}</Badge>
                          </div>
                          <p className="text-gray-600 text-sm mt-1">{location.description}</p>
                          <div className="space-y-3 mt-3">
                            {/* Date Range */}
                            <div className="flex items-center space-x-2 text-sm text-gray-600">
                              <Calendar className="w-4 h-4" />
                              <span>
                                {(() => {
                                  const duration = getLocationDuration(location.locationId);
                                  return `${duration.startDate} - ${duration.endDate}`;
                                })()}
                              </span>
                            </div>
                            
                            {/* Progress Bar */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Progress</span>
                                <span className="text-gray-800 font-medium">
                                  {(() => {
                                    const tasks = locationTaskQueries.data?.[location.locationId] || [];
                                    const completedTasks = tasks.filter((task: any) => task.status === 'complete').length;
                                    const progressPercentage = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;
                                    return `${progressPercentage}%`;
                                  })()}
                                </span>
                              </div>
                              <Progress value={(() => {
                                const tasks = locationTaskQueries.data?.[location.locationId] || [];
                                const completedTasks = tasks.filter((task: any) => task.status === 'complete').length;
                                return tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;
                              })()} className="h-2" />
                              <p className="text-xs text-gray-500">Based on completed tasks</p>
                            </div>

                            {/* Cost Code Progress Bars */}
                            {(() => {
                              const budgetLoading = locationBudgetQueries.isLoading;
                              const taskLoading = locationTaskQueries.isLoading;
                              
                              if (budgetLoading || taskLoading) {
                                return (
                                  <div className="flex items-center gap-1 text-sm text-gray-400">
                                    <Clock className="w-4 h-4 animate-spin" />
                                    <span>Loading cost codes...</span>
                                  </div>
                                );
                              }
                              
                              const costCodeBreakdown = getLocationCostCodeBreakdown(location.locationId);
                              
                              if (costCodeBreakdown.length === 0) {
                                return (
                                  <div className="flex items-center gap-1 text-sm text-gray-400">
                                    <Clock className="w-4 h-4" />
                                    <span>No cost code data</span>
                                  </div>
                                );
                              }
                              
                              return (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-1 text-sm text-gray-600">
                                    <Clock className="w-4 h-4" />
                                    <span>Cost Code Progress</span>
                                  </div>
                                  <div className="space-y-2">
                                    {costCodeBreakdown.map((costCode) => (
                                      <div key={costCode.costCode} className="space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="font-medium text-gray-700">{costCode.costCode}</span>
                                          <span className="text-gray-600">
                                            {costCode.actualHours.toFixed(1)}h / {costCode.budgetHours.toFixed(1)}h
                                            {costCode.overageHours > 0 && (
                                              <span className="text-red-600 ml-1">
                                                (+{costCode.overageHours.toFixed(1)}h)
                                              </span>
                                            )}
                                          </span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                          <div 
                                            className={`h-2 rounded-full transition-all duration-300 ${costCode.progressColor}`}
                                            style={{ width: `${Math.min(100, costCode.progressPercentage)}%` }}
                                          />
                                        </div>
                                        {costCode.remainingHours > 0 && (
                                          <div className="text-xs text-gray-500">
                                            {costCode.remainingHours.toFixed(1)}h remaining
                                          </div>
                                        )}
                                      </div>
                                    ))}

                                  </div>
                                </div>
                              );
                            })()}

                            {/* Budget Info */}
                            {location.budgetAllocated && (
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <DollarSign className="w-4 h-4" />
                                <span>Budget: ${location.budgetAllocated.toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Link href={`/budgets?locationId=${location.id}`}>
                            <Button variant="outline" size="sm">
                              View Budget
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditLocation(location)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteLocation(location)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add/Edit Location Dialog */}
        <Dialog open={showAddLocationDialog} onOpenChange={(open) => {
          if (!open) {
            setShowAddLocationDialog(false);
            setEditingLocation(null);
            setNewLocationName("");
            setNewLocationDescription("");
            setNewLocationStartDate("");
            setNewLocationEndDate("");
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingLocation ? 'Edit Location' : 'Add New Location'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="locationName">Location Name</Label>
                <Input
                  id="locationName"
                  placeholder="Enter location name"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="locationDescription">Description (Optional)</Label>
                <Textarea
                  id="locationDescription"
                  placeholder="Enter location description"
                  value={newLocationDescription}
                  onChange={(e) => setNewLocationDescription(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="locationStartDate">Start Date (Optional)</Label>
                  <Input
                    id="locationStartDate"
                    type="date"
                    value={newLocationStartDate}
                    onChange={(e) => setNewLocationStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="locationEndDate">End Date (Optional)</Label>
                  <Input
                    id="locationEndDate"
                    type="date"
                    value={newLocationEndDate}
                    onChange={(e) => setNewLocationEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowAddLocationDialog(false)}
                  disabled={addLocationMutation.isPending || editLocationMutation.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmitLocation}
                  disabled={addLocationMutation.isPending || editLocationMutation.isPending}
                >
                  {editingLocation 
                    ? (editLocationMutation.isPending ? "Updating..." : "Update Location")
                    : (addLocationMutation.isPending ? "Adding..." : "Add Location")
                  }
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Location Confirmation Dialog */}
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure you want to delete this location?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the location "{locationToDelete?.name}" and all associated data including tasks and budget items.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setDeleteConfirmOpen(false);
                setLocationToDelete(null);
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteLocation} className="bg-red-600 hover:bg-red-700">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}