import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Calendar as CalendarIcon, Clock, User, MapPin, Tag } from "lucide-react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from "date-fns";
import CreateTaskModal from "./CreateTaskModal";

export default function ScheduleManagement() {
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 30000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["/api/projects", selectedProject, "locations"],
    enabled: !!selectedProject,
    staleTime: 30000,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", format(startOfWeek(selectedDate), 'yyyy-MM-dd'), format(endOfWeek(selectedDate), 'yyyy-MM-dd')],
    staleTime: 30000,
  });

  const getWeekDays = () => {
    return eachDayOfInterval({
      start: startOfWeek(selectedDate),
      end: endOfWeek(selectedDate),
    });
  };

  const getTasksForDay = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return tasks.filter((task: any) => task.taskDate === dayStr);
  };

  const getTaskTypeColor = (taskType: string) => {
    switch (taskType) {
      case 'Form': return 'bg-blue-100 text-blue-800';
      case 'Pour': return 'bg-green-100 text-green-800';
      case 'Demo/Ex': return 'bg-orange-100 text-orange-800';
      case 'Asphalt': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
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
            <h2 className="text-2xl font-bold text-gray-800">Schedule Management</h2>
            <p className="text-gray-600 mt-1">Plan and track project schedules</p>
          </div>
          <Button 
            className="bg-primary hover:bg-primary/90"
            onClick={() => setIsCreateTaskModalOpen(true)}
            disabled={!selectedProject}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Task
          </Button>
        </div>
      </header>

      <main className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="space-y-4">
            {/* Project Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Project</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project: any) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Calendar */}
            <Card>
              <CardHeader>
                <CardTitle>Calendar</CardTitle>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  className="rounded-md border"
                />
              </CardContent>
            </Card>

            {/* Location Filter */}
            {selectedProject && (
              <Card>
                <CardHeader>
                  <CardTitle>Locations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {locations.map((location: any) => (
                      <div key={location.id} className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span className="text-sm">{location.name}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Main Schedule View */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>
                  Week of {format(startOfWeek(selectedDate), 'MMMM d, yyyy')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {tasksLoading ? (
                  <Skeleton className="h-96" />
                ) : (
                  <div className="grid grid-cols-7 gap-1">
                    {getWeekDays().map((day) => {
                      const dayTasks = getTasksForDay(day);
                      const isToday = isSameDay(day, new Date());
                      const isSelected = isSameDay(day, selectedDate);
                      
                      return (
                        <div
                          key={day.toISOString()}
                          className={`border rounded-lg p-2 min-h-[180px] ${
                            isToday ? 'bg-blue-50 border-blue-200' : 
                            isSelected ? 'bg-gray-50 border-gray-300' : 
                            'bg-white border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-medium text-sm">
                              {format(day, 'EEE')}
                            </h3>
                            <span className={`text-sm ${
                              isToday ? 'text-blue-600 font-bold' : 'text-gray-600'
                            }`}>
                              {format(day, 'd')}
                            </span>
                          </div>
                          
                          <div className="space-y-2">
                            {dayTasks.map((task: any) => (
                              <div
                                key={task.id}
                                className="border border-gray-200 rounded p-2 hover:shadow-sm transition-shadow cursor-pointer"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${getTaskTypeColor(task.taskType)}`}
                                  >
                                    {task.taskType}
                                  </Badge>
                                  <span className="text-xs text-gray-500">
                                    {task.startTime || '8:00 AM'}
                                  </span>
                                </div>
                                <h4 className="font-medium text-sm mb-1">{task.name}</h4>
                                <div className="space-y-1">
                                  <div className="flex items-center space-x-1 text-xs text-gray-600">
                                    <MapPin className="w-3 h-3" />
                                    <span>{task.locationId}</span>
                                  </div>
                                  <div className="flex items-center space-x-1 text-xs text-gray-600">
                                    <Tag className="w-3 h-3" />
                                    <span>{task.costCode}</span>
                                  </div>
                                  <div className="flex items-center space-x-1 text-xs text-gray-600">
                                    <Clock className="w-3 h-3" />
                                    <span>{task.scheduledHours || 0}h</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Task Details for Selected Day */}
            {selectedDate && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>
                    Tasks for {format(selectedDate, 'MMMM d, yyyy')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {getTasksForDay(selectedDate).length === 0 ? (
                      <p className="text-gray-500 text-center py-8">
                        No tasks scheduled for this day
                      </p>
                    ) : (
                      getTasksForDay(selectedDate).map((task: any) => (
                        <div key={task.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium text-lg">{task.name}</h4>
                            <div className="flex items-center space-x-2">
                              <Badge className={getTaskTypeColor(task.taskType)}>
                                {task.taskType}
                              </Badge>
                              <span className="text-sm text-gray-500">
                                {task.startTime || '8:00 AM'}
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="flex items-center space-x-2">
                              <MapPin className="w-4 h-4 text-gray-500" />
                              <span>{task.locationId}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Tag className="w-4 h-4 text-gray-500" />
                              <span>{task.costCode}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Clock className="w-4 h-4 text-gray-500" />
                              <span>{task.scheduledHours || 0} hours</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <User className="w-4 h-4 text-gray-500" />
                              <span>{task.foremanId || 'Unassigned'}</span>
                            </div>
                          </div>
                          {task.workDescription && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-sm text-gray-600">{task.workDescription}</p>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
      
      <CreateTaskModal
        isOpen={isCreateTaskModalOpen}
        onClose={() => setIsCreateTaskModalOpen(false)}
        selectedDate={format(selectedDate, 'yyyy-MM-dd')}
        selectedProject={selectedProject ? parseInt(selectedProject) : undefined}
      />
    </div>
  );
}
