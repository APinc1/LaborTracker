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
import { ArrowLeft, MapPin, Calendar, User, DollarSign, Home, Building2, Plus, Edit, Trash2, Clock, FileSpreadsheet, Upload, FolderOpen } from "lucide-react";
import { format } from "date-fns";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DialogDescription } from "@/components/ui/dialog";
import * as XLSX from 'xlsx';
import { parseSW62ExcelRowForProject } from "@/lib/customExcelParser";

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
  const [showBudgetUploadDialog, setShowBudgetUploadDialog] = useState(false);
  const [isUploadingBudget, setIsUploadingBudget] = useState(false);
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

  // Fetch project master budget items
  const { data: projectBudgetItems = [], isLoading: projectBudgetLoading } = useQuery({
    queryKey: ["/api/projects", projectId, "budget"],
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

  // Handle project budget Excel upload
  const handleProjectBudgetUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsUploadingBudget(true);

      try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
        
        // Find header row and parse data (using SW62 format)
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(20, jsonData.length); i++) {
          const row = jsonData[i];
          if (row && row.length > 0) {
            const rowStr = row.join(' ').toLowerCase();
            if (rowStr.includes('line item') || rowStr.includes('description') || rowStr.includes('cost code')) {
              headerRowIndex = i;
              break;
            }
          }
        }

        if (headerRowIndex === -1) {
          headerRowIndex = 0;
        }

        const dataRows = jsonData.slice(headerRowIndex + 1);
        const parsedItems: any[] = [];

        for (const row of dataRows) {
          if (!row || row.length === 0 || !row[0]) continue;
          
          const lineItemNumber = String(row[0] || '').trim();
          if (!lineItemNumber || lineItemNumber === '') continue;

          try {
            const parsedItem = parseSW62ExcelRowForProject(row);
            if (parsedItem) {
              parsedItems.push(parsedItem);
            }
          } catch (err) {
            console.warn('Failed to parse row:', row, err);
          }
        }

        if (parsedItems.length === 0) {
          toast({
            title: "No data found",
            description: "The Excel file did not contain valid budget data.",
            variant: "destructive",
          });
          setIsUploadingBudget(false);
          return;
        }

        // Upload to API
        const response = await apiRequest(`/api/projects/${projectId}/budget/import`, {
          method: "POST",
          body: JSON.stringify({ items: parsedItems }),
        });

        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "budget"] });
        setShowBudgetUploadDialog(false);
        
        toast({
          title: "Budget imported",
          description: `Successfully imported ${parsedItems.length} budget items to project master budget.`,
        });
      } catch (error: any) {
        console.error('Budget upload error:', error);
        toast({
          title: "Import failed",
          description: error?.message || "Failed to import budget file.",
          variant: "destructive",
        });
      } finally {
        setIsUploadingBudget(false);
      }
    };
    input.click();
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

        {/* Master Budget */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Master Budget
                {projectBudgetItems.length > 0 && (
                  <Badge variant="secondary">{projectBudgetItems.length} items</Badge>
                )}
              </CardTitle>
              <div className="flex gap-2">
                <Button 
                  onClick={() => setShowBudgetUploadDialog(true)}
                  size="sm"
                  variant="outline"
                  className="flex items-center gap-2"
                  data-testid="button-upload-master-budget"
                >
                  <Upload className="w-4 h-4" />
                  Upload Budget
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {projectBudgetLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : projectBudgetItems.length === 0 ? (
              <div className="text-center py-8">
                <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No master budget uploaded</p>
                <p className="text-sm text-gray-400 mt-2">
                  Upload an Excel file to set up the project's master budget
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center space-x-2">
                    <FolderOpen className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-600">Total Line Items</p>
                      <p className="font-medium">{projectBudgetItems.length}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <DollarSign className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-600">Total Budget</p>
                      <p className="font-medium">
                        ${projectBudgetItems.reduce((sum: number, item: any) => 
                          sum + (parseFloat(item.budgetTotal) || 0), 0
                        ).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-600">Cost Codes</p>
                      <p className="font-medium">
                        {new Set(projectBudgetItems.map((item: any) => item.costCode).filter(Boolean)).size} unique
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Full budget items table */}
                <div className="border rounded-md overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow>
                        <TableHead className="whitespace-nowrap sticky left-0 bg-white z-20">Line Item</TableHead>
                        <TableHead className="whitespace-nowrap min-w-[200px]">Description</TableHead>
                        <TableHead className="whitespace-nowrap">Cost Code</TableHead>
                        <TableHead className="whitespace-nowrap">Unit</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Qty</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Unit Cost</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Unit Total</TableHead>
                        <TableHead className="whitespace-nowrap">Conv UM</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Conv Qty</TableHead>
                        <TableHead className="whitespace-nowrap text-right">PX</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Hours</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Labor Cost</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Equipment</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Trucking</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Dump Fees</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Material</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Sub</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Budget</TableHead>
                        <TableHead className="whitespace-nowrap text-right">Billings</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectBudgetItems.map((item: any) => (
                        <TableRow key={item.id} className={item.isGroup ? 'bg-gray-50 font-semibold' : ''}>
                          <TableCell className="font-medium whitespace-nowrap sticky left-0 bg-inherit">{item.lineItemNumber}</TableCell>
                          <TableCell className="max-w-[300px]">{item.lineItemName}</TableCell>
                          <TableCell>{item.costCode || '-'}</TableCell>
                          <TableCell>{item.unconvertedUnitOfMeasure || '-'}</TableCell>
                          <TableCell className="text-right">{parseFloat(item.unconvertedQty || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">${parseFloat(item.unitCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">${parseFloat(item.unitTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell>{item.convertedUnitOfMeasure || '-'}</TableCell>
                          <TableCell className="text-right">{parseFloat(item.convertedQty || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">{parseFloat(item.productionRate || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">{parseFloat(item.hours || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">${parseFloat(item.laborCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">${parseFloat(item.equipmentCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">${parseFloat(item.truckingCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">${parseFloat(item.dumpFeesCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">${parseFloat(item.materialCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">${parseFloat(item.subcontractorCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">${parseFloat(item.budgetTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                          <TableCell className="text-right">${parseFloat(item.billing || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
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

        {/* Budget Upload Dialog */}
        <Dialog open={showBudgetUploadDialog} onOpenChange={setShowBudgetUploadDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Master Budget</DialogTitle>
              <DialogDescription>
                Upload an Excel file containing the project's master budget. 
                This will be used as the source for location budgets.
                The file should follow the SW62 Excel format (21 columns).
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600 mb-4">
                  Click the button below to select an Excel file
                </p>
                <Button 
                  onClick={handleProjectBudgetUpload}
                  disabled={isUploadingBudget}
                  data-testid="button-select-budget-file"
                >
                  {isUploadingBudget ? (
                    <>
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mr-2" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Select Excel File
                    </>
                  )}
                </Button>
              </div>
              {projectBudgetItems.length > 0 && (
                <p className="text-sm text-amber-600 mt-4">
                  Note: Uploading a new budget will replace the existing {projectBudgetItems.length} items.
                </p>
              )}
            </div>
            <div className="flex justify-end">
              <Button 
                variant="outline" 
                onClick={() => setShowBudgetUploadDialog(false)}
                disabled={isUploadingBudget}
              >
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}