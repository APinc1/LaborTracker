import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MapPin, Calendar, User, DollarSign, Home, Building2, Plus } from "lucide-react";
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
  const { toast } = useToast();
  
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["/api/projects", projectId],
    staleTime: 30000,
  });

  const { data: locations = [], isLoading: locationsLoading } = useQuery({
    queryKey: ["/api/projects", projectId, "locations"],
    staleTime: 30000,
  });

  // Fetch tasks for all locations to calculate accurate date ranges
  const locationTaskQueries = useQuery({
    queryKey: ["/api/projects", projectId, "all-location-tasks"],
    queryFn: async () => {
      if (!(locations as any[]).length) return {};
      
      const taskPromises = (locations as any[]).map(async (location: any) => {
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
    enabled: (locations as any[]).length > 0,
    staleTime: 30000,
  });

  // Helper function to calculate location duration from tasks (matching LocationDetails logic)
  const getLocationDuration = (locationId: string) => {
    const tasks = locationTaskQueries.data?.[locationId] || [];
    
    if (!tasks || tasks.length === 0) {
      // Fallback to stored location dates if no tasks
      const location = (locations as any[]).find((loc: any) => loc.locationId === locationId);
      return {
        startDate: location?.startDate ? format(new Date(location.startDate + 'T00:00:00'), 'MMM d, yyyy') : 'No tasks scheduled',
        endDate: location?.endDate ? format(new Date(location.endDate + 'T00:00:00'), 'MMM d, yyyy') : 'No tasks scheduled'
      };
    }

    // Get all task dates and find earliest and latest (same logic as LocationDetails)
    const taskDates = tasks
      .filter((task: any) => task.taskDate) // Filter out invalid task dates
      .map((task: any) => {
        const date = new Date(task.taskDate + 'T00:00:00');
        return isNaN(date.getTime()) ? null : date.getTime(); // Check for invalid dates
      })
      .filter((time: number | null) => time !== null); // Remove null dates

    if (taskDates.length === 0) {
      return {
        startDate: 'No valid tasks',
        endDate: 'No valid tasks'
      };
    }

    const earliestTaskDate = new Date(Math.min(...taskDates));
    const latestTaskDate = new Date(Math.max(...taskDates));

    return {
      startDate: format(earliestTaskDate, 'MMM d, yyyy'),
      endDate: format(latestTaskDate, 'MMM d, yyyy')
    };
  };

  // Add location mutation
  const addLocationMutation = useMutation({
    mutationFn: async (locationData: any) => {
      return await apiRequest(`/api/projects/${projectId}/locations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(locationData),
      });
    },
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
              {(project as any)?.name || 'Project'}
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
            <h2 className="text-2xl font-bold text-gray-800">{(project as any)?.name}</h2>
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
              <Badge variant="outline">{(project as any)?.projectId}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Duration</p>
                  <p className="font-medium">
                    {(project as any)?.startDate ? format(new Date((project as any).startDate + 'T00:00:00'), 'MMM d, yyyy') : 'No start date'} - {(project as any)?.endDate ? format(new Date((project as any).endDate + 'T00:00:00'), 'MMM d, yyyy') : 'No end date'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Superintendent</p>
                  <p className="font-medium">{(project as any)?.defaultSuperintendent || 'Unassigned'}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Project Manager</p>
                  <p className="font-medium">{(project as any)?.defaultProjectManager || 'Unassigned'}</p>
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
                <Badge variant="secondary">{(locations as any[]).length}</Badge>
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
            ) : (locations as any[]).length === 0 ? (
              <div className="text-center py-8">
                <MapPin className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No locations found for this project</p>
                <p className="text-sm text-gray-400 mt-2">
                  Locations will appear here once they are added to the project
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {(locations as any[]).map((location: any) => (
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
                                <span className="text-gray-800 font-medium">0%</span>
                              </div>
                              <Progress value={0} className="h-2" />
                              <p className="text-xs text-gray-500">Based on completed tasks</p>
                            </div>

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
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Location Dialog */}
        <Dialog open={showAddLocationDialog} onOpenChange={setShowAddLocationDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Location</DialogTitle>
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
                  disabled={addLocationMutation.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddLocation}
                  disabled={addLocationMutation.isPending}
                >
                  {addLocationMutation.isPending ? "Adding..." : "Add Location"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}