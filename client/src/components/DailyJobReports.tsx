import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, isAfter, startOfDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Home, ClipboardList } from "lucide-react";
import type { Task } from "@shared/schema";

interface TaskGroup {
  key: string;
  label: string;
  taskDate: string;
  tasks: Task[];
}

export default function DailyJobReports() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [selectedTaskGroupKey, setSelectedTaskGroupKey] = useState<string>("");

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/projects"],
  });

  const { data: locations = [], isLoading: locationsLoading } = useQuery({
    queryKey: ["/api/projects", selectedProjectId, "locations"],
    enabled: !!selectedProjectId,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/locations", selectedLocationId, "tasks"],
    enabled: !!selectedLocationId,
  });

  const taskGroups = useMemo(() => {
    const today = startOfDay(new Date());
    const groupMap = new Map<string, TaskGroup>();
    
    // Filter tasks to only include those up to current date
    const filteredTasks = tasks.filter((task: Task) => {
      if (!task.taskDate) return false;
      const taskDate = startOfDay(parseISO(task.taskDate));
      return !isAfter(taskDate, today);
    });
    
    filteredTasks.forEach((task: Task) => {
      const groupKey = task.linkedTaskGroup || `single-${task.id}`;
      
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          key: groupKey,
          label: "",
          taskDate: task.taskDate || "",
          tasks: []
        });
      }
      
      const group = groupMap.get(groupKey)!;
      group.tasks.push(task);
    });

    const groups = Array.from(groupMap.values());
    
    // Sort by date (newest first)
    groups.sort((a, b) => {
      if (!a.taskDate && !b.taskDate) return 0;
      if (!a.taskDate) return 1;
      if (!b.taskDate) return -1;
      return b.taskDate.localeCompare(a.taskDate);
    });

    // Generate labels with date prefix and all task names
    groups.forEach(group => {
      const dateStr = group.taskDate 
        ? format(parseISO(group.taskDate), "MMM d, yyyy")
        : "No date";
      
      // Get unique task names from the group
      const taskNames = [...new Set(group.tasks.map(t => t.name))];
      const namesStr = taskNames.join(" + ");
      
      group.label = `${dateStr} • ${namesStr}`;
    });

    return groups;
  }, [tasks]);

  const selectedGroup = taskGroups.find(g => g.key === selectedTaskGroupKey);

  const handleProjectChange = (value: string) => {
    setSelectedProjectId(value);
    setSelectedLocationId("");
    setSelectedTaskGroupKey("");
  };

  const handleLocationChange = (value: string) => {
    setSelectedLocationId(value);
    setSelectedTaskGroupKey("");
  };

  const handleTaskGroupChange = (value: string) => {
    setSelectedTaskGroupKey(value);
  };

  const selectedProject = projects.find((p: any) => p.id.toString() === selectedProjectId);
  const selectedLocation = locations.find((l: any) => l.locationId === selectedLocationId);

  const formatDisplayDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      return format(parseISO(dateStr), "MMMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="p-6 h-full overflow-y-auto">
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

            {/* Task Dropdown - Date oriented */}
            <div className="space-y-2">
              <Label htmlFor="task-select">Task</Label>
              {tasksLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select 
                  value={selectedTaskGroupKey} 
                  onValueChange={handleTaskGroupChange}
                  disabled={!selectedLocationId}
                >
                  <SelectTrigger id="task-select" data-testid="select-task">
                    <SelectValue placeholder={selectedLocationId ? "Select a task by date" : "Select a location first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {taskGroups.map((group) => (
                      <SelectItem 
                        key={group.key} 
                        value={group.key}
                        data-testid={`option-task-group-${group.key}`}
                      >
                        {group.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Report Content Area */}
          <div className="border-t pt-6">
            {selectedGroup ? (
              <div className="space-y-6">
                {/* Summary Header */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold" data-testid="report-title">
                      Daily Job Report
                    </h3>
                    <span className="text-sm text-gray-500" data-testid="report-project-location">
                      {selectedProject?.name} - {selectedLocation?.name}
                    </span>
                  </div>
                  <div className="text-xl font-bold text-blue-600" data-testid="report-task-date">
                    {formatDisplayDate(selectedGroup.taskDate)}
                  </div>
                </div>

                {/* Task Details */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-gray-700">
                    {selectedGroup.tasks.length > 1 ? `Linked Tasks (${selectedGroup.tasks.length})` : "Task Details"}
                  </h4>
                  
                  {selectedGroup.tasks.map((task, index) => (
                    <div 
                      key={task.id} 
                      className="border rounded-lg p-4 bg-white"
                      data-testid={`task-detail-${task.id}`}
                    >
                      {selectedGroup.tasks.length > 1 && (
                        <div className="text-sm font-medium text-blue-600 mb-2">
                          Task {index + 1}: {task.name}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500 block">Cost Code</span>
                          <span className="font-medium" data-testid={`task-costcode-${task.id}`}>
                            {task.costCode || "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Qty</span>
                          <span className="font-medium" data-testid={`task-qty-${task.id}`}>
                            {task.qty || "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Unit of Measure</span>
                          <span className="font-medium" data-testid={`task-uom-${task.id}`}>
                            {task.unitOfMeasure || "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Start Time</span>
                          <span className="font-medium" data-testid={`task-starttime-${task.id}`}>
                            {task.startTime || "-"}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">Finish Time</span>
                          <span className="font-medium" data-testid={`task-finishtime-${task.id}`}>
                            {task.finishTime || "-"}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        <div>
                          <span className="text-gray-500 block text-sm">Work Description</span>
                          <p className="font-medium" data-testid={`task-workdesc-${task.id}`}>
                            {task.workDescription || "-"}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-sm">Notes</span>
                          <p className="font-medium" data-testid={`task-notes-${task.id}`}>
                            {task.notes || "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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
