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
import { ArrowLeft, MapPin, Calendar, User, DollarSign, Home, Building2, Plus, Edit, Trash2, Clock, FileSpreadsheet, Upload, Download, FolderOpen, ChevronDown, ChevronRight, Maximize2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogDescription } from "@/components/ui/dialog";
import ProjectActualsModal from "./ProjectActualsModal";
import * as XLSX from 'xlsx';
import { parseSW62ExcelRow } from "@/lib/customExcelParser";
import { parseExcelRowToBudgetItem } from "@/lib/budgetCalculations";
import { downloadBudgetTemplate, FORMAT_REQUIREMENTS, validateBudgetData, ValidationResult, GroupedError } from "@/lib/budgetTemplateUtils";
import LocationActualsModal from "./LocationActualsModal";

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
  const [newLocationStatus, setNewLocationStatus] = useState<string>("active");
  const [newLocationSuspensionReason, setNewLocationSuspensionReason] = useState("");
  const [editingLocation, setEditingLocation] = useState<any>(null);
  const [showActualsModal, setShowActualsModal] = useState(false);
  const [actualsLocationId, setActualsLocationId] = useState<number | null>(null);
  const [previousLocationStatus, setPreviousLocationStatus] = useState<string>("active");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<any>(null);
  const [showBudgetUploadDialog, setShowBudgetUploadDialog] = useState(false);
  const [isUploadingBudget, setIsUploadingBudget] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [costCodeFilter, setCostCodeFilter] = useState<string>("all");
  const [showExpandedBudgetDialog, setShowExpandedBudgetDialog] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [expandedErrorGroups, setExpandedErrorGroups] = useState<Set<string>>(new Set());
  const [showExampleBudgetDialog, setShowExampleBudgetDialog] = useState(false);
  const [showEditProjectDialog, setShowEditProjectDialog] = useState(false);
  const [showProjectActualsModal, setShowProjectActualsModal] = useState(false);
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectId, setEditProjectId] = useState("");
  const [editProjectAddress, setEditProjectAddress] = useState("");
  const [editProjectStartDate, setEditProjectStartDate] = useState("");
  const [editProjectEndDate, setEditProjectEndDate] = useState("");
  const { toast } = useToast();

  const toggleGroupCollapse = (lineItemNumber: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(lineItemNumber)) {
        newSet.delete(lineItemNumber);
      } else {
        newSet.add(lineItemNumber);
      }
      return newSet;
    });
  };

  const isChildOf = (childLineItem: string, parentLineItem: string): boolean => {
    return childLineItem.startsWith(parentLineItem + '.');
  };

  const getParentLineItem = (lineItem: string): string | null => {
    const parts = lineItem.split('.');
    if (parts.length > 1) {
      return parts.slice(0, -1).join('.');
    }
    return null;
  };

  const isItemVisible = (item: any, allItems: any[]): boolean => {
    const parent = getParentLineItem(item.lineItemNumber);
    if (!parent) return true;
    
    if (collapsedGroups.has(parent)) return false;
    
    const parentItem = allItems.find((i: any) => i.lineItemNumber === parent);
    if (parentItem) {
      return isItemVisible(parentItem, allItems);
    }
    return true;
  };

  const hasChildren = (lineItem: string, allItems: any[]): boolean => {
    return allItems.some((item: any) => isChildOf(item.lineItemNumber, lineItem));
  };

  const getCostCodeSummary = () => {
    const summary: Record<string, { hours: number; budget: number; lineItems: number; convQty: number; pxValues: number[]; unitCounts: Record<string, number> }> = {};
    projectBudgetItems.forEach((item: any) => {
      const costCode = item.costCode || 'Uncategorized';
      if (!summary[costCode]) {
        summary[costCode] = { hours: 0, budget: 0, lineItems: 0, convQty: 0, pxValues: [], unitCounts: {} };
      }
      summary[costCode].hours += parseFloat(item.hours) || 0;
      summary[costCode].budget += parseFloat(item.budgetTotal) || 0;
      summary[costCode].lineItems += 1;
      summary[costCode].convQty += parseFloat(item.convertedQty) || 0;
      const px = parseFloat(item.productionRate);
      if (!isNaN(px) && px > 0) {
        summary[costCode].pxValues.push(px);
      }
      const unit = item.convertedUnitOfMeasure || '';
      if (unit) {
        summary[costCode].unitCounts[unit] = (summary[costCode].unitCounts[unit] || 0) + 1;
      }
    });
    return Object.entries(summary)
      .map(([code, data]) => {
        const sortedPx = data.pxValues.sort((a, b) => a - b);
        const medianPx = sortedPx.length > 0 
          ? sortedPx.length % 2 === 0 
            ? (sortedPx[sortedPx.length / 2 - 1] + sortedPx[sortedPx.length / 2]) / 2
            : sortedPx[Math.floor(sortedPx.length / 2)]
          : 0;
        let maxCount = 0;
        let convUnit = '';
        Object.entries(data.unitCounts).forEach(([unit, count]) => {
          if (count > maxCount) {
            maxCount = count;
            convUnit = unit;
          }
        });
        return { code, hours: data.hours, budget: data.budget, lineItems: data.lineItems, convQty: data.convQty, medianPx, convUnit };
      })
      .sort((a, b) => b.budget - a.budget);
  };

  const getUniqueCostCodes = () => {
    const codes = new Set<string>();
    projectBudgetItems.forEach((item: any) => {
      if (item.costCode) codes.add(item.costCode);
    });
    return Array.from(codes).sort();
  };

  const getFilteredBudgetItems = () => {
    if (costCodeFilter === "all") return projectBudgetItems;
    return projectBudgetItems.filter((item: any) => item.costCode === costCodeFilter);
  };
  
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
      setShowAddLocationDialog(false);
      setEditingLocation(null);
      setNewLocationName("");
      setNewLocationDescription("");
      setNewLocationStartDate("");
      setNewLocationEndDate("");
      setNewLocationStatus("active");
      setNewLocationSuspensionReason("");
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

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest(`/api/projects/${projectId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowEditProjectDialog(false);
      toast({
        title: "Project updated",
        description: "Project has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update project",
        variant: "destructive",
      });
    },
  });

  const handleEditProject = () => {
    if (project) {
      setEditProjectName(project.name || "");
      setEditProjectId(project.projectId || "");
      setEditProjectAddress(project.address || "");
      setEditProjectStartDate(project.startDate || "");
      setEditProjectEndDate(project.endDate || "");
      setShowEditProjectDialog(true);
    }
  };

  const handleSaveProject = () => {
    updateProjectMutation.mutate({
      name: editProjectName,
      projectId: editProjectId,
      address: editProjectAddress,
      startDate: editProjectStartDate || null,
      endDate: editProjectEndDate || null,
    });
  };

  const handleEditLocation = (location: any) => {
    setEditingLocation(location);
    setNewLocationName(location.name);
    setNewLocationDescription(location.description || "");
    setNewLocationStartDate(location.startDate || "");
    setNewLocationEndDate(location.endDate || "");
    setNewLocationStatus(location.status || "active");
    setNewLocationSuspensionReason(location.suspensionReason || "");
    setPreviousLocationStatus(location.status || "active");
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

  // Handle project budget Excel upload - uses same logic as location budget import
  const handleProjectBudgetUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsUploadingBudget(true);
      setValidationResult(null);

      try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        // Use the "full location" sheet, "Line Items" sheet, or first sheet (same as location budget)
        let sheetName = workbook.SheetNames[0];
        if (workbook.SheetNames.includes('full location')) {
          sheetName = 'full location';
        } else if (workbook.SheetNames.includes('Line Items')) {
          sheetName = 'Line Items';
        }
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON array, using raw:false to preserve cell formatting (e.g., 15.10 vs 15.1)
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' }) as any[][];
        
        // Validate the data before processing
        const validation = validateBudgetData(jsonData);
        setValidationResult(validation);
        setExpandedErrorGroups(new Set());
        
        if (!validation.isValid) {
          toast({
            title: "Validation Failed",
            description: `Found ${validation.errors.length} error(s) in the file. Please fix them and try again.`,
            variant: "destructive",
          });
          setIsUploadingBudget(false);
          return;
        }
        
        // Show warnings if any
        if (validation.warnings.length > 0) {
          toast({
            title: "Warning",
            description: validation.warnings[0],
          });
        }
        
        // Skip header row and process data (same as location budget)
        const parsedItems: any[] = [];
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          
          // Try SW62 format first, then fall back to standard format (same as location budget)
          let budgetItem = parseSW62ExcelRow(row, 0); // Use 0 as placeholder locationId
          if (!budgetItem) {
            budgetItem = parseExcelRowToBudgetItem(row, 0);
          }
          
          if (budgetItem) {
            // Convert to project budget format (remove locationId, add isGroup flag)
            const projectItem = {
              lineItemNumber: budgetItem.lineItemNumber,
              lineItemName: budgetItem.lineItemName,
              costCode: budgetItem.costCode,
              unconvertedUnitOfMeasure: budgetItem.unconvertedUnitOfMeasure,
              unconvertedQty: budgetItem.unconvertedQty,
              unitCost: budgetItem.unitCost,
              unitTotal: budgetItem.unitTotal,
              conversionFactor: budgetItem.conversionFactor || "1",
              convertedUnitOfMeasure: budgetItem.convertedUnitOfMeasure,
              convertedQty: budgetItem.convertedQty,
              productionRate: budgetItem.productionRate,
              hours: budgetItem.hours,
              laborCost: budgetItem.laborCost,
              equipmentCost: budgetItem.equipmentCost,
              truckingCost: budgetItem.truckingCost,
              dumpFeesCost: budgetItem.dumpFeesCost,
              materialCost: budgetItem.materialCost,
              subcontractorCost: budgetItem.subcontractorCost,
              budgetTotal: budgetItem.budgetTotal,
              billing: budgetItem.billing,
              isGroup: false,
            };
            parsedItems.push(projectItem);
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
        setValidationResult(null);
        
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

    // Validate suspension reason if status is suspended
    if (newLocationStatus === "suspended" && !newLocationSuspensionReason.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a reason for suspending this location",
        variant: "destructive",
      });
      return;
    }

    const locationData: any = {
      name: newLocationName.trim(),
      description: newLocationDescription.trim(),
      projectId: parseInt(projectId),
      status: newLocationStatus,
      suspensionReason: newLocationStatus === "suspended" ? newLocationSuspensionReason.trim() : null,
    };

    // Add start and end dates if provided
    if (newLocationStartDate) {
      locationData.startDate = newLocationStartDate;
    }
    if (newLocationEndDate) {
      locationData.endDate = newLocationEndDate;
    }

    // Check if status changed to completed or suspended - need to prompt for actuals
    // This should trigger when changing TO completed/suspended from any other status
    const statusChangedToCompletedOrSuspended = 
      editingLocation && 
      previousLocationStatus !== newLocationStatus &&
      (newLocationStatus === "completed" || newLocationStatus === "suspended");

    if (editingLocation) {
      editLocationMutation.mutate({
        locationId: editingLocation.locationId,
        data: locationData,
      }, {
        onSuccess: () => {
          if (statusChangedToCompletedOrSuspended) {
            setActualsLocationId(editingLocation.id);
            setShowActualsModal(true);
          }
        }
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
    <div className="flex flex-col h-full">
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 px-6 py-4">
        {/* Breadcrumb Navigation */}
        <div className="mb-2">
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
      <div className="flex-1 overflow-y-auto">
      <main className="p-6">
        {/* Project Overview */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                Project Overview
                <Badge variant="outline">{project.projectId}</Badge>
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleEditProject}
                data-testid="button-edit-project"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit Project
              </Button>
            </div>
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
                  onClick={() => downloadBudgetTemplate()}
                  size="sm"
                  variant="outline"
                  className="flex items-center gap-2"
                  data-testid="button-download-budget-template"
                >
                  <Download className="w-4 h-4" />
                  Download Template
                </Button>
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
                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </div>

                {/* Cost Code Summary */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-900">Cost Code Summary</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {getCostCodeSummary().map((summary) => (
                      <div key={summary.code} className="bg-white border rounded-lg p-4 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <h5 className="font-semibold text-gray-900">{summary.code}</h5>
                          <span className="text-sm text-gray-500">{summary.lineItems} items</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                          <div>
                            <p className="text-xs text-gray-500">Conv. Qty{summary.convUnit ? ` (${summary.convUnit})` : ''}</p>
                            <p className="font-medium text-gray-900">{summary.convQty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Median PX</p>
                            <p className="font-medium text-gray-900">{summary.medianPx.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Hours</p>
                            <p className="font-medium text-gray-900">{summary.hours.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Value</p>
                            <p className="font-medium text-blue-600">${summary.budget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Budget Line Items Header */}
                <div className="flex items-center justify-between mt-8 mb-4">
                  <h4 className="font-semibold text-gray-900 text-lg">Budget Line Items</h4>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Filter by Cost Code:</span>
                      <Select value={costCodeFilter} onValueChange={setCostCodeFilter}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="All Cost Codes" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Cost Codes</SelectItem>
                          {getUniqueCostCodes().map((code) => (
                            <SelectItem key={code} value={code}>{code}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowExpandedBudgetDialog(true)}
                      className="flex items-center gap-1"
                      title="Expand table"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowProjectActualsModal(true)}
                      className="flex items-center gap-1"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      View Actuals
                    </Button>
                  </div>
                </div>

                {/* Full budget items table with frozen columns */}
                <div className="border rounded-md overflow-hidden">
                  <div className="overflow-auto max-h-[250px]">
                    <table className="w-full min-w-[1400px] border-collapse sticky-table">
                      <thead className="bg-gray-50 sticky top-0 z-10">
                        <tr className="border-b">
                          <th className="w-20 sticky left-0 top-0 bg-gray-100 border-r z-20 px-4 py-3 text-left font-medium text-gray-600" style={{position: 'sticky', left: '0px', top: '0px'}}>Line Item</th>
                          <th className="min-w-60 sticky top-0 bg-gray-100 border-r z-20 px-4 py-3 text-left font-medium text-gray-600" style={{position: 'sticky', left: '80px', top: '0px'}}>Description</th>
                          <th className="w-20 sticky top-0 bg-gray-100 px-4 py-3 text-left font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Cost Code</th>
                          <th className="w-16 sticky top-0 bg-gray-100 px-4 py-3 text-center font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Unit</th>
                          <th className="w-20 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Qty</th>
                          <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Unit Cost</th>
                          <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Unit Total</th>
                          <th className="w-20 sticky top-0 bg-gray-100 px-4 py-3 text-center font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Conv. UM</th>
                          <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Conv. Qty</th>
                          <th className="w-20 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>PX</th>
                          <th className="w-20 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Hours</th>
                          <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Labor Cost</th>
                          <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Equipment</th>
                          <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Trucking</th>
                          <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Dump Fees</th>
                          <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Material</th>
                          <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Sub</th>
                          <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Budget</th>
                          <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Billings</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getFilteredBudgetItems()
                          .filter((item: any) => isItemVisible(item, getFilteredBudgetItems()))
                          .map((item: any) => {
                            const filteredItems = getFilteredBudgetItems();
                            const itemHasChildren = hasChildren(item.lineItemNumber, filteredItems);
                            const isCollapsed = collapsedGroups.has(item.lineItemNumber);
                            const indent = (item.lineItemNumber.split('.').length - 1) * 16;
                            const isParent = itemHasChildren || item.isGroup;
                            
                            return (
                              <tr 
                                key={item.id} 
                                className={`${isParent ? 'bg-gray-50' : 'bg-white'} hover:bg-blue-50 border-b`}
                              >
                                <td 
                                  className={`font-medium sticky left-0 border-r z-10 px-4 py-3 ${isParent ? 'bg-gray-100' : 'bg-gray-100'}`}
                                  style={{ position: 'sticky', left: '0px', paddingLeft: `${16 + indent}px` }}
                                >
                                  <div className="flex items-center">
                                    {itemHasChildren && (
                                      <button 
                                        onClick={() => toggleGroupCollapse(item.lineItemNumber)}
                                        className="mr-1 p-0.5 hover:bg-gray-200 rounded text-gray-500"
                                      >
                                        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                      </button>
                                    )}
                                    {!itemHasChildren && <span className="w-5" />}
                                    <span className={isParent ? 'font-semibold' : ''}>{item.lineItemNumber}</span>
                                  </div>
                                </td>
                                <td 
                                  className={`max-w-60 sticky border-r z-10 px-4 py-3 ${isParent ? 'bg-gray-100 font-semibold' : 'bg-gray-100'}`}
                                  style={{ position: 'sticky', left: '80px' }}
                                  title={item.lineItemName}
                                >
                                  {item.lineItemName}
                                </td>
                                <td className={`px-4 py-3 ${isParent ? 'font-semibold' : ''}`}>{item.costCode || '-'}</td>
                                <td className="px-4 py-3 text-center">{item.unconvertedUnitOfMeasure || '-'}</td>
                                <td className="px-4 py-3 text-right">{parseFloat(item.unconvertedQty || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">${parseFloat(item.unitCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">${parseFloat(item.unitTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-center">{item.convertedUnitOfMeasure || '-'}</td>
                                <td className="px-4 py-3 text-right">{parseFloat(item.convertedQty || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">{parseFloat(item.productionRate || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">{parseFloat(item.hours || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">${parseFloat(item.laborCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">${parseFloat(item.equipmentCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">${parseFloat(item.truckingCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">${parseFloat(item.dumpFeesCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">${parseFloat(item.materialCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">${parseFloat(item.subcontractorCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">${parseFloat(item.budgetTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="px-4 py-3 text-right">${parseFloat(item.billing || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
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
                            {location.status === "completed" && (
                              <Badge variant="default" className="text-xs bg-green-600">Completed</Badge>
                            )}
                            {location.status === "suspended" && (
                              <Badge variant="default" className="text-xs bg-yellow-600">Suspended</Badge>
                            )}
                            {(location.status === "completed" || location.status === "suspended") && location.hasMissingActuals && (
                              <div className="flex items-center gap-1 text-yellow-600" title="Some budget items are missing actual quantities">
                                <AlertTriangle className="w-4 h-4" />
                              </div>
                            )}
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
                                    const completedTasks = tasks.filter((task: any) => {
                                      const taskAssignments = (assignments as any[]).filter((a: any) => 
                                        a.taskId === task.id && !a.isDriverHours
                                      );
                                      if (taskAssignments.length > 0) {
                                        return taskAssignments.every((a: any) => 
                                          a.actualHours !== null && a.actualHours !== undefined
                                        );
                                      }
                                      return task.status === 'complete';
                                    }).length;
                                    const progressPercentage = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;
                                    return `${progressPercentage}%`;
                                  })()}
                                </span>
                              </div>
                              <Progress value={(() => {
                                const tasks = locationTaskQueries.data?.[location.locationId] || [];
                                const completedTasks = tasks.filter((task: any) => {
                                  const taskAssignments = (assignments as any[]).filter((a: any) => 
                                    a.taskId === task.id && !a.isDriverHours
                                  );
                                  if (taskAssignments.length > 0) {
                                    return taskAssignments.every((a: any) => 
                                      a.actualHours !== null && a.actualHours !== undefined
                                    );
                                  }
                                  return task.status === 'complete';
                                }).length;
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
                          {(location.status === 'completed' || location.status === 'suspended') && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setActualsLocationId(location.id);
                                setShowActualsModal(true);
                              }}
                            >
                              View Actuals
                            </Button>
                          )}
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
            setNewLocationStatus("active");
            setNewLocationSuspensionReason("");
            setPreviousLocationStatus("active");
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingLocation ? 'Edit Location' : 'Add New Location'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="locationName">Location Name *</Label>
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
                  <Label htmlFor="locationStartDate">Start Date *</Label>
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
              {editingLocation && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="locationStatus">Status</Label>
                    <Select value={newLocationStatus} onValueChange={setNewLocationStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {newLocationStatus === "suspended" && (
                    <div className="space-y-2">
                      <Label htmlFor="suspensionReason">Suspension Reason *</Label>
                      <Textarea
                        id="suspensionReason"
                        placeholder="Enter reason for suspending this location"
                        value={newLocationSuspensionReason}
                        onChange={(e) => setNewLocationSuspensionReason(e.target.value)}
                      />
                    </div>
                  )}
                  {(newLocationStatus === "completed" || newLocationStatus === "suspended") && 
                   previousLocationStatus === "active" && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
                      <strong>Note:</strong> After updating, you will be prompted to enter actual quantities for the budget line items.
                    </div>
                  )}
                </div>
              )}
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

        {/* Edit Project Dialog */}
        <Dialog open={showEditProjectDialog} onOpenChange={(open) => {
          if (!open) {
            setShowEditProjectDialog(false);
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="editProjectId">Project ID</Label>
                <Input
                  id="editProjectId"
                  placeholder="Enter project ID"
                  value={editProjectId}
                  onChange={(e) => setEditProjectId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editProjectName">Project Name</Label>
                <Input
                  id="editProjectName"
                  placeholder="Enter project name"
                  value={editProjectName}
                  onChange={(e) => setEditProjectName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editProjectAddress">Address</Label>
                <Input
                  id="editProjectAddress"
                  placeholder="Enter project address"
                  value={editProjectAddress}
                  onChange={(e) => setEditProjectAddress(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editProjectStartDate">Start Date</Label>
                  <Input
                    id="editProjectStartDate"
                    type="date"
                    value={editProjectStartDate}
                    onChange={(e) => setEditProjectStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editProjectEndDate">End Date</Label>
                  <Input
                    id="editProjectEndDate"
                    type="date"
                    value={editProjectEndDate}
                    onChange={(e) => setEditProjectEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowEditProjectDialog(false)}
                  disabled={updateProjectMutation.isPending}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSaveProject}
                  disabled={updateProjectMutation.isPending}
                >
                  {updateProjectMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Budget Upload Dialog */}
        <Dialog open={showBudgetUploadDialog} onOpenChange={(open) => { setShowBudgetUploadDialog(open); if (!open) { setValidationResult(null); setExpandedErrorGroups(new Set()); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Master Budget</DialogTitle>
              <DialogDescription>
                Upload an Excel file containing the project's master budget. 
                This will be used as the source for location budgets.
                The file should follow the SW62 Excel format (21 columns).
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                <FileSpreadsheet className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <p className="text-gray-600 text-sm mb-3">
                  Click the button below to select an Excel file
                </p>
                <div className="flex gap-2 justify-center">
                  <Button 
                    variant="outline"
                    onClick={() => downloadBudgetTemplate()}
                    data-testid="button-download-template-dialog"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Template
                  </Button>
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
              </div>
              
              {validationResult && !validationResult.isValid && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-semibold text-red-800 mb-2">Validation Errors ({validationResult.errors.length})</h4>
                  <div className="max-h-48 overflow-y-auto space-y-3">
                    {(() => {
                      const columnOrder = ['Line Item Number', 'Level', 'Master Code', 'Code', 'Description', 'Crew', 
                        'Unconverted Unit', 'Unconverted Qty', 'Conv Factor', 'Conv UM', 'Converted Unit', 'Converted Qty',
                        'UM', 'Unit Cost', 'PX', 'Labor %', 'Material %', 'Equipment %', 'Subs %', 'Other %'];
                      const getColumnIndex = (col: string) => {
                        const idx = columnOrder.indexOf(col);
                        return idx >= 0 ? idx : 999;
                      };
                      const sortedGroupedErrors = [...validationResult.groupedErrors].sort((a, b) => 
                        getColumnIndex(a.column) - getColumnIndex(b.column)
                      );
                      return sortedGroupedErrors.length > 0 ? (
                        <div className="bg-red-100 rounded p-3">
                          <p className="text-sm font-semibold text-red-900 mb-2 border-b border-red-300 pb-1">Column Issues (repeated errors)</p>
                          <ul className="text-sm text-red-700 space-y-1">
                            {sortedGroupedErrors.map((group, idx) => {
                              const groupKey = `grouped-${group.column}-${idx}`;
                              const isExpanded = expandedErrorGroups.has(groupKey);
                              const hasMore = group.count > group.sampleRows.length;
                              return (
                                <li key={idx}>
                                  <span className="font-medium">{group.column}</span>: {group.count} rows have errors
                                  {group.sampleValue && ` (e.g., "${group.sampleValue}")`}
                                  <br />
                                  <span className="text-red-600 text-xs">
                                    Rows: {isExpanded ? group.allRows.join(', ') : group.sampleRows.join(', ')}
                                    {hasMore && !isExpanded && (
                                      <button 
                                        onClick={() => setExpandedErrorGroups(prev => new Set([...prev, groupKey]))}
                                        className="ml-1 text-blue-600 hover:text-blue-800 underline cursor-pointer"
                                      >
                                        ...and {group.count - group.sampleRows.length} more
                                      </button>
                                    )}
                                    {hasMore && isExpanded && (
                                      <button 
                                        onClick={() => setExpandedErrorGroups(prev => { const s = new Set(prev); s.delete(groupKey); return s; })}
                                        className="ml-1 text-blue-600 hover:text-blue-800 underline cursor-pointer"
                                      >
                                        (collapse)
                                      </button>
                                    )}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : null;
                    })()}
                    {(() => {
                      const columnOrder = ['Line Item Number', 'Level', 'Master Code', 'Code', 'Description', 'Crew', 
                        'Unconverted Unit', 'Unconverted Qty', 'Conv Factor', 'Conv UM', 'Converted Unit', 'Converted Qty',
                        'UM', 'Unit Cost', 'PX', 'Labor %', 'Material %', 'Equipment %', 'Subs %', 'Other %'];
                      const getColumnIndex = (col: string) => {
                        const idx = columnOrder.indexOf(col);
                        return idx >= 0 ? idx : 999;
                      };
                      const groupedColumns = new Set(validationResult.groupedErrors.map(g => `${g.column}|${g.messageTemplate}`));
                      const ungroupedErrors = validationResult.errors.filter(e => {
                        const normalized = e.message.replace(/: "[^"]*"/g, '').replace(/: \$[^\s.]*/g, '').replace(/\d+/g, 'N');
                        return !groupedColumns.has(`${e.column}|${normalized}`);
                      });
                      if (ungroupedErrors.length > 0) {
                        const byColumn: Record<string, typeof ungroupedErrors> = {};
                        ungroupedErrors.forEach(err => {
                          if (!byColumn[err.column]) byColumn[err.column] = [];
                          byColumn[err.column].push(err);
                        });
                        const sortedColumns = Object.keys(byColumn).sort((a, b) => getColumnIndex(a) - getColumnIndex(b));
                        return (
                          <div className="bg-orange-50 rounded p-3">
                            <p className="text-sm font-semibold text-orange-900 mb-2 border-b border-orange-300 pb-1">Individual Errors</p>
                            <div className="text-sm text-red-700 space-y-2">
                              {sortedColumns.map(column => {
                                const indivKey = `individual-${column}`;
                                const isExpanded = expandedErrorGroups.has(indivKey);
                                const hasMore = byColumn[column].length > 5;
                                const displayErrors = isExpanded ? byColumn[column] : byColumn[column].slice(0, 5);
                                return (
                                  <div key={column}>
                                    <span className="font-medium">{column}:</span>
                                    <ul className="ml-3 space-y-0.5">
                                      {displayErrors.map((error, idx) => (
                                        <li key={idx}>
                                          Row {error.row}: {error.message}
                                        </li>
                                      ))}
                                      {hasMore && !isExpanded && (
                                        <li>
                                          <button 
                                            onClick={() => setExpandedErrorGroups(prev => new Set([...prev, indivKey]))}
                                            className="text-xs text-blue-600 hover:text-blue-800 underline cursor-pointer"
                                          >
                                            ...and {byColumn[column].length - 5} more in this column
                                          </button>
                                        </li>
                                      )}
                                      {hasMore && isExpanded && (
                                        <li>
                                          <button 
                                            onClick={() => setExpandedErrorGroups(prev => { const s = new Set(prev); s.delete(indivKey); return s; })}
                                            className="text-xs text-blue-600 hover:text-blue-800 underline cursor-pointer"
                                          >
                                            (collapse)
                                          </button>
                                        </li>
                                      )}
                                    </ul>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              )}
              
              <div className="flex justify-center mb-4">
                <Button 
                  variant="outline" 
                  onClick={() => setShowExampleBudgetDialog(true)}
                  data-testid="button-view-example-budget"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  View Example Master Budget
                </Button>
              </div>

              <div className="max-h-64 overflow-y-auto border rounded-lg">
                <div className="bg-blue-50 border-b border-blue-200 p-3">
                  <h4 className="font-semibold text-blue-800 mb-2 text-sm">Reminders</h4>
                  <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                    <li>
                      Break down line items where vague:
                      <table className="mt-1 text-xs border border-blue-300 rounded">
                        <thead>
                          <tr className="bg-blue-100">
                            <th className="px-1 py-0.5 border-r border-blue-300 text-left">Line Item</th>
                            <th className="px-1 py-0.5 border-r border-blue-300 text-left">Description</th>
                            <th className="px-1 py-0.5 text-left">Unit</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-amber-50">
                            <td className="px-1 py-0.5 border-r border-blue-300 font-medium">26</td>
                            <td className="px-1 py-0.5 border-r border-blue-300">Crushed Miscellaneous Base</td>
                            <td className="px-1 py-0.5">CY</td>
                          </tr>
                          <tr>
                            <td className="px-1 py-0.5 border-r border-blue-300">26.1</td>
                            <td className="px-1 py-0.5 border-r border-blue-300">Concrete Curb Type A</td>
                            <td className="px-1 py-0.5">LF</td>
                          </tr>
                        </tbody>
                      </table>
                    </li>
                    <li>Ensure cost codes are assigned to each line item</li>
                    <li>Review quantities and units before uploading</li>
                  </ul>
                </div>

                <div className="bg-gray-50 p-3">
                  <h4 className="font-semibold text-gray-900 mb-2 text-sm">Format Requirements</h4>
                  <div className="space-y-1 text-xs">
                    {FORMAT_REQUIREMENTS.map((req, idx) => (
                      <div key={idx}>
                        <p className="font-medium text-gray-700">{req.title}:</p>
                        <ul className="text-gray-600 ml-3 list-disc">
                          {req.items.map((item, itemIdx) => (
                            <li key={itemIdx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              {projectBudgetItems.length > 0 && (
                <p className="text-sm text-amber-600">
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

        {/* Expanded Budget Table Dialog */}
        <Dialog open={showExpandedBudgetDialog} onOpenChange={setShowExpandedBudgetDialog}>
          <DialogContent className="max-w-[95vw] w-full max-h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Budget Line Items - Full View</DialogTitle>
            </DialogHeader>
            <div className="border rounded-md overflow-hidden">
              <div className="overflow-auto max-h-[70vh]">
                <table className="w-full min-w-[1400px] border-collapse sticky-table">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr className="border-b">
                      <th className="w-20 sticky left-0 top-0 bg-gray-100 border-r z-20 px-4 py-3 text-left font-medium text-gray-600" style={{position: 'sticky', left: '0px', top: '0px'}}>Line Item</th>
                      <th className="min-w-60 sticky top-0 bg-gray-100 border-r z-20 px-4 py-3 text-left font-medium text-gray-600" style={{position: 'sticky', left: '80px', top: '0px'}}>Description</th>
                      <th className="w-20 sticky top-0 bg-gray-100 px-4 py-3 text-left font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Cost Code</th>
                      <th className="w-16 sticky top-0 bg-gray-100 px-4 py-3 text-center font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Unit</th>
                      <th className="w-20 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Qty</th>
                      <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Unit Cost</th>
                      <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Unit Total</th>
                      <th className="w-20 sticky top-0 bg-gray-100 px-4 py-3 text-center font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Conv. UM</th>
                      <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Conv. Qty</th>
                      <th className="w-20 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>PX</th>
                      <th className="w-20 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Hours</th>
                      <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Labor Cost</th>
                      <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Equipment</th>
                      <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Trucking</th>
                      <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Dump Fees</th>
                      <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Material</th>
                      <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Sub</th>
                      <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Budget</th>
                      <th className="w-24 sticky top-0 bg-gray-100 px-4 py-3 text-right font-medium text-gray-600" style={{position: 'sticky', top: '0px'}}>Billings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredBudgetItems()
                      .filter((item: any) => isItemVisible(item, getFilteredBudgetItems()))
                      .map((item: any) => {
                        const filteredItems = getFilteredBudgetItems();
                        const itemHasChildren = hasChildren(item.lineItemNumber, filteredItems);
                        const isCollapsed = collapsedGroups.has(item.lineItemNumber);
                        const indent = (item.lineItemNumber.split('.').length - 1) * 16;
                        const isParent = itemHasChildren || item.isGroup;
                        
                        return (
                          <tr 
                            key={`expanded-${item.id}`} 
                            className={`${isParent ? 'bg-gray-50' : 'bg-white'} hover:bg-blue-50 border-b`}
                          >
                            <td 
                              className={`font-medium sticky left-0 border-r z-10 px-4 py-3 ${isParent ? 'bg-gray-100' : 'bg-gray-100'}`}
                              style={{ position: 'sticky', left: '0px', paddingLeft: `${16 + indent}px` }}
                            >
                              <div className="flex items-center">
                                {itemHasChildren && (
                                  <button 
                                    onClick={() => toggleGroupCollapse(item.lineItemNumber)}
                                    className="mr-1 p-0.5 hover:bg-gray-200 rounded text-gray-500"
                                  >
                                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  </button>
                                )}
                                {!itemHasChildren && <span className="w-5" />}
                                <span className={isParent ? 'font-semibold' : ''}>{item.lineItemNumber}</span>
                              </div>
                            </td>
                            <td 
                              className={`max-w-60 sticky border-r z-10 px-4 py-3 ${isParent ? 'bg-gray-100 font-semibold' : 'bg-gray-100'}`}
                              style={{ position: 'sticky', left: '80px' }}
                              title={item.lineItemName}
                            >
                              {item.lineItemName}
                            </td>
                            <td className={`px-4 py-3 ${isParent ? 'font-semibold' : ''}`}>{item.costCode || '-'}</td>
                            <td className="px-4 py-3 text-center">{item.unconvertedUnitOfMeasure || '-'}</td>
                            <td className="px-4 py-3 text-right">{parseFloat(item.unconvertedQty || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right">${parseFloat(item.unitCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right">${parseFloat(item.unitTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-center">{item.convertedUnitOfMeasure || '-'}</td>
                            <td className="px-4 py-3 text-right">{parseFloat(item.convertedQty || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right">{parseFloat(item.productionRate || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right">{parseFloat(item.hours || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right">${parseFloat(item.laborCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right">${parseFloat(item.equipmentCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right">${parseFloat(item.truckingCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right">${parseFloat(item.dumpFeesCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right">${parseFloat(item.materialCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right">${parseFloat(item.subcontractorCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right">${parseFloat(item.budgetTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right">${parseFloat(item.billing || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Example Master Budget Dialog */}
        <Dialog open={showExampleBudgetDialog} onOpenChange={setShowExampleBudgetDialog}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Example Master Budget</DialogTitle>
              <DialogDescription>
                This is an example of how your master budget Excel file should be structured. (62 line items)
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-auto flex-1 border rounded" style={{ maxHeight: '60vh' }}>
              <table className="text-xs border-collapse" style={{ minWidth: '2200px' }}>
                <thead className="sticky top-0 bg-gray-100 z-10">
                  <tr>
                    <th className="px-2 py-1 border text-left whitespace-nowrap">Line Item Number</th>
                    <th className="px-2 py-1 border text-left whitespace-nowrap">Line Item Name</th>
                    <th className="px-2 py-1 border text-center whitespace-nowrap">Unconverted Unit</th>
                    <th className="px-2 py-1 border text-right whitespace-nowrap">Unconverted Qty</th>
                    <th className="px-2 py-1 border text-right whitespace-nowrap">Unit Cost</th>
                    <th className="px-2 py-1 border text-right whitespace-nowrap">Unit Total</th>
                    <th className="px-2 py-1 border text-left whitespace-nowrap">Cost Code</th>
                    <th className="px-2 py-1 border text-center whitespace-nowrap">Converted Unit</th>
                    <th className="px-2 py-1 border text-right whitespace-nowrap">Converted Qty</th>
                    <th className="px-2 py-1 border text-right whitespace-nowrap">Production Rate</th>
                    <th className="px-2 py-1 border text-right whitespace-nowrap">Hours</th>
                    <th className="px-2 py-1 border text-right whitespace-nowrap">Labor Cost</th>
                    <th className="px-2 py-1 border text-right whitespace-nowrap">Equipment Cost</th>
                    <th className="px-2 py-1 border text-right whitespace-nowrap">Trucking Cost</th>
                    <th className="px-2 py-1 border text-right whitespace-nowrap">Dump Fees</th>
                    <th className="px-2 py-1 border text-right whitespace-nowrap">Material Cost</th>
                    <th className="px-2 py-1 border text-right whitespace-nowrap">Subcontractor Cost</th>
                    <th className="px-2 py-1 border text-right whitespace-nowrap">Budget Total</th>
                    <th className="px-2 py-1 border text-right whitespace-nowrap">Billing</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {li:"1",name:"Mobilization per General Requirements",unit:"LS",qty:"1",cost:"$15,000",total:"$15,000",cc:"Mobilization",cu:"LS",cq:"1",px:"1",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:"$15,000"},
                    {li:"2",name:"Allowance for Differing Site Conditions",unit:"LS",qty:"1",cost:"$10,000",total:"$10,000",cc:"Allowance",cu:"LS",cq:"1",px:"-",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:"$10,000"},
                    {li:"3",name:"Allowance for Grading in Temporary Construction Easement",unit:"LS",qty:"1",cost:"$15,000",total:"$15,000",cc:"Allowance",cu:"LS",cq:"1",px:"-",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:"$15,000"},
                    {li:"4",name:"Allowance for Railroad Requirements",unit:"LS",qty:"1",cost:"$35,000",total:"$35,000",cc:"Allowance",cu:"LS",cq:"1",px:"-",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:"$35,000"},
                    {li:"5",name:"Traffic Control",unit:"LS",qty:"1",cost:"$70,000",total:"$70,000",cc:"Traffic Control",cu:"LS",cq:"4",px:"-",hrs:"192",lc:"$15,360",ec:"",tc:"",df:"",mc:"$15,000",sc:"",bt:"$30,360",bl:"$70,000"},
                    {li:"6",name:"Clearing and Grubbing",unit:"LS",qty:"1",cost:"$15,000",total:"$15,000",cc:"Demo/Ex",cu:"LS",cq:"1",px:"1",hrs:"1",lc:"$800",ec:"",tc:"",df:"",mc:"",sc:"",bt:"$800",bl:"$15,000"},
                    {li:"7",name:"Unclassified Excavation",unit:"CY",qty:"175",cost:"$50",total:"$8,750",cc:"Demo/Ex",cu:"CY",cq:"175",px:"10",hrs:"18",lc:"$1,400",ec:"",tc:"$612.50",df:"$612.50",mc:"",sc:"",bt:"$2,625",bl:"$8,750"},
                    {li:"8",name:"Concrete Curb Type A",unit:"LF",qty:"79",cost:"$10",total:"$790",cc:"Demo/Ex",cu:"CY",cq:"1.46",px:"6",hrs:"9",lc:"$711.43",ec:"",tc:"$51.30",df:"$51.30",mc:"",sc:"",bt:"$814.03",bl:"$790"},
                    {li:"9",name:"Concrete Integral Curb and Gutter",unit:"LF",qty:"80",cost:"$10",total:"$800",cc:"Demo/Ex",cu:"CY",cq:"11.43",px:"6",hrs:"69",lc:"$5,485.71",ec:"",tc:"$400",df:"$400",mc:"",sc:"",bt:"$6,285.71",bl:"$800"},
                    {li:"10",name:"Concrete Driveway",unit:"SF",qty:"250",cost:"$15",total:"$3,750",cc:"Demo/Ex",cu:"CY",cq:"4.63",px:"1",hrs:"5",lc:"$370.37",ec:"",tc:"$162.04",df:"$162.04",mc:"",sc:"",bt:"$694.44",bl:"$3,750"},
                    {li:"11",name:"Concrete Sidewalk, including Curb Ramps",unit:"SF",qty:"1,601",cost:"$10",total:"$16,010",cc:"Demo/Ex",cu:"CY",cq:"20.01",px:"1",hrs:"20",lc:"$1,601",ec:"",tc:"$700.44",df:"$700.44",mc:"",sc:"",bt:"$3,001.88",bl:"$16,010"},
                    {li:"12",name:"Curb Ramp, including Detectable Warning Surface",unit:"EA",qty:"2",cost:"$500",total:"$1,000",cc:"Demo/Ex",cu:"CY",cq:"4",px:"1",hrs:"4",lc:"$320",ec:"",tc:"$140",df:"$140",mc:"",sc:"",bt:"$600",bl:"$1,000"},
                    {li:"13",name:"Asphalt Concrete Pavement",unit:"SF",qty:"4,161",cost:"$6",total:"$24,966",cc:"Demo/Ex",cu:"CY",cq:"770.56",px:"10",hrs:"77",lc:"$6,165",ec:"",tc:"$26,970",df:"$26,970",mc:"",sc:"",bt:"$60,105",bl:"$24,966"},
                    {li:"14",name:"Crushed Miscellaneous Base",unit:"SF",qty:"1",cost:"$4",total:"$4",cc:"Demo/Ex",cu:"CY",cq:"0.02",px:"10",hrs:"0",lc:"$0.15",ec:"",tc:"$0.65",df:"$0.65",mc:"",sc:"",bt:"$1.44",bl:"$4"},
                    {li:"15",name:"Unclassified Excavation",unit:"CY",qty:"3,500",cost:"$20",total:"$70,000",cc:"Demo/Ex",cu:"CY",cq:"3,500",px:"10",hrs:"350",lc:"$28,000",ec:"",tc:"$12,250",df:"$12,250",mc:"",sc:"",bt:"$52,500",bl:"$70,000"},
                    {li:"15.1",name:"Concrete Curb Type A",unit:"LF",qty:"79",cost:"-",total:"-",cc:"Demo/Ex",cu:"CY",cq:"1.46",px:"6",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"15.2",name:"Concrete Integral Curb and Gutter",unit:"LF",qty:"317",cost:"-",total:"-",cc:"Demo/Ex",cu:"CY",cq:"45.29",px:"6",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"15.3",name:"Concrete Intersection Gutter",unit:"SF",qty:"384",cost:"-",total:"-",cc:"Demo/Ex",cu:"CY",cq:"7.11",px:"6",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"15.4",name:"Concrete Driveway (t=6\")",unit:"SF",qty:"339",cost:"-",total:"-",cc:"Demo/Ex",cu:"CY",cq:"6.28",px:"6",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"15.5",name:"Concrete Sidewalk (t=4\")",unit:"SF",qty:"2,507",cost:"-",total:"-",cc:"Demo/Ex",cu:"CY",cq:"31.34",px:"6",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"15.6",name:"Curb Ramp, including Detectable Warning Surface",unit:"EA",qty:"4",cost:"-",total:"-",cc:"Demo/Ex",cu:"CY",cq:"8",px:"6",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"15.7",name:"Nonwalkable Surface",unit:"SF",qty:"23",cost:"-",total:"-",cc:"Demo/Ex",cu:"CY",cq:"0.29",px:"6",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"15.8",name:"Asphalt Concrete Pavement",unit:"SF",qty:"10",cost:"-",total:"-",cc:"Demo/Ex",cu:"CY",cq:"10",px:"1",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"15.9",name:"Remove Tree and Stump",unit:"EA",qty:"1",cost:"-",total:"-",cc:"Demo/Ex",cu:"EA",cq:"1",px:"1",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"15.10",name:"Concrete Wall, including Chain Link Fence",unit:"LF",qty:"85",cost:"-",total:"-",cc:"Demo/Ex",cu:"CY",cq:"1.57",px:"6",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"15.11",name:"Wrought Iron Fence, including Gates",unit:"LF",qty:"35",cost:"-",total:"-",cc:"Demo/Ex",cu:"LF",cq:"35",px:"0.25",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"16",name:"Remove Tree and Stump",unit:"EA",qty:"1",cost:"$2,000",total:"$2,000",cc:"Demo/Ex",cu:"EA",cq:"1",px:"1",hrs:"1",lc:"$80",ec:"",tc:"",df:"",mc:"$500",sc:"",bt:"$580",bl:"$2,000"},
                    {li:"17",name:"Concrete Wall, including Chain Link Fence",unit:"LF",qty:"85",cost:"$100",total:"$8,500",cc:"Demo/Ex",cu:"CY",cq:"1.57",px:"6",hrs:"9",lc:"$755.56",ec:"",tc:"$55.09",df:"$55.09",mc:"",sc:"",bt:"$865.73",bl:"$8,500"},
                    {li:"18",name:"Wrought Iron Fence, including Gates",unit:"LF",qty:"35",cost:"$20",total:"$700",cc:"Demo/Ex",cu:"LF",cq:"35",px:"0.25",hrs:"140",lc:"$11,200",ec:"",tc:"",df:"",mc:"",sc:"",bt:"$11,200",bl:"$700"},
                    {li:"19",name:"Concrete Curb Type A",unit:"LF",qty:"79",cost:"$80",total:"$6,320",cc:"Concrete",cu:"CY",cq:"1.46",px:"6",hrs:"9",lc:"$711.43",ec:"",tc:"",df:"",mc:"$329.17",sc:"",bt:"$1,040.60",bl:"$6,320"},
                    {li:"20",name:"Concrete Integral Curb and Gutter",unit:"LF",qty:"317",cost:"$150",total:"$47,550",cc:"Concrete",cu:"CY",cq:"45.29",px:"6",hrs:"272",lc:"$21,737",ec:"",tc:"",df:"",mc:"$10,189",sc:"",bt:"$31,926",bl:"$47,550"},
                    {li:"21",name:"Concrete Intersection Gutter",unit:"SF",qty:"384",cost:"$25",total:"$9,600",cc:"Concrete",cu:"CY",cq:"7.11",px:"6",hrs:"29",lc:"$2,304",ec:"",tc:"",df:"",mc:"$1,080",sc:"",bt:"$3,384",bl:"$9,600"},
                    {li:"22",name:"Concrete Driveway (t=6\")",unit:"SF",qty:"339",cost:"$20",total:"$6,780",cc:"Concrete",cu:"CY",cq:"6.28",px:"6",hrs:"38",lc:"$3,013",ec:"",tc:"",df:"",mc:"$1,413",sc:"",bt:"$4,426",bl:"$6,780"},
                    {li:"23",name:"Concrete Sidewalk (t=4\")",unit:"SF",qty:"2,507",cost:"$20",total:"$50,140",cc:"Concrete",cu:"CY",cq:"31.34",px:"6",hrs:"188",lc:"$15,042",ec:"",tc:"",df:"",mc:"$7,051",sc:"",bt:"$22,093",bl:"$50,140"},
                    {li:"24",name:"Curb Ramp, including Detectable Warning Surface",unit:"EA",qty:"4",cost:"$12,000",total:"$48,000",cc:"Concrete",cu:"CY",cq:"8",px:"6",hrs:"48",lc:"$3,840",ec:"",tc:"",df:"",mc:"$1,800",sc:"",bt:"$5,640",bl:"$48,000"},
                    {li:"25",name:"Asphalt Concrete Pavement",unit:"TON",qty:"158",cost:"$400",total:"$63,200",cc:"Asphalt",cu:"TON",cq:"158",px:"1",hrs:"158",lc:"$14,220",ec:"",tc:"",df:"",mc:"$15,010",sc:"",bt:"$29,230",bl:"$63,200"},
                    {li:"25.1",name:"Asphalt Concrete Pavement",unit:"SF",qty:"4,161",cost:"-",total:"-",cc:"Asphalt",cu:"TON",cq:"154.09",px:"1",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"26",name:"Crushed Miscellaneous Base",unit:"CY",qty:"101.34",cost:"$250",total:"$36,250",cc:"Base/Grading",cu:"CY",cq:"101.34",px:"1",hrs:"145",lc:"$13,050",ec:"",tc:"",df:"",mc:"$10,134",sc:"",bt:"$23,184",bl:"$36,250"},
                    {li:"26.1",name:"Concrete Curb Type A",unit:"LF",qty:"79",cost:"-",total:"-",cc:"Base/Grading",cu:"CY",cq:"1.46",px:"1",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"26.2",name:"Concrete Integral Curb and Gutter",unit:"LF",qty:"317",cost:"-",total:"-",cc:"Base/Grading",cu:"CY",cq:"45.29",px:"1",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"26.3",name:"Concrete Intersection Gutter",unit:"SF",qty:"384",cost:"-",total:"-",cc:"Base/Grading",cu:"CY",cq:"7.11",px:"1",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"26.4",name:"Concrete Driveway (t=6\")",unit:"SF",qty:"339",cost:"-",total:"-",cc:"Base/Grading",cu:"CY",cq:"6.28",px:"1",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"26.5",name:"Concrete Sidewalk (t=4\")",unit:"SF",qty:"2,507",cost:"-",total:"-",cc:"Base/Grading",cu:"CY",cq:"31.34",px:"1",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"26.6",name:"Curb Ramp",unit:"EA",qty:"4",cost:"-",total:"-",cc:"Base/Grading",cu:"CY",cq:"8",px:"1",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"26.7",name:"Nonwalkable Surface",unit:"SF",qty:"23",cost:"-",total:"-",cc:"Base/Grading",cu:"CY",cq:"0.29",px:"1",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"26.8",name:"Concrete Wall, including Chain Link Fence",unit:"LF",qty:"85",cost:"-",total:"-",cc:"Base/Grading",cu:"CY",cq:"1.57",px:"1",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"26.9",name:"Asphalt Concrete Pavement",unit:"SF",qty:"10",cost:"-",total:"-",cc:"Base/Grading",cu:"CY",cq:"10",px:"1",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                    {li:"27",name:"Nonwalkable Surface",unit:"SF",qty:"23",cost:"$50",total:"$1,150",cc:"Concrete",cu:"CY",cq:"0.29",px:"6",hrs:"2",lc:"$138",ec:"",tc:"",df:"",mc:"$65",sc:"",bt:"$203",bl:"$1,150"},
                    {li:"28",name:"Pedestrian Barricade",unit:"EA",qty:"3",cost:"$2,500",total:"$7,500",cc:"Sub",cu:"EA",cq:"3",px:"-",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"$6,375",bt:"$6,375",bl:"$7,500"},
                    {li:"29",name:"Chain Link Fencing, including Gates",unit:"LF",qty:"63",cost:"$250",total:"$15,750",cc:"Sub",cu:"LF",cq:"63",px:"-",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"$13,388",bt:"$13,388",bl:"$15,750"},
                    {li:"30",name:"Detectable Warning Surface Tile",unit:"EA",qty:"2",cost:"$1,000",total:"$2,000",cc:"General Labor",cu:"EA",cq:"2",px:"4",hrs:"8",lc:"$640",ec:"",tc:"",df:"",mc:"$400",sc:"",bt:"$1,040",bl:"$2,000"},
                    {li:"31",name:"Grade Only or Landscaping",unit:"SF",qty:"163",cost:"$5",total:"$815",cc:"General Labor",cu:"SF",cq:"163",px:"8",hrs:"20",lc:"$1,630",ec:"",tc:"",df:"",mc:"",sc:"",bt:"$1,630",bl:"$815"},
                    {li:"32",name:"Concrete Wall, including Chain Link Fence",unit:"LF",qty:"85",cost:"$300",total:"$25,500",cc:"Concrete",cu:"CY",cq:"1.57",px:"6",hrs:"9",lc:"$755.56",ec:"",tc:"",df:"",mc:"$353.52",sc:"",bt:"$1,109.07",bl:"$25,500"},
                    {li:"33",name:"Wrought Iron Fence, including Gates",unit:"LF",qty:"25",cost:"$300",total:"$7,500",cc:"Sub",cu:"LF",cq:"25",px:"-",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"$6,375",bt:"$6,375",bl:"$7,500"},
                    {li:"34",name:"Signage and Striping",unit:"LS",qty:"1",cost:"$18,000",total:"$18,000",cc:"Sub",cu:"LS",cq:"1",px:"-",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"$15,300",bt:"$15,300",bl:"$18,000"},
                    {li:"35",name:"Adjust Street Lighting Pullbox to Grade",unit:"EA",qty:"2",cost:"$2,500",total:"$5,000",cc:"General Labor",cu:"EA",cq:"2",px:"4",hrs:"8",lc:"$640",ec:"",tc:"",df:"",mc:"$400",sc:"",bt:"$1,040",bl:"$5,000"},
                    {li:"36",name:"Adjust Street Light Pole to Grade",unit:"EA",qty:"2",cost:"$2,500",total:"$5,000",cc:"General Labor",cu:"EA",cq:"2",px:"16",hrs:"32",lc:"$2,560",ec:"",tc:"",df:"",mc:"$400",sc:"",bt:"$2,960",bl:"$5,000"},
                    {li:"37",name:"Street Lighting per Contract Plans",unit:"LS",qty:"1",cost:"$30,000",total:"$30,000",cc:"Sub",cu:"LS",cq:"1",px:"-",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"$25,500",bt:"$25,500",bl:"$30,000"},
                    {li:"38",name:"Adjust Water Valve to Grade",unit:"EA",qty:"1",cost:"$1,500",total:"$1,500",cc:"General Labor",cu:"EA",cq:"1",px:"4",hrs:"4",lc:"$320",ec:"",tc:"",df:"",mc:"$200",sc:"",bt:"$520",bl:"$1,500"},
                    {li:"39",name:"Adjust Sewer Maintenance Hole to Grade",unit:"EA",qty:"3",cost:"$1,500",total:"$4,500",cc:"General Labor",cu:"EA",cq:"3",px:"4",hrs:"12",lc:"$960",ec:"",tc:"",df:"",mc:"$600",sc:"",bt:"$1,560",bl:"$4,500"},
                    {li:"40",name:"Street Sign (Remove and Reinstall)",unit:"EA",qty:"2",cost:"$1,000",total:"$2,000",cc:"General Labor",cu:"EA",cq:"2",px:"4",hrs:"8",lc:"$640",ec:"",tc:"",df:"",mc:"$200",sc:"",bt:"$840",bl:"$2,000"},
                    {li:"41",name:"SAWCUT",unit:"LF",qty:"1",cost:"-",total:"-",cc:"Demo/Ex",cu:"LF",cq:"1",px:"20",hrs:"",lc:"",ec:"",tc:"",df:"",mc:"",sc:"",bt:"",bl:""},
                  ].map((row, idx) => {
                    const hasChildren = ['15','25','26'].includes(row.li);
                    return (
                      <tr key={idx} className={hasChildren ? 'bg-amber-50 font-semibold' : ''}>
                        <td className={`px-2 py-1 border whitespace-nowrap ${row.li.includes('.') ? 'pl-4' : ''}`}>{row.li}</td>
                        <td className="px-2 py-1 border whitespace-nowrap" title={row.name}>{row.name}</td>
                        <td className="px-2 py-1 border text-center">{row.unit}</td>
                        <td className="px-2 py-1 border text-right">{row.qty}</td>
                        <td className="px-2 py-1 border text-right">{row.cost}</td>
                        <td className="px-2 py-1 border text-right">{row.total}</td>
                        <td className="px-2 py-1 border">{row.cc}</td>
                        <td className="px-2 py-1 border text-center">{row.cu}</td>
                        <td className="px-2 py-1 border text-right">{row.cq}</td>
                        <td className="px-2 py-1 border text-right">{row.px}</td>
                        <td className="px-2 py-1 border text-right">{row.hrs}</td>
                        <td className="px-2 py-1 border text-right">{row.lc}</td>
                        <td className="px-2 py-1 border text-right">{row.ec}</td>
                        <td className="px-2 py-1 border text-right">{row.tc}</td>
                        <td className="px-2 py-1 border text-right">{row.df}</td>
                        <td className="px-2 py-1 border text-right">{row.mc}</td>
                        <td className="px-2 py-1 border text-right">{row.sc}</td>
                        <td className="px-2 py-1 border text-right">{row.bt}</td>
                        <td className="px-2 py-1 border text-right">{row.bl}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 space-y-2 text-sm text-gray-600">
              <p><strong>Key Points:</strong></p>
              <ul className="list-disc list-inside space-y-1">
                <li>Parent items (e.g., 15, 25, 26) are shown with <span className="bg-amber-100 px-1 rounded">yellow highlighting</span></li>
                <li>Child items use decimal notation (e.g., 15.1, 25.1, 26.1)</li>
                <li>Each line item must have a valid Cost Code</li>
                <li>PX is the production rate (units per hour)</li>
              </ul>
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={() => setShowExampleBudgetDialog(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Location Actuals Modal */}
        <LocationActualsModal
          open={showActualsModal}
          onOpenChange={setShowActualsModal}
          locationId={actualsLocationId}
        />

        {/* Project Actuals Modal */}
        {project && (
          <ProjectActualsModal
            open={showProjectActualsModal}
            onOpenChange={setShowProjectActualsModal}
            projectId={project.id}
          />
        )}
      </main>
      </div>
    </div>
  );
}