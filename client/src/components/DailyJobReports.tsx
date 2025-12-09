import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Home, ClipboardList } from "lucide-react";

export default function DailyJobReports() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/projects"],
  });

  const { data: locations = [], isLoading: locationsLoading } = useQuery({
    queryKey: ["/api/projects", selectedProjectId, "locations"],
    enabled: !!selectedProjectId,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["/api/locations", selectedLocationId, "tasks"],
    enabled: !!selectedLocationId,
  });

  const handleProjectChange = (value: string) => {
    setSelectedProjectId(value);
    setSelectedLocationId("");
    setSelectedTaskId("");
  };

  const handleLocationChange = (value: string) => {
    setSelectedLocationId(value);
    setSelectedTaskId("");
  };

  const handleTaskChange = (value: string) => {
    setSelectedTaskId(value);
  };

  const selectedProject = projects.find((p: any) => p.id.toString() === selectedProjectId);
  const selectedLocation = locations.find((l: any) => l.locationId === selectedLocationId);
  const selectedTask = tasks.find((t: any) => t.id.toString() === selectedTaskId);

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-sm text-gray-600 mb-4">
        <Link href="/">
          <span className="flex items-center hover:text-gray-900 cursor-pointer">
            <Home className="w-4 h-4" />
          </span>
        </Link>
        <span>/</span>
        <span className="flex items-center gap-1 font-medium text-gray-900">
          <ClipboardList className="w-4 h-4" />
          Daily Job Reports
        </span>
      </nav>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Daily Job Reports</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            Select Report Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Project Dropdown */}
            <div className="space-y-2">
              <Label htmlFor="project-select">Project</Label>
              {projectsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select 
                  value={selectedProjectId} 
                  onValueChange={handleProjectChange}
                >
                  <SelectTrigger id="project-select" data-testid="select-project">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project: any) => (
                      <SelectItem 
                        key={project.id} 
                        value={project.id.toString()}
                        data-testid={`option-project-${project.id}`}
                      >
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Location Dropdown */}
            <div className="space-y-2">
              <Label htmlFor="location-select">Location</Label>
              {locationsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select 
                  value={selectedLocationId} 
                  onValueChange={handleLocationChange}
                  disabled={!selectedProjectId}
                >
                  <SelectTrigger id="location-select" data-testid="select-location">
                    <SelectValue placeholder={selectedProjectId ? "Select a location" : "Select a project first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location: any) => (
                      <SelectItem 
                        key={location.id} 
                        value={location.locationId}
                        data-testid={`option-location-${location.id}`}
                      >
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Task Dropdown */}
            <div className="space-y-2">
              <Label htmlFor="task-select">Task</Label>
              {tasksLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select 
                  value={selectedTaskId} 
                  onValueChange={handleTaskChange}
                  disabled={!selectedLocationId}
                >
                  <SelectTrigger id="task-select" data-testid="select-task">
                    <SelectValue placeholder={selectedLocationId ? "Select a task" : "Select a location first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {tasks.map((task: any) => (
                      <SelectItem 
                        key={task.id} 
                        value={task.id.toString()}
                        data-testid={`option-task-${task.id}`}
                      >
                        {task.name} - {task.taskDate}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Report Content Area */}
          <div className="border-t pt-6">
            {selectedTask ? (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Report for: {selectedTask.name}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Project:</span> {selectedProject?.name}
                  </div>
                  <div>
                    <span className="text-gray-500">Location:</span> {selectedLocation?.name}
                  </div>
                  <div>
                    <span className="text-gray-500">Date:</span> {selectedTask.taskDate}
                  </div>
                  <div>
                    <span className="text-gray-500">Cost Code:</span> {selectedTask.costCode}
                  </div>
                </div>
                <p className="text-sm text-gray-400 mt-4">
                  Report generation coming soon...
                </p>
              </div>
            ) : (
              <div className="text-center py-8">
                <ClipboardList className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">Select a project, location, and task to view the report</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
