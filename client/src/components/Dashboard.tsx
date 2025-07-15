import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  MapPin, 
  Tag, 
  User, 
  Clock, 
  Plus, 
  FileText, 
  Users, 
  BarChart3, 
  Upload 
} from "lucide-react";
import ExportButtons from "./ExportButtons";

export default function Dashboard() {
  const today = format(new Date(), "yyyy-MM-dd");
  const tomorrow = format(new Date(Date.now() + 24 * 60 * 60 * 1000), "yyyy-MM-dd");

  const { data: todayTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", today, today],
    staleTime: 30000,
  });

  const { data: tomorrowTasks = [], isLoading: tomorrowLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", tomorrow, tomorrow],
    staleTime: 30000,
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["/api/assignments"],
    staleTime: 30000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["/api/employees"],
    staleTime: 30000,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 30000,
  });

  const getEmployeeStatus = (hours: number) => {
    if (hours >= 8) return { color: "bg-red-500", text: "Overbooked", textColor: "text-red-600" };
    if (hours < 8) return { color: "bg-yellow-500", text: "Under 8hrs", textColor: "text-yellow-600" };
    return { color: "bg-green-500", text: "Optimal", textColor: "text-green-600" };
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

  if (tasksLoading || tomorrowLoading || assignmentsLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Daily Schedule Overview</h2>
            <p className="text-gray-600 mt-1">
              Today • {format(new Date(), "MMMM d, yyyy")}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <ExportButtons />
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {/* Today's Schedule Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Today's Tasks */}
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle>Today's Tasks</CardTitle>
                <Badge className="bg-primary text-primary-foreground">
                  {todayTasks.length} Tasks
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {todayTasks.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No tasks scheduled for today</p>
              ) : (
                todayTasks.map((task: any) => (
                  <div
                    key={task.id}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-3 h-3 bg-accent rounded-full"></div>
                        <h4 className="font-medium text-gray-800">{task.name}</h4>
                      </div>
                      <span className="text-sm text-gray-500">{task.startTime || "8:00 AM"}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <MapPin className="w-4 h-4" />
                        <span>{task.locationId}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Tag className="w-4 h-4" />
                        <span>{task.costCode}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <User className="w-4 h-4" />
                        <span>Foreman: {task.foremanId || "Unassigned"}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Clock className="w-4 h-4" />
                        <span>{task.scheduledHours || 0} hours scheduled</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-sm text-gray-600">
                        {task.workDescription || "No description available"}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Tomorrow's Preview */}
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle>Tomorrow's Preview</CardTitle>
                <Badge variant="secondary">
                  {tomorrowTasks.length} Tasks
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {tomorrowTasks.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No tasks scheduled for tomorrow</p>
              ) : (
                tomorrowTasks.map((task: any) => (
                  <div
                    key={task.id}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                        <h4 className="font-medium text-gray-800">{task.name}</h4>
                      </div>
                      <span className="text-sm text-gray-500">{task.startTime || "8:00 AM"}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <MapPin className="w-4 h-4" />
                        <span>{task.locationId}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Tag className="w-4 h-4" />
                        <span>{task.costCode}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Employee Assignments & Conflicts */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle>Employee Assignments</CardTitle>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">8+ Hours</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">&lt;8 Hours</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm text-gray-600">8 Hours</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Employee</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Type</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Crew</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Assigned Task</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Hours</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500">
                        No employee assignments found
                      </td>
                    </tr>
                  ) : (
                    assignments.map((assignment: any) => {
                      const employee = employees.find((e: any) => e.id === assignment.employeeId);
                      const hours = parseFloat(assignment.assignedHours) || 0;
                      const status = getEmployeeStatus(hours);
                      
                      return (
                        <tr
                          key={assignment.id}
                          className={`border-b border-gray-100 hover:bg-gray-50 ${
                            hours >= 8 ? "bg-red-50" : hours < 8 ? "bg-yellow-50" : ""
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                                <User className="text-gray-600 text-sm" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">{employee?.name || "Unknown"}</p>
                                <p className="text-sm text-gray-500">{employee?.teamMemberId || "N/A"}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={getEmployeeTypeVariant(employee?.employeeType || "")}>
                              {employee?.employeeType || "Unknown"}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-gray-600">{employee?.crewId || "Unassigned"}</span>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium text-gray-800">{assignment.taskId}</p>
                              <p className="text-sm text-gray-500">Task Assignment</p>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`font-medium ${status.textColor}`}>
                              {hours.toFixed(1)}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2">
                              <div className={`w-3 h-3 ${status.color} rounded-full`}></div>
                              <span className={`text-sm ${status.textColor} font-medium`}>
                                {status.text}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
                              Edit
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Budget Overview & Location Progress */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Budget Overview</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">CONCRETE</p>
                    <p className="text-sm text-gray-600">Concrete work and materials</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-800">$125,000</p>
                    <p className="text-sm text-gray-600">$87,500 remaining</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">DEMO/EX</p>
                    <p className="text-sm text-gray-600">Demolition and excavation</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-800">$45,000</p>
                    <p className="text-sm text-gray-600">$32,000 remaining</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-800">ASPHALT</p>
                    <p className="text-sm text-gray-600">Asphalt paving and materials</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-800">$78,000</p>
                    <p className="text-sm text-gray-600">$78,000 remaining</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Location Progress</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-800">Main St Bridge - North Section</h4>
                    <span className="text-sm text-gray-600">65% Complete</span>
                  </div>
                  <Progress value={65} className="mb-2" />
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Start: Mar 1, 2024</span>
                    <span>End: Mar 25, 2024</span>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-800">City Hall - East Wing</h4>
                    <span className="text-sm text-gray-600">35% Complete</span>
                  </div>
                  <Progress value={35} className="mb-2" />
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Start: Mar 10, 2024</span>
                    <span>End: Apr 5, 2024</span>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-gray-800">Highway 101 - Mile 15</h4>
                    <span className="text-sm text-gray-600">Not Started</span>
                  </div>
                  <Progress value={0} className="mb-2" />
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Start: Mar 20, 2024</span>
                    <span>End: Apr 15, 2024</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button
                variant="outline"
                className="p-4 h-auto flex flex-col items-center space-y-2"
              >
                <Plus className="text-primary text-2xl" />
                <span className="font-medium text-gray-800">New Project</span>
              </Button>
              <Button
                variant="outline"
                className="p-4 h-auto flex flex-col items-center space-y-2"
              >
                <Upload className="text-accent text-2xl" />
                <span className="font-medium text-gray-800">Import Budget</span>
              </Button>
              <Button
                variant="outline"
                className="p-4 h-auto flex flex-col items-center space-y-2"
              >
                <Users className="text-warning text-2xl" />
                <span className="font-medium text-gray-800">Assign Crew</span>
              </Button>
              <Button
                variant="outline"
                className="p-4 h-auto flex flex-col items-center space-y-2"
              >
                <BarChart3 className="text-gray-600 text-2xl" />
                <span className="font-medium text-gray-800">View Reports</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
