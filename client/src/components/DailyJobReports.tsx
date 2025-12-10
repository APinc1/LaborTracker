import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, isAfter, startOfDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Home, ClipboardList, Cloud, Sun, CloudRain, Loader2, Save, History, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Task, DailyJobReport, DjrEditHistoryEntry } from "@shared/schema";

interface TaskGroup {
  key: string;
  label: string;
  taskDate: string;
  tasks: Task[];
}

interface TaskQuantityInput {
  taskId: number;
  quantity: string;
  unitOfMeasure: string;
  notes: string;
}

interface WeatherData {
  weather7am: string;
  weatherNoon: string;
  weather4pm: string;
}

export default function DailyJobReports() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [selectedTaskGroupKey, setSelectedTaskGroupKey] = useState<string>("");
  
  // DJR form state
  const [weather, setWeather] = useState<WeatherData>({ weather7am: "", weatherNoon: "", weather4pm: "" });
  const [notes, setNotes] = useState<string>("");
  const [taskQuantities, setTaskQuantities] = useState<TaskQuantityInput[]>([]);
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [existingDjrId, setExistingDjrId] = useState<number | null>(null);
  const [editHistory, setEditHistory] = useState<DjrEditHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const { data: projects = [], isLoading: projectsLoading } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const { data: locations = [], isLoading: locationsLoading } = useQuery<any[]>({
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
    
    groups.sort((a, b) => {
      if (!a.taskDate && !b.taskDate) return 0;
      if (!a.taskDate) return 1;
      if (!b.taskDate) return -1;
      return b.taskDate.localeCompare(a.taskDate);
    });

    groups.forEach(group => {
      const dateStr = group.taskDate 
        ? format(parseISO(group.taskDate), "MMM d, yyyy")
        : "No date";
      
      const taskNames = Array.from(new Set(group.tasks.map(t => t.name)));
      const namesStr = taskNames.join(" + ");
      
      group.label = `${dateStr} • ${namesStr}`;
    });

    return groups;
  }, [tasks]);

  const selectedGroup = taskGroups.find(g => g.key === selectedTaskGroupKey);
  const selectedProject = projects.find((p: any) => p.id.toString() === selectedProjectId);
  const selectedLocation = locations.find((l: any) => l.locationId === selectedLocationId);

  // Load existing DJR when task group changes
  useEffect(() => {
    if (selectedGroup && selectedLocationId) {
      loadExistingDjr();
    } else {
      resetForm();
    }
  }, [selectedTaskGroupKey, selectedGroup?.taskDate]);

  const loadExistingDjr = async () => {
    if (!selectedGroup) return;
    
    try {
      const response = await fetch(`/api/daily-job-reports/by-task-group/${encodeURIComponent(selectedGroup.key)}/${selectedGroup.taskDate}`);
      
      if (response.ok) {
        const djr = await response.json();
        setExistingDjrId(djr.id);
        setWeather({
          weather7am: djr.weather7am || "",
          weatherNoon: djr.weatherNoon || "",
          weather4pm: djr.weather4pm || ""
        });
        setNotes(djr.notes || "");
        setEditHistory((djr.editHistory as DjrEditHistoryEntry[]) || []);
        
        // Load task quantities
        if (djr.taskQuantities) {
          setTaskQuantities(djr.taskQuantities.map((q: any) => ({
            taskId: q.taskId,
            quantity: q.quantity || "",
            unitOfMeasure: q.unitOfMeasure || "",
            notes: q.notes || ""
          })));
        } else {
          initializeTaskQuantities();
        }
      } else {
        // New DJR - reset form and auto-fetch weather
        resetForm();
        initializeTaskQuantities();
        autoFetchWeather();
      }
    } catch {
      resetForm();
      initializeTaskQuantities();
    }
  };

  const autoFetchWeather = async () => {
    const project = projects.find((p: any) => p.id.toString() === selectedProjectId);
    const group = taskGroups.find(g => g.key === selectedTaskGroupKey);
    
    if (!project?.address || !group?.taskDate) return;

    setIsLoadingWeather(true);
    try {
      const geoResponse = await fetch(`/api/geocode?address=${encodeURIComponent(project.address)}`);
      if (!geoResponse.ok) return;
      const geoData = await geoResponse.json();
      
      const weatherResponse = await fetch(`/api/weather/historical?lat=${geoData.latitude}&lon=${geoData.longitude}&date=${group.taskDate}`);
      if (!weatherResponse.ok) return;
      const weatherData = await weatherResponse.json();
      
      setWeather(weatherData);
    } catch {
      // Silent fail for auto-fetch - user can manually retry
    } finally {
      setIsLoadingWeather(false);
    }
  };

  const initializeTaskQuantities = () => {
    if (!selectedGroup) return;
    setTaskQuantities(selectedGroup.tasks.map(task => ({
      taskId: task.id,
      quantity: task.qty?.toString() || "",
      unitOfMeasure: task.unitOfMeasure || "",
      notes: ""
    })));
  };

  const resetForm = () => {
    setExistingDjrId(null);
    setWeather({ weather7am: "", weatherNoon: "", weather4pm: "" });
    setNotes("");
    setTaskQuantities([]);
    setEditHistory([]);
    setShowHistory(false);
  };

  const fetchWeather = async () => {
    if (!selectedProject?.address || !selectedGroup?.taskDate) {
      toast({ title: "Missing Information", description: "Project address and task date are required for weather lookup", variant: "destructive" });
      return;
    }

    setIsLoadingWeather(true);
    try {
      // First geocode the address
      const geoResponse = await fetch(`/api/geocode?address=${encodeURIComponent(selectedProject.address)}`);
      if (!geoResponse.ok) {
        throw new Error("Could not find location for address");
      }
      const geoData = await geoResponse.json();
      
      // Then fetch weather
      const weatherResponse = await fetch(`/api/weather/historical?lat=${geoData.latitude}&lon=${geoData.longitude}&date=${selectedGroup.taskDate}`);
      if (!weatherResponse.ok) {
        throw new Error("Could not fetch weather data");
      }
      const weatherData = await weatherResponse.json();
      
      setWeather(weatherData);
      toast({ title: "Weather Loaded", description: "Weather data fetched successfully" });
    } catch (error: any) {
      toast({ title: "Weather Error", description: error.message || "Failed to fetch weather", variant: "destructive" });
    } finally {
      setIsLoadingWeather(false);
    }
  };

  const saveDjrMutation = useMutation({
    mutationFn: async (data: any) => {
      if (existingDjrId) {
        return apiRequest(`/api/daily-job-reports/${existingDjrId}`, { method: "PATCH", body: JSON.stringify(data) });
      } else {
        return apiRequest("/api/daily-job-reports", { method: "POST", body: JSON.stringify(data) });
      }
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Daily Job Report saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-job-reports"] });
      loadExistingDjr();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to save report", variant: "destructive" });
    }
  });

  const handleSave = () => {
    if (!selectedGroup || !selectedLocation || !selectedProject) {
      toast({ title: "Error", description: "Please select a project, location, and task group", variant: "destructive" });
      return;
    }

    const locationObj = locations.find((l: any) => l.locationId === selectedLocationId);
    
    const data = {
      projectId: parseInt(selectedProjectId),
      locationId: locationObj?.id,
      linkedTaskGroup: selectedGroup.key,
      taskDate: selectedGroup.taskDate,
      weather7am: weather.weather7am || null,
      weatherNoon: weather.weatherNoon || null,
      weather4pm: weather.weather4pm || null,
      notes: notes || null,
      taskQuantities: taskQuantities.map(tq => ({
        taskId: tq.taskId,
        quantity: tq.quantity || null,
        unitOfMeasure: tq.unitOfMeasure || null,
        notes: tq.notes || null
      })),
      // For edit history
      editedByName: "User",
      changeDescription: existingDjrId ? "Updated report" : undefined,
      submittedByName: !existingDjrId ? "User" : undefined
    };

    saveDjrMutation.mutate(data);
  };

  const updateTaskQuantity = (taskId: number, field: keyof TaskQuantityInput, value: string) => {
    setTaskQuantities(prev => prev.map(tq => 
      tq.taskId === taskId ? { ...tq, [field]: value } : tq
    ));
  };

  const handleProjectChange = (value: string) => {
    setSelectedProjectId(value);
    setSelectedLocationId("");
    setSelectedTaskGroupKey("");
    resetForm();
  };

  const handleLocationChange = (value: string) => {
    setSelectedLocationId(value);
    setSelectedTaskGroupKey("");
    resetForm();
  };

  const handleTaskGroupChange = (value: string) => {
    setSelectedTaskGroupKey(value);
  };

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
                      Daily Job Report {existingDjrId ? "(Editing)" : "(New)"}
                    </h3>
                    <span className="text-sm text-gray-500" data-testid="report-project-location">
                      {selectedProject?.name} - {selectedLocation?.name}
                    </span>
                  </div>
                  <div className="text-xl font-bold text-blue-600" data-testid="report-task-date">
                    {formatDisplayDate(selectedGroup.taskDate)}
                  </div>
                </div>

                {/* Weather Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                      <Cloud className="w-4 h-4" />
                      Weather Conditions
                    </h4>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={fetchWeather}
                      disabled={isLoadingWeather || !selectedProject?.address}
                      data-testid="btn-fetch-weather"
                    >
                      {isLoadingWeather ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Fetch Weather
                    </Button>
                  </div>
                  
                  {!selectedProject?.address && (
                    <p className="text-sm text-amber-600">
                      Add an address to the project to enable automatic weather fetching
                    </p>
                  )}
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <Label className="flex items-center gap-1">
                        <Sun className="w-3 h-3" /> 7:00 AM
                      </Label>
                      <Input
                        value={weather.weather7am}
                        onChange={(e) => setWeather(w => ({ ...w, weather7am: e.target.value }))}
                        placeholder="e.g., Clear sky, 65°F"
                        data-testid="input-weather-7am"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="flex items-center gap-1">
                        <Sun className="w-3 h-3" /> 12:00 PM
                      </Label>
                      <Input
                        value={weather.weatherNoon}
                        onChange={(e) => setWeather(w => ({ ...w, weatherNoon: e.target.value }))}
                        placeholder="e.g., Partly cloudy, 72°F"
                        data-testid="input-weather-noon"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="flex items-center gap-1">
                        <CloudRain className="w-3 h-3" /> 4:00 PM
                      </Label>
                      <Input
                        value={weather.weather4pm}
                        onChange={(e) => setWeather(w => ({ ...w, weather4pm: e.target.value }))}
                        placeholder="e.g., Light rain, 68°F"
                        data-testid="input-weather-4pm"
                      />
                    </div>
                  </div>
                </div>

                {/* Task Details with Quantity Inputs */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-700 text-sm">
                    {selectedGroup.tasks.length > 1 ? `Task Quantities (${selectedGroup.tasks.length} tasks)` : "Task Quantity"}
                  </h4>
                  
                  {selectedGroup.tasks.map((task, index) => {
                    const tq = taskQuantities.find(q => q.taskId === task.id) || { taskId: task.id, quantity: "", unitOfMeasure: "", notes: "" };
                    
                    return (
                      <div 
                        key={task.id} 
                        className="border rounded p-4 bg-white"
                        data-testid={`task-detail-${task.id}`}
                      >
                        <div className="font-medium text-blue-600 mb-3">
                          {selectedGroup.tasks.length > 1 && `Task ${index + 1}: `}{task.name}
                          <span className="text-gray-500 text-sm ml-2">({task.costCode || "No cost code"})</span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="space-y-1">
                            <Label className="text-xs">Quantity Completed</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={tq.quantity}
                              onChange={(e) => updateTaskQuantity(task.id, "quantity", e.target.value)}
                              placeholder={task.qty?.toString() || "0"}
                              data-testid={`input-qty-${task.id}`}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Unit of Measure</Label>
                            <Select 
                              value={tq.unitOfMeasure || task.unitOfMeasure || ""} 
                              onValueChange={(v) => updateTaskQuantity(task.id, "unitOfMeasure", v)}
                            >
                              <SelectTrigger data-testid={`select-uom-${task.id}`}>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="CY">CY (Cubic Yards)</SelectItem>
                                <SelectItem value="Ton">Ton</SelectItem>
                                <SelectItem value="LF">LF (Linear Feet)</SelectItem>
                                <SelectItem value="SF">SF (Square Feet)</SelectItem>
                                <SelectItem value="Hours">Hours</SelectItem>
                                <SelectItem value="Each">Each</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <Label className="text-xs">Task Notes</Label>
                            <Input
                              value={tq.notes}
                              onChange={(e) => updateTaskQuantity(task.id, "notes", e.target.value)}
                              placeholder="Notes for this task..."
                              data-testid={`input-task-notes-${task.id}`}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* General Notes */}
                <div className="space-y-2">
                  <Label htmlFor="djr-notes">Report Notes</Label>
                  <Textarea
                    id="djr-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="General notes about the day's work..."
                    rows={4}
                    data-testid="textarea-notes"
                  />
                </div>

                {/* Edit History */}
                {editHistory.length > 0 && (
                  <div className="space-y-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setShowHistory(!showHistory)}
                      className="flex items-center gap-2"
                      data-testid="btn-toggle-history"
                    >
                      <History className="w-4 h-4" />
                      {showHistory ? "Hide" : "Show"} Edit History ({editHistory.length})
                    </Button>
                    
                    {showHistory && (
                      <div className="bg-gray-50 rounded p-3 text-sm space-y-2 max-h-48 overflow-y-auto">
                        {editHistory.map((entry, idx) => (
                          <div key={idx} className="flex justify-between text-gray-600 border-b border-gray-200 pb-1 last:border-0">
                            <span>{entry.changes}</span>
                            <span className="text-gray-400 text-xs">
                              {entry.userName} - {format(parseISO(entry.timestamp), "MMM d, yyyy h:mm a")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Save Button */}
                <div className="flex justify-end pt-4 border-t">
                  <Button 
                    onClick={handleSave}
                    disabled={saveDjrMutation.isPending}
                    className="flex items-center gap-2"
                    data-testid="btn-save-djr"
                  >
                    {saveDjrMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {existingDjrId ? "Update Report" : "Save Report"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <ClipboardList className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">Select a project, location, and task to view or create a report</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
