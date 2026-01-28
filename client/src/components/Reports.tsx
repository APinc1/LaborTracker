import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, isWithinInterval } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download, Calendar, MapPin, Building2, Filter, FileSpreadsheet, StickyNote } from "lucide-react";
import { Link } from "wouter";
import * as XLSX from 'xlsx';

type DateRangeType = 'day' | 'week' | 'month' | 'all';

export default function Reports() {
  const today = new Date();
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [dateRangeType, setDateRangeType] = useState<DateRangeType>('all');
  const [selectedDate, setSelectedDate] = useState<string>(format(today, 'yyyy-MM-dd'));

  // Fetch all projects
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 30000,
  });

  // Fetch all locations
  const { data: locations = [], isLoading: locationsLoading } = useQuery({
    queryKey: ["/api/locations"],
    staleTime: 30000,
  });

  // Fetch all tasks with a wider date range for filtering
  const dateRange = useMemo(() => {
    const baseDate = parseISO(selectedDate);
    switch (dateRangeType) {
      case 'day':
        return { start: selectedDate, end: selectedDate };
      case 'week':
        return { 
          start: format(startOfWeek(baseDate, { weekStartsOn: 0 }), 'yyyy-MM-dd'),
          end: format(endOfWeek(baseDate, { weekStartsOn: 0 }), 'yyyy-MM-dd')
        };
      case 'month':
        return {
          start: format(startOfMonth(baseDate), 'yyyy-MM-dd'),
          end: format(endOfMonth(baseDate), 'yyyy-MM-dd')
        };
      default:
        return { start: '2020-01-01', end: '2030-12-31' };
    }
  }, [selectedDate, dateRangeType]);

  // Fetch all tasks with a high limit to ensure we get all of them
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", dateRange.start, dateRange.end, "no-limit"],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/date-range/${dateRange.start}/${dateRange.end}?limit=10000`);
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
    staleTime: 30000,
  });

  // Fetch all assignments
  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["/api/assignments"],
    staleTime: 30000,
  });

  // Get location IDs for bulk budget fetch
  const locationDbIds = useMemo(() => {
    return (locations as any[]).map((loc: any) => loc.id).filter(Boolean);
  }, [locations]);

  // Fetch budget data for all locations using bulk endpoint
  const { data: allBudgetItems = [], isLoading: budgetLoading } = useQuery({
    queryKey: ["/api/budget/bulk", locationDbIds.join(',')],
    queryFn: async () => {
      if (locationDbIds.length === 0) return [];
      const response = await fetch(`/api/budget/bulk?locationIds=${locationDbIds.join(',')}`);
      if (!response.ok) throw new Error('Failed to fetch budgets');
      return response.json();
    },
    enabled: locationDbIds.length > 0,
    staleTime: 30000,
  });

  const isLoading = projectsLoading || locationsLoading || tasksLoading || assignmentsLoading || budgetLoading;

  // Group budget items by location ID
  const budgetsData = useMemo(() => {
    const grouped: { [locationId: number]: any[] } = {};
    (allBudgetItems as any[]).forEach((item: any) => {
      const locId = item.locationId;
      if (!grouped[locId]) grouped[locId] = [];
      grouped[locId].push(item);
    });
    return grouped;
  }, [allBudgetItems]);

  // Helper function to normalize cost codes
  const normalizeCostCode = (costCode: string) => {
    const trimmed = costCode.trim().toUpperCase();
    if (trimmed === 'DEMO/EX' || trimmed === 'BASE/GRADING' || 
        trimmed === 'DEMO/EX + BASE/GRADING' || 
        trimmed.includes('DEMO/EX') || trimmed.includes('BASE/GRADING')) {
      return 'DEMO/EX + BASE/GRADING';
    }
    if (trimmed === 'GNRL LBR' || trimmed === 'GENERAL LABOR' || trimmed === 'GENERAL') {
      return 'GENERAL LABOR';
    }
    if (trimmed === 'AC' || trimmed === 'ASPHALT') {
      return 'AC';
    }
    return trimmed;
  };

  // Filter locations by selected project
  const filteredLocations = useMemo(() => {
    let locs = locations as any[];
    
    if (selectedProject !== 'all') {
      locs = locs.filter((loc: any) => loc.projectId?.toString() === selectedProject);
    }

    // If date filtering is active, only show locations with tasks in the date range
    // Tasks use the location's database ID (numeric id), not the string locationId
    if (dateRangeType !== 'all') {
      const locationDbIdsWithTasks = new Set(
        (tasks as any[]).map((task: any) => task.locationId)
      );
      locs = locs.filter((loc: any) => locationDbIdsWithTasks.has(loc.id));
    }

    return locs;
  }, [locations, selectedProject, dateRangeType, tasks]);

  // Calculate location progress data
  const locationProgressData = useMemo(() => {
    const budgets = budgetsData;
    
    return filteredLocations.map((location: any) => {
      const locationId = location.locationId; // String ID like "1240_Barry J."
      const locationDbId = location.id; // Numeric database ID
      const projectId = location.projectId;
      const project = (projects as any[]).find((p: any) => p.id === projectId);
      
      // Get tasks for this location within the date range
      // Tasks use the location's database ID (numeric), not the string locationId
      // Use == for type coercion since IDs may be strings or numbers from different sources
      const locationTasks = (tasks as any[]).filter((task: any) => 
        String(task.locationId) === String(locationDbId)
      );
      
      // Get budget data for this location using the database ID
      const locationBudget = budgets[locationDbId] || [];
      
      // Calculate task completion (using status field like Dashboard)
      const totalTasks = locationTasks.length;
      const completedTasks = locationTasks.filter((task: any) => 
        task.status === 'complete' || task.status === 'Completed' || task.status === 'completed'
      ).length;
      const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      
      // Calculate cost code data
      const costCodeData: { [key: string]: { budgetHours: number; actualHours: number; scheduledHours: number } } = {};
      
      // Add budget hours from budget line items
      locationBudget.forEach((budgetItem: any) => {
        const costCode = budgetItem.costCode || budgetItem.code || budgetItem.category;
        const hours = parseFloat(budgetItem.hours || budgetItem.totalHours || '0') || 0;
        
        if (costCode && costCode.trim()) {
          const normalizedCostCode = normalizeCostCode(costCode);
          if (costCodeData[normalizedCostCode]) {
            costCodeData[normalizedCostCode].budgetHours += hours;
          } else {
            costCodeData[normalizedCostCode] = { budgetHours: hours, actualHours: 0, scheduledHours: 0 };
          }
        }
      });
      
      // Calculate actual hours from assignments for tasks in this location
      const taskIds = new Set(locationTasks.map((t: any) => t.id));
      const taskCostCodes: { [taskId: string]: string } = {};
      locationTasks.forEach((task: any) => {
        if (task.costCode) {
          taskCostCodes[task.id.toString()] = task.costCode;
        }
      });
      
      (assignments as any[]).forEach((assignment: any) => {
        const taskId = assignment.taskId?.toString();
        if (taskIds.has(parseInt(taskId)) && taskCostCodes[taskId]) {
          const costCode = taskCostCodes[taskId];
          const normalizedCostCode = normalizeCostCode(costCode);
          const actualHours = parseFloat(assignment.actualHours) || 0;
          const scheduledHours = parseFloat(assignment.assignedHours) || 0;
          
          if (!costCodeData[normalizedCostCode]) {
            costCodeData[normalizedCostCode] = { budgetHours: 0, actualHours: 0, scheduledHours: 0 };
          }
          
          costCodeData[normalizedCostCode].actualHours += actualHours;
          if (actualHours === 0) {
            costCodeData[normalizedCostCode].scheduledHours += scheduledHours;
          }
        }
      });
      
      // Collect task notes
      const taskNotes = locationTasks
        .filter((task: any) => task.notes && task.notes.trim())
        .map((task: any) => ({
          taskId: task.taskId,
          taskDate: task.taskDate,
          costCode: task.costCode,
          notes: task.notes
        }));
      
      return {
        location,
        project,
        locationId,
        projectName: project?.name || 'Unknown Project',
        locationName: location.name,
        totalTasks,
        completedTasks,
        completionPercentage,
        costCodeData,
        taskNotes
      };
    });
  }, [filteredLocations, tasks, assignments, budgetsData, projects]);

  // Export to Excel
  const handleExportExcel = () => {
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Summary sheet
    const summaryData = locationProgressData.map(loc => ({
      'Project': loc.projectName,
      'Location': loc.locationName,
      'Total Tasks': loc.totalTasks,
      'Completed Tasks': loc.completedTasks,
      'Completion %': `${loc.completionPercentage}%`,
    }));
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
    
    // Cost Code Details sheet
    const costCodeDetails: any[] = [];
    locationProgressData.forEach(loc => {
      Object.entries(loc.costCodeData).forEach(([costCode, data]) => {
        if (data.budgetHours > 0 || data.actualHours > 0) {
          costCodeDetails.push({
            'Project': loc.projectName,
            'Location': loc.locationName,
            'Cost Code': costCode,
            'Budget Hours': data.budgetHours.toFixed(1),
            'Actual Hours': data.actualHours.toFixed(1),
            'Scheduled Hours': data.scheduledHours.toFixed(1),
            'Remaining Hours': Math.max(0, data.budgetHours - data.actualHours).toFixed(1),
            'Progress %': data.budgetHours > 0 
              ? `${Math.min(100, Math.round((data.actualHours / data.budgetHours) * 100))}%` 
              : 'N/A'
          });
        }
      });
    });
    const costCodeSheet = XLSX.utils.json_to_sheet(costCodeDetails);
    XLSX.utils.book_append_sheet(wb, costCodeSheet, 'Cost Code Details');
    
    // Task Notes sheet
    const notesData: any[] = [];
    locationProgressData.forEach(loc => {
      loc.taskNotes.forEach((note: any) => {
        notesData.push({
          'Project': loc.projectName,
          'Location': loc.locationName,
          'Task ID': note.taskId,
          'Task Date': note.taskDate,
          'Cost Code': note.costCode,
          'Notes': note.notes
        });
      });
    });
    if (notesData.length > 0) {
      const notesSheet = XLSX.utils.json_to_sheet(notesData);
      XLSX.utils.book_append_sheet(wb, notesSheet, 'Task Notes');
    }
    
    // Generate filename with date range
    const dateStr = dateRangeType === 'all' 
      ? 'all-time' 
      : dateRangeType === 'day' 
        ? selectedDate 
        : `${dateRange.start}_to_${dateRange.end}`;
    const filename = `location_progress_report_${dateStr}.xlsx`;
    
    // Download
    XLSX.writeFile(wb, filename);
  };

  const getRemainingHoursStatus = (actualHours: number, budgetHours: number) => {
    if (budgetHours === 0) return { color: 'text-gray-500', bgColor: 'bg-gray-100' };
    const remainingHours = budgetHours - actualHours;
    const percentageRemaining = (remainingHours / budgetHours) * 100;
    
    if (remainingHours < 0) return { color: 'text-red-600', bgColor: 'bg-red-100' };
    if (percentageRemaining <= 10) return { color: 'text-orange-600', bgColor: 'bg-orange-100' };
    if (percentageRemaining <= 25) return { color: 'text-yellow-600', bgColor: 'bg-yellow-100' };
    return { color: 'text-green-600', bgColor: 'bg-green-100' };
  };

  return (
    <div className="flex flex-col h-full">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Location Progress Report</h1>
            <p className="text-gray-600 text-sm mt-1">View and export location progress by project and date range</p>
          </div>
          <Button 
            onClick={handleExportExcel} 
            className="bg-green-600 hover:bg-green-700"
            disabled={locationProgressData.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export to Excel
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <main className="p-6">
          {/* Filters */}
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="w-5 h-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {/* Project Filter */}
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Project</label>
                  <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger className="w-[250px]">
                      <Building2 className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Select Project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      {(projects as any[])
                        .filter((p: any) => !p.isInactive)
                        .sort((a: any, b: any) => a.name.localeCompare(b.name))
                        .map((project: any) => (
                          <SelectItem key={project.id} value={project.id.toString()}>
                            {project.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Range Type */}
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Date Range</label>
                  <Select value={dateRangeType} onValueChange={(v) => setDateRangeType(v as DateRangeType)}>
                    <SelectTrigger className="w-[150px]">
                      <Calendar className="w-4 h-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="day">Single Day</SelectItem>
                      <SelectItem value="week">Week</SelectItem>
                      <SelectItem value="month">Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Picker (shown when not "all") */}
                {dateRangeType !== 'all' && (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">
                      {dateRangeType === 'day' ? 'Date' : dateRangeType === 'week' ? 'Week of' : 'Month'}
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="px-3 py-2 border rounded-md w-[180px]"
                    />
                  </div>
                )}

                {/* Date Range Display */}
                {dateRangeType !== 'all' && (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Showing</label>
                    <div className="px-3 py-2 bg-gray-100 rounded-md text-sm">
                      {dateRange.start === dateRange.end 
                        ? format(parseISO(dateRange.start), 'MMM d, yyyy')
                        : `${format(parseISO(dateRange.start), 'MMM d')} - ${format(parseISO(dateRange.end), 'MMM d, yyyy')}`}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Results Summary */}
          <div className="mb-4 text-sm text-gray-600">
            Showing {locationProgressData.length} location{locationProgressData.length !== 1 ? 's' : ''}
            {selectedProject !== 'all' && ` in selected project`}
            {dateRangeType !== 'all' && ` with tasks in selected ${dateRangeType}`}
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-6 w-1/3 mb-4" />
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Location Cards */}
          {!isLoading && locationProgressData.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-gray-500">
                <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No locations found matching your filters.</p>
                <p className="text-sm mt-2">Try adjusting the project or date range filters.</p>
              </CardContent>
            </Card>
          )}

          {!isLoading && locationProgressData.map((locData, index) => (
            <Card key={locData.locationId || index} className="mb-4">
              <CardContent className="p-6">
                {/* Location Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link href={`/projects/${locData.project?.id}`}>
                        <span className="text-sm text-gray-500 hover:text-blue-600 cursor-pointer">
                          {locData.projectName}
                        </span>
                      </Link>
                      <span className="text-gray-400">-</span>
                      <Link href={`/locations/${locData.location?.id}`}>
                        <span className="font-semibold text-lg hover:text-blue-600 cursor-pointer underline">
                          {locData.locationName}
                        </span>
                      </Link>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-semibold">
                      {locData.completionPercentage}% Complete
                    </span>
                    <span className="text-sm text-gray-500 ml-2">
                      ({locData.completedTasks}/{locData.totalTasks} tasks)
                    </span>
                  </div>
                </div>

                {/* Overall Progress Bar */}
                <Progress value={locData.completionPercentage} className="h-3 mb-6" />

                {/* Cost Code Progress */}
                {Object.keys(locData.costCodeData).length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-700">Cost Code Progress</h4>
                      <span className="text-xs text-gray-500 italic">Click location for full actual hours</span>
                    </div>
                    <div className="space-y-3">
                      {Object.entries(locData.costCodeData)
                        .filter(([_, data]) => data.budgetHours > 0 || data.actualHours > 0)
                        .sort(([_, a], [__, b]) => b.budgetHours - a.budgetHours)
                        .map(([costCode, data]) => {
                          const totalHours = data.actualHours + data.scheduledHours;
                          const remainingHours = Math.max(0, data.budgetHours - totalHours);
                          const maxHours = Math.max(data.budgetHours, totalHours);
                          const actualWidth = maxHours > 0 ? (data.actualHours / maxHours) * 100 : 0;
                          const scheduledWidth = maxHours > 0 ? (data.scheduledHours / maxHours) * 100 : 0;
                          const status = getRemainingHoursStatus(data.actualHours, data.budgetHours);

                          return (
                            <div key={costCode}>
                              <div className="flex items-center justify-between text-sm mb-1">
                                <span className="font-medium">{costCode}</span>
                                <span className="text-gray-600">
                                  {data.actualHours.toFixed(1)}h / {data.budgetHours.toFixed(1)}h
                                  {data.scheduledHours > 0 && (
                                    <span className="text-blue-500 ml-1">
                                      (+{data.scheduledHours.toFixed(0)}h scheduled)
                                    </span>
                                  )}
                                </span>
                              </div>
                              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full flex">
                                  <div 
                                    className="bg-green-500 h-full" 
                                    style={{ width: `${actualWidth}%` }}
                                  />
                                  <div 
                                    className="bg-blue-300 h-full" 
                                    style={{ width: `${scheduledWidth}%` }}
                                  />
                                </div>
                              </div>
                              <div className={`text-xs mt-0.5 ${status.color}`}>
                                {remainingHours.toFixed(1)}h remaining
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Task Stats */}
                <div className="flex items-center gap-4 text-sm text-gray-600 border-t pt-4">
                  <span>Tasks: {locData.totalTasks}</span>
                  <span>Completed: {locData.completedTasks}</span>
                </div>

                {/* Task Notes */}
                {locData.taskNotes.length > 0 && (
                  <div className="mt-4 border-t pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <StickyNote className="w-4 h-4 text-yellow-600" />
                      <h4 className="font-medium text-gray-700">Task Notes ({locData.taskNotes.length})</h4>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {locData.taskNotes.map((note: any, noteIdx: number) => (
                        <div key={noteIdx} className="bg-yellow-50 border border-yellow-200 rounded p-2 text-sm">
                          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                            <Badge variant="outline" className="text-xs">{note.costCode}</Badge>
                            <span>{note.taskDate}</span>
                          </div>
                          <p className="text-gray-700">{note.notes}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </main>
      </div>
    </div>
  );
}
