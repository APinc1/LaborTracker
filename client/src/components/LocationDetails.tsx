import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, MapPin, Calendar, User, DollarSign, CheckCircle, Clock, AlertCircle, X, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

interface LocationDetailsProps {
  locationId: string;
}

export default function LocationDetails({ locationId }: LocationDetailsProps) {
  const [selectedCostCode, setSelectedCostCode] = useState<string | null>(null);
  const [showCostCodeDialog, setShowCostCodeDialog] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showBudgetDialog, setShowBudgetDialog] = useState(false);

  const { data: location, isLoading: locationLoading } = useQuery({
    queryKey: ["/api/locations", locationId],
    staleTime: 30000,
  });

  const { data: budgetItems = [], isLoading: budgetLoading } = useQuery({
    queryKey: ["/api/locations", locationId, "budget"],
    enabled: !!locationId,
    staleTime: 30000,
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["/api/locations", locationId, "tasks"],
    enabled: !!locationId,
    staleTime: 30000,
  });

  if (locationLoading) {
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

  if (!location) {
    return (
      <div className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/locations">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Locations
              </Button>
            </Link>
            <h2 className="text-2xl font-bold text-gray-800">Location Not Found</h2>
          </div>
        </header>
        <main className="p-6">
          <p className="text-gray-600">The requested location could not be found.</p>
        </main>
      </div>
    );
  }

  // Calculate budget totals in hours
  const totalBudgetHours = budgetItems.reduce((sum: number, item: any) => {
    // Only include items without children (leaf nodes)
    const hasChildren = budgetItems.some((child: any) => child.parentId === item.id);
    return hasChildren ? sum : sum + (parseFloat(item.hours) || 0);
  }, 0);
  
  const totalActualHours = budgetItems.reduce((sum: number, item: any) => {
    // Only include items without children (leaf nodes)
    const hasChildren = budgetItems.some((child: any) => child.parentId === item.id);
    return hasChildren ? sum : sum + (parseFloat(item.actualHours) || 0);
  }, 0);
  
  const remainingHours = totalBudgetHours - totalActualHours;

  // Calculate progress
  const completedTasks = tasks.filter((task: any) => task.actualHours).length;
  const progressPercentage = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;

  // Calculate cost code summaries by hours
  const costCodeSummaries = budgetItems.reduce((acc: any, item: any) => {
    const costCode = item.costCode || 'UNCATEGORIZED';
    if (!acc[costCode]) {
      acc[costCode] = {
        costCode,
        totalBudgetHours: 0,
        totalActualHours: 0,
        totalConvertedQty: 0,
        convertedUnitOfMeasure: '',
        items: [],
        itemCount: 0
      };
    }
    
    // Only include items without children (leaf nodes)
    const hasChildren = budgetItems.some((child: any) => child.parentId === item.id);
    if (!hasChildren) {
      acc[costCode].totalBudgetHours += parseFloat(item.hours) || 0;
      acc[costCode].totalActualHours += parseFloat(item.actualHours) || 0;
      acc[costCode].totalConvertedQty += parseFloat(item.convertedQty) || 0;
      // Use the unit of measure from the first item, assuming they're consistent within cost code
      if (!acc[costCode].convertedUnitOfMeasure && item.convertedUnitOfMeasure) {
        acc[costCode].convertedUnitOfMeasure = item.convertedUnitOfMeasure;
      }
    }
    
    acc[costCode].items.push(item);
    acc[costCode].itemCount++;
    return acc;
  }, {});

  const costCodeArray = Object.values(costCodeSummaries).filter((summary: any) => summary.totalConvertedQty > 0);

  // Handle cost code card click
  const handleCostCodeClick = (costCode: string) => {
    setSelectedCostCode(costCode);
    setShowCostCodeDialog(true);
  };

  // Get items for selected cost code
  const selectedCostCodeItems = selectedCostCode ? costCodeSummaries[selectedCostCode]?.items || [] : [];

  // Helper functions for collapsible functionality
  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const hasChildren = (itemLineNumber: string) => {
    return selectedCostCodeItems.some((item: any) => 
      item.lineItemNumber && item.lineItemNumber.startsWith(itemLineNumber + ".")
    );
  };

  const getChildren = (parentLineNumber: string) => {
    return selectedCostCodeItems.filter((item: any) => 
      item.lineItemNumber && 
      item.lineItemNumber.startsWith(parentLineNumber + ".") &&
      item.lineItemNumber !== parentLineNumber
    );
  };

  const getParentItems = () => {
    return selectedCostCodeItems.filter((item: any) => {
      if (!item.lineItemNumber) return true;
      // Check if this is a parent by seeing if any other items start with this number + "."
      const hasChildrenItems = selectedCostCodeItems.some((other: any) => 
        other.lineItemNumber && 
        other.lineItemNumber.startsWith(item.lineItemNumber + ".") &&
        other.lineItemNumber !== item.lineItemNumber
      );
      // If it has children, it's a parent. If not, check if it's a child of another item
      if (hasChildrenItems) return true;
      
      // Check if this item is a child (contains a decimal point and there's a parent)
      const parts = item.lineItemNumber.split(".");
      if (parts.length > 1) {
        const potentialParent = parts[0];
        const parentExists = selectedCostCodeItems.some((parent: any) => 
          parent.lineItemNumber === potentialParent
        );
        return !parentExists; // Only show as parent if the actual parent doesn't exist
      }
      return true; // Show standalone items
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/locations">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Locations
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{location.name}</h2>
            <p className="text-gray-600 mt-1">Location overview and details</p>
          </div>
        </div>
      </header>

      <main className="p-6">
        {/* Location Overview */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Location Overview
              <Badge variant="outline">{location.locationId}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Duration</p>
                  <p className="font-medium">
                    {format(new Date(location.startDate), 'MMM d, yyyy')} - {format(new Date(location.endDate), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <DollarSign className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-sm text-gray-600">Budget Allocation</p>
                  <p className="font-medium">${location.budgetAllocated?.toLocaleString() || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {location.isComplete ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <Clock className="w-4 h-4 text-orange-600" />
                )}
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <p className="font-medium">{location.isComplete ? 'Completed' : 'In Progress'}</p>
                </div>
              </div>
            </div>
            
            {location.description && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700">{location.description}</p>
              </div>
            )}

            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Progress</span>
                <span className="text-sm text-gray-600">{Math.round(progressPercentage)}%</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* Budget Summary */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Budget Summary
              <Badge variant="secondary">{budgetItems.length} items</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {budgetLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : budgetItems.length === 0 ? (
              <div className="text-center py-8">
                <DollarSign className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No budget items found for this location</p>
                <p className="text-sm text-gray-400 mt-2">
                  Budget items will appear here once they are added
                </p>
                <Link href={`/budgets?locationId=${location.id}`}>
                  <Button className="mt-4">
                    Manage Budget
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Overall Budget Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-600 font-medium">Total Budget Hours</p>
                    <p className="text-2xl font-bold text-blue-800">{totalBudgetHours.toLocaleString()} hrs</p>
                  </div>
                  <div className="p-4 bg-red-50 rounded-lg">
                    <p className="text-sm text-red-600 font-medium">Actual Hours Worked</p>
                    <p className="text-2xl font-bold text-red-800">{totalActualHours.toLocaleString()} hrs</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-600 font-medium">Remaining Hours</p>
                    <p className={`text-2xl font-bold ${remainingHours >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                      {remainingHours.toLocaleString()} hrs
                    </p>
                  </div>
                </div>

                {/* Cost Code Summary Cards */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium">Cost Code Summary</h4>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setShowBudgetDialog(true)}
                    >
                      View Full Budget
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {costCodeArray.map((summary: any) => {
                      const remainingHours = summary.totalBudgetHours - summary.totalActualHours;
                      const hoursPercentage = summary.totalBudgetHours > 0 ? (summary.totalActualHours / summary.totalBudgetHours) * 100 : 0;
                      
                      return (
                        <Card 
                          key={summary.costCode} 
                          className="hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => handleCostCodeClick(summary.costCode)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="outline" className="font-medium">
                                {summary.costCode}
                              </Badge>
                              <span className="text-sm text-gray-600">
                                {summary.itemCount} items
                              </span>
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Total Qty:</span>
                                <span className="font-medium">{summary.totalConvertedQty.toLocaleString()} {summary.convertedUnitOfMeasure}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Budget Hours:</span>
                                <span className="font-medium">{summary.totalBudgetHours.toLocaleString()} hrs</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Actual Hours:</span>
                                <span className="font-medium text-red-600">{summary.totalActualHours.toLocaleString()} hrs</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Remaining:</span>
                                <span className={`font-medium ${remainingHours >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {remainingHours.toLocaleString()} hrs
                                </span>
                              </div>
                              <div className="mt-2">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-gray-500">Progress</span>
                                  <span className="text-xs text-gray-500">{Math.round(hoursPercentage)}%</span>
                                </div>
                                <Progress value={Math.min(hoursPercentage, 100)} className="h-2" />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Tasks
              <Badge variant="secondary">{tasks.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No tasks found for this location</p>
                <p className="text-sm text-gray-400 mt-2">
                  Tasks will appear here once they are scheduled
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {tasks.map((task: any) => (
                  <Card key={task.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{task.name}</h3>
                          <p className="text-gray-600 text-sm mt-1">{task.workDescription}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <Badge variant="outline">{task.taskType}</Badge>
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Calendar className="w-4 h-4" />
                              <span>{format(new Date(task.taskDate), 'MMM d, yyyy')}</span>
                            </div>
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <Clock className="w-4 h-4" />
                              <span>{task.scheduledHours}h scheduled</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {task.actualHours ? (
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Completed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-orange-600">
                              <Clock className="w-3 h-3 mr-1" />
                              In Progress
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Budget Management Dialog */}
      <Dialog open={showBudgetDialog} onOpenChange={setShowBudgetDialog}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Budget Management - {location?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="h-[calc(95vh-120px)] overflow-y-auto p-4">
            {budgetLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Budget Summary */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-600">Total Items</p>
                    <p className="text-2xl font-bold text-blue-600">{budgetItems.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Budget Hours</p>
                    <p className="text-2xl font-bold text-green-600">{totalBudgetHours.toLocaleString()} hrs</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Actual Hours</p>
                    <p className="text-2xl font-bold text-orange-600">{totalActualHours.toLocaleString()} hrs</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Remaining Hours</p>
                    <p className={`text-2xl font-bold ${remainingHours >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {remainingHours.toLocaleString()} hrs
                    </p>
                  </div>
                </div>

                {/* Budget Table */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="max-h-[60vh] overflow-y-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-gray-100 border-b z-10">
                        <tr>
                          <th className="text-left p-3 font-medium text-gray-900 w-20">Line #</th>
                          <th className="text-left p-3 font-medium text-gray-900">Description</th>
                          <th className="text-right p-3 font-medium text-gray-900">Qty</th>
                          <th className="text-right p-3 font-medium text-gray-900">Unit Cost</th>
                          <th className="text-right p-3 font-medium text-gray-900">Budget Total</th>
                          <th className="text-right p-3 font-medium text-gray-900">Hours</th>
                          <th className="text-right p-3 font-medium text-gray-900">Actual Hours</th>
                          <th className="text-right p-3 font-medium text-gray-900">Cost Code</th>
                        </tr>
                      </thead>
                      <tbody>
                        {budgetItems.map((item: any, index: number) => {
                          const budgetTotal = parseFloat(item.budgetTotal) || 0;
                          const hours = parseFloat(item.hours) || 0;
                          const actualHours = parseFloat(item.actualHours) || 0;
                          const isParent = budgetItems.some((child: any) => 
                            child.lineItemNumber && 
                            child.lineItemNumber.startsWith(item.lineItemNumber + ".") &&
                            child.lineItemNumber !== item.lineItemNumber
                          );
                          
                          return (
                            <tr key={item.id} className={`border-b hover:bg-gray-50 ${
                              item.lineItemNumber && item.lineItemNumber.includes('.') ? 'bg-gray-25' : ''
                            }`}>
                              <td className="p-3 font-medium">
                                <div className="flex items-center gap-2">
                                  {isParent && (
                                    <ChevronRight className="w-4 h-4 text-gray-400" />
                                  )}
                                  <span className={item.lineItemNumber && item.lineItemNumber.includes('.') ? 'pl-4' : ''}>
                                    {item.lineItemNumber}
                                  </span>
                                </div>
                              </td>
                              <td className="p-3">
                                <div>
                                  <p className="font-medium">{item.lineItemName}</p>
                                  {item.notes && (
                                    <p className="text-sm text-gray-600 mt-1">{item.notes}</p>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-right">
                                {parseFloat(item.convertedQty || 0).toLocaleString()} {item.convertedUnitOfMeasure}
                              </td>
                              <td className="p-3 text-right">
                                ${parseFloat(item.unitCost || 0).toLocaleString()}
                              </td>
                              <td className="p-3 text-right font-medium">
                                ${budgetTotal.toLocaleString()}
                              </td>
                              <td className="p-3 text-right">
                                {hours.toLocaleString()} hrs
                              </td>
                              <td className="p-3 text-right text-blue-600">
                                {actualHours.toLocaleString()} hrs
                              </td>
                              <td className="p-3 text-center">
                                <Badge variant="outline">{item.costCode}</Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Cost Code Dialog */}
      <Dialog open={showCostCodeDialog} onOpenChange={setShowCostCodeDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant="outline">{selectedCostCode}</Badge>
              Cost Code Details
              <span className="text-sm text-gray-500 font-normal">
                ({selectedCostCodeItems.length} items)
              </span>
            </DialogTitle>
          </DialogHeader>
          
          {selectedCostCode && (
            <div className="space-y-4">
              {/* Cost Code Summary */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">Total Budget Hours</p>
                  <p className="text-lg font-bold text-blue-600">
                    {costCodeSummaries[selectedCostCode]?.totalBudgetHours.toLocaleString()} hrs
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Actual Hours Worked</p>
                  <p className="text-lg font-bold text-red-600">
                    {costCodeSummaries[selectedCostCode]?.totalActualHours.toLocaleString()} hrs
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Remaining Hours</p>
                  <p className={`text-lg font-bold ${
                    (costCodeSummaries[selectedCostCode]?.totalBudgetHours - costCodeSummaries[selectedCostCode]?.totalActualHours) >= 0 
                      ? 'text-green-600' 
                      : 'text-red-600'
                  }`}>
                    {(costCodeSummaries[selectedCostCode]?.totalBudgetHours - costCodeSummaries[selectedCostCode]?.totalActualHours).toLocaleString()} hrs
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Progress</p>
                  <p className="text-lg font-bold text-purple-600">
                    {Math.round((costCodeSummaries[selectedCostCode]?.totalActualHours / costCodeSummaries[selectedCostCode]?.totalBudgetHours) * 100)}%
                  </p>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-gray-50 border-b z-10">
                    <tr>
                      <th className="text-left p-3 font-medium text-gray-900 w-20">Line #</th>
                      <th className="text-left p-3 font-medium text-gray-900">Description</th>
                      <th className="text-right p-3 font-medium text-gray-900">Quantity</th>
                      <th className="text-right p-3 font-medium text-gray-900">PX</th>
                      <th className="text-right p-3 font-medium text-gray-900">Budget Hours</th>
                      <th className="text-right p-3 font-medium text-gray-900">Billings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getParentItems().map((item: any) => {
                      const itemHasChildren = hasChildren(item.lineItemNumber);
                      const isExpanded = expandedItems.has(item.lineItemNumber);
                      const children = getChildren(item.lineItemNumber);
                      
                      return (
                        <React.Fragment key={item.id}>
                          {/* Parent Row */}
                          <tr className="border-b hover:bg-gray-50">
                            <td className="p-3 font-medium">
                              <div className="flex items-center gap-2">
                                {itemHasChildren && (
                                  <button
                                    onClick={() => toggleExpanded(item.lineItemNumber)}
                                    className="p-1 hover:bg-gray-200 rounded"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </button>
                                )}
                                <span>{item.lineItemNumber}</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <div>
                                <p className="font-medium">{item.lineItemName}</p>
                                {item.notes && (
                                  <p className="text-sm text-gray-600 mt-1">{item.notes}</p>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              {parseFloat(item.convertedQty || 0).toLocaleString()} {item.convertedUnitOfMeasure}
                            </td>
                            <td className="p-3 text-right">
                              {parseFloat(item.productionRate || item.px || 0).toLocaleString()}
                            </td>
                            <td className="p-3 text-right font-medium">
                              {parseFloat(item.hours || 0).toLocaleString()} hrs
                            </td>
                            <td className="p-3 text-right text-red-600">
                              ${parseFloat(item.billing || 0).toLocaleString()}
                            </td>
                          </tr>
                          
                          {/* Children Rows */}
                          {itemHasChildren && isExpanded && children.map((child: any) => (
                            <tr key={child.id} className="border-b hover:bg-gray-50 bg-gray-25">
                              <td className="p-3 font-medium pl-12">
                                {child.lineItemNumber}
                              </td>
                              <td className="p-3">
                                <div>
                                  <p className="font-medium text-gray-700">{child.lineItemName}</p>
                                  {child.notes && (
                                    <p className="text-sm text-gray-600 mt-1">{child.notes}</p>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-right">
                                {parseFloat(child.convertedQty || 0).toLocaleString()} {child.convertedUnitOfMeasure}
                              </td>
                              <td className="p-3 text-right">
                                {parseFloat(child.productionRate || child.px || 0).toLocaleString()}
                              </td>
                              <td className="p-3 text-right font-medium">
                                {parseFloat(child.hours || 0).toLocaleString()} hrs
                              </td>
                              <td className="p-3 text-right text-red-600">
                                ${parseFloat(child.billing || 0).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}