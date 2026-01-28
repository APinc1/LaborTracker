import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Download, Calendar, MapPin, Building2, Filter, Play, StickyNote, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import * as XLSX from 'xlsx';

type DateRangeType = 'day' | 'week' | 'month' | 'all';
type ReportType = 'location_progress' | null;

export default function Reports() {
  const today = new Date();
  const [selectedReportType, setSelectedReportType] = useState<ReportType>(null);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [dateRangeType, setDateRangeType] = useState<DateRangeType>('all');
  const [selectedDate, setSelectedDate] = useState<string>(format(today, 'yyyy-MM-dd'));
  const [reportRun, setReportRun] = useState(false);

  // Only fetch projects for the filter dropdown (lightweight)
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 30000,
  });

  // Calculate date range
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

  // Only fetch data after "Run Report" is clicked
  const { data: locations = [], isLoading: locationsLoading, refetch: refetchLocations } = useQuery({
    queryKey: ["/api/locations"],
    staleTime: 30000,
    enabled: reportRun,
  });

  // Always fetch ALL tasks for complete progress calculations
  const { data: allTasks = [], isLoading: allTasksLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", "2020-01-01", "2030-12-31", "all-tasks"],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/date-range/2020-01-01/2030-12-31?limit=10000`);
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
    staleTime: 30000,
    enabled: reportRun,
  });

  // Fetch tasks for the selected date range (only used to filter which locations to show)
  const { data: filteredTasks = [], isLoading: filteredTasksLoading } = useQuery({
    queryKey: ["/api/tasks/date-range", dateRange.start, dateRange.end, "filter-tasks"],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/date-range/${dateRange.start}/${dateRange.end}?limit=10000`);
      if (!response.ok) throw new Error('Failed to fetch tasks');
      return response.json();
    },
    staleTime: 30000,
    enabled: reportRun && dateRangeType !== 'all',
  });

  const { data: assignments = [], isLoading: assignmentsLoading, refetch: refetchAssignments } = useQuery({
    queryKey: ["/api/assignments"],
    staleTime: 30000,
    enabled: reportRun,
  });

  // Get location IDs for bulk budget fetch
  const locationDbIds = useMemo(() => {
    return (locations as any[]).map((loc: any) => loc.id).filter(Boolean);
  }, [locations]);

  const { data: allBudgetItems = [], isLoading: budgetLoading, refetch: refetchBudgets } = useQuery({
    queryKey: ["/api/budget/bulk", locationDbIds.join(',')],
    queryFn: async () => {
      if (locationDbIds.length === 0) return [];
      const response = await fetch(`/api/budget/bulk?locationIds=${locationDbIds.join(',')}`);
      if (!response.ok) throw new Error('Failed to fetch budgets');
      return response.json();
    },
    enabled: reportRun && locationDbIds.length > 0,
    staleTime: 30000,
  });

  const isLoading = reportRun && (locationsLoading || allTasksLoading || filteredTasksLoading || assignmentsLoading || budgetLoading);

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

  // Filter locations by selected project and date range
  // Date range only filters which locations to SHOW, not the data within each location
  const filteredLocations = useMemo(() => {
    if (!reportRun) return [];
    
    let locs = locations as any[];
    
    if (selectedProject !== 'all') {
      locs = locs.filter((loc: any) => loc.projectId?.toString() === selectedProject);
    }

    // If date filtering is active, only show locations that have tasks on the selected day/range
    // But we still use allTasks for progress calculations
    if (dateRangeType !== 'all') {
      const locationDbIdsWithTasksInRange = new Set(
        (filteredTasks as any[]).map((task: any) => task.locationId)
      );
      locs = locs.filter((loc: any) => locationDbIdsWithTasksInRange.has(loc.id));
    }

    return locs;
  }, [locations, selectedProject, dateRangeType, filteredTasks, reportRun]);

  // Calculate location progress data
  const locationProgressData = useMemo(() => {
    if (!reportRun) return [];
    
    const budgets = budgetsData;
    
    return filteredLocations.map((location: any) => {
      const locationId = location.locationId;
      const locationDbId = location.id;
      const projectId = location.projectId;
      const project = (projects as any[]).find((p: any) => p.id === projectId);
      
      // Use ALL tasks for progress calculation (not filtered by date)
      const locationTasks = (allTasks as any[]).filter((task: any) => 
        String(task.locationId) === String(locationDbId)
      );
      
      const locationBudget = budgets[locationDbId] || [];
      
      const totalTasks = locationTasks.length;
      const completedTasks = locationTasks.filter((task: any) => 
        task.status === 'complete' || task.status === 'Completed' || task.status === 'completed'
      ).length;
      const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
      
      const costCodeData: { [key: string]: { budgetHours: number; actualHours: number; scheduledHours: number } } = {};
      
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
  }, [filteredLocations, allTasks, assignments, budgetsData, projects, reportRun]);

  // Handle Run Report button
  const handleRunReport = () => {
    setReportRun(true);
  };

  // Reset when changing report type
  const handleReportTypeChange = (type: ReportType) => {
    setSelectedReportType(type);
    setReportRun(false);
  };

  // Export to Excel
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    
    const summaryData = locationProgressData.map(loc => ({
      'Project': loc.projectName,
      'Location': loc.locationName,
      'Total Tasks': loc.totalTasks,
      'Completed Tasks': loc.completedTasks,
      'Completion %': `${loc.completionPercentage}%`,
    }));
    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
    
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
    
    const dateStr = dateRangeType === 'all' 
      ? 'all-time' 
      : dateRangeType === 'day' 
        ? selectedDate 
        : `${dateRange.start}_to_${dateRange.end}`;
    const filename = `location_progress_report_${dateStr}.xlsx`;
    
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
            <h1 className="text-2xl font-bold text-gray-800">Reports</h1>
            <p className="text-gray-600 text-sm mt-1">Generate and export project reports</p>
          </div>
          {reportRun && locationProgressData.length > 0 && (
            <Button 
              onClick={handleExportExcel} 
              className="bg-green-600 hover:bg-green-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Export to Excel
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <main className="p-6">
          {/* Step 1: Select Report Type */}
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="w-5 h-5" />
                Step 1: Select Report Type
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <button
                  onClick={() => handleReportTypeChange('location_progress')}
                  className={`p-4 border-2 rounded-lg text-left transition-all ${
                    selectedReportType === 'location_progress'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      selectedReportType === 'location_progress' ? 'bg-blue-100' : 'bg-gray-100'
                    }`}>
                      <MapPin className={`w-5 h-5 ${
                        selectedReportType === 'location_progress' ? 'text-blue-600' : 'text-gray-600'
                      }`} />
                    </div>
                    <div>
                      <h3 className="font-semibold">Location Progress Report</h3>
                      <p className="text-sm text-gray-500">View progress by location with cost code breakdown</p>
                    </div>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Configure Filters (only shown after selecting report type) */}
          {selectedReportType && (
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Filter className="w-5 h-5" />
                  Step 2: Configure Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4 mb-6">
                  {/* Project Filter */}
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Project</label>
                    <Select value={selectedProject} onValueChange={(v) => { setSelectedProject(v); setReportRun(false); }}>
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
                    <Select value={dateRangeType} onValueChange={(v) => { setDateRangeType(v as DateRangeType); setReportRun(false); }}>
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
                        onChange={(e) => { setSelectedDate(e.target.value); setReportRun(false); }}
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

                {/* Run Report Button */}
                <Button 
                  onClick={handleRunReport}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={isLoading}
                >
                  <Play className="w-4 h-4 mr-2" />
                  {isLoading ? 'Running...' : 'Run Report'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Report Results (only shown after running report) */}
          {reportRun && (
            <>
              {/* Results Summary */}
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Showing {locationProgressData.length} location{locationProgressData.length !== 1 ? 's' : ''}
                  {selectedProject !== 'all' && ` in selected project`}
                  {dateRangeType !== 'all' && ` with tasks in selected ${dateRangeType}`}
                </div>
                <h2 className="text-lg font-semibold text-gray-700">Location Progress Report</h2>
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
            </>
          )}

          {/* Initial State - No report selected */}
          {!selectedReportType && (
            <Card>
              <CardContent className="p-12 text-center text-gray-500">
                <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">Select a report type to get started</p>
                <p className="text-sm mt-2">Choose from the available reports above to configure and generate your report.</p>
              </CardContent>
            </Card>
          )}

          {/* Report type selected but not run */}
          {selectedReportType && !reportRun && (
            <Card>
              <CardContent className="p-12 text-center text-gray-500">
                <Play className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">Configure your filters and click "Run Report"</p>
                <p className="text-sm mt-2">Adjust the project and date range filters above, then click the button to generate your report.</p>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
