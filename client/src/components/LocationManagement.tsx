import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, MapPin, Calendar, CheckCircle, Circle } from "lucide-react";
import { format } from "date-fns";

export default function LocationManagement() {
  const [selectedProject, setSelectedProject] = useState<string>("");

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 30000,
  });

  const { data: locations = [], isLoading: locationsLoading } = useQuery({
    queryKey: ["/api/projects", selectedProject, "locations"],
    enabled: !!selectedProject,
    staleTime: 30000,
  });

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
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Location Management</h2>
            <p className="text-gray-600 mt-1">Manage project locations and progress</p>
          </div>
          <Button className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" />
            Add Location
          </Button>
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
                        <p className="text-sm text-gray-600">Total Locations</p>
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
                        <p className="text-sm text-gray-600">Completed</p>
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
                        <p className="text-sm text-gray-600">In Progress</p>
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
                        <p className="text-sm text-gray-600">Avg. Duration</p>
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
                      <p className="text-gray-500">No locations found for this project</p>
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
                                  Start: {format(new Date(location.startDate), 'MMM d, yyyy')}
                                </span>
                              </div>
                              {location.endDate && (
                                <div className="flex items-center space-x-2 text-sm text-gray-600">
                                  <Calendar className="w-4 h-4" />
                                  <span>
                                    End: {format(new Date(location.endDate), 'MMM d, yyyy')}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between">
                              <Badge variant={location.isComplete ? "default" : "secondary"}>
                                {location.isComplete ? "Complete" : "In Progress"}
                              </Badge>
                              <Button variant="ghost" size="sm">
                                View Details
                              </Button>
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
    </div>
  );
}
