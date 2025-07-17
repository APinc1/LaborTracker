import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Upload, Edit, Trash2, DollarSign, Calculator, FileSpreadsheet, ChevronDown, ChevronRight } from "lucide-react";
import * as XLSX from 'xlsx';
import { parseExcelRowToBudgetItem, calculateBudgetFormulas, recalculateOnQtyChange } from "@/lib/budgetCalculations";
import { parseSW62ExcelRow } from "@/lib/customExcelParser";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const budgetLineItemSchema = z.object({
  lineItemNumber: z.string().min(1, "Line item number is required"),
  lineItemName: z.string().min(1, "Line item name is required"),
  unconvertedUnitOfMeasure: z.string().min(1, "Unit of measure is required"),
  unconvertedQty: z.string().min(1, "Quantity is required"),
  actualQty: z.string().default("0"),
  unitCost: z.string().min(1, "Unit cost is required"),
  unitTotal: z.string().min(1, "Unit total is required"),
  convertedQty: z.string().optional(),
  convertedUnitOfMeasure: z.string().optional(),
  conversionFactor: z.string().default("1"),
  costCode: z.string().min(1, "Cost code is required"),
  productionRate: z.string().optional(),
  hours: z.string().optional(),
  budgetTotal: z.string().min(1, "Budget total is required"),
  billing: z.string().default("0"),
  laborCost: z.string().default("0"),
  equipmentCost: z.string().default("0"),
  truckingCost: z.string().default("0"),
  dumpFeesCost: z.string().default("0"),
  materialCost: z.string().default("0"),
  subcontractorCost: z.string().default("0"),
  notes: z.string().optional(),
});

export default function BudgetManagement() {
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedLocation, setSelectedLocation] = useState<string>("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [inputValues, setInputValues] = useState<Map<string, string>>(new Map());

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateTimeoutRef = useRef<Map<number, NodeJS.Timeout>>(new Map());


  const handleInlineUpdate = useCallback(async (itemId: number, updatedItem: any) => {
    try {
      const response = await fetch(`/api/budget/${itemId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatedItem),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/locations", selectedLocation, "budget"] });
      
      toast({
        title: "Success",
        description: "Budget item updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update budget item",
        variant: "destructive",
      });
    }
  }, [queryClient, selectedLocation, toast]);

  // Debounced update function - only calls API after user stops typing
  const debouncedUpdate = useCallback((itemId: number, updatedItem: any, delay: number = 500) => {
    // Clear existing timeout for this item
    const existingTimeout = updateTimeoutRef.current.get(itemId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout for API call
    const timeout = setTimeout(async () => {
      try {
        await handleInlineUpdate(itemId, updatedItem);
      } catch (error) {
        console.error('Failed to update item:', error);
      }
      updateTimeoutRef.current.delete(itemId);
    }, delay);

    updateTimeoutRef.current.set(itemId, timeout);
  }, [handleInlineUpdate]);

  // Immediate update function for when user presses Enter or clicks away
  const immediateUpdate = useCallback(async (itemId: number, updatedItem: any) => {
    // Clear any pending timeout
    const existingTimeout = updateTimeoutRef.current.get(itemId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      updateTimeoutRef.current.delete(itemId);
    }
    
    try {
      await handleInlineUpdate(itemId, updatedItem);
    } catch (error) {
      console.error('Failed to update item:', error);
    }
  }, [handleInlineUpdate]);

  // Helper functions for input values
  const getInputValue = useCallback((itemId: number, field: string, defaultValue: string) => {
    const key = `${itemId}-${field}`;
    return inputValues.get(key) ?? defaultValue;
  }, [inputValues]);

  const setInputValue = useCallback((itemId: number, field: string, value: string) => {
    const key = `${itemId}-${field}`;
    setInputValues(prev => new Map(prev).set(key, value));
  }, []);

  const clearInputValue = useCallback((itemId: number, field: string) => {
    const key = `${itemId}-${field}`;
    setInputValues(prev => {
      const newMap = new Map(prev);
      newMap.delete(key);
      return newMap;
    });
  }, []);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      updateTimeoutRef.current.forEach(timeout => clearTimeout(timeout));
      updateTimeoutRef.current.clear();
    };
  }, []);







  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 30000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["/api/projects", selectedProject, "locations"],
    enabled: !!selectedProject,
    staleTime: 30000,
  });

  const { data: budgetItems = [], isLoading: budgetLoading } = useQuery({
    queryKey: ["/api/locations", selectedLocation, "budget"],
    enabled: !!selectedLocation,
    staleTime: 30000,
  });

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Number(amount) || 0);
  };

  const getTotalBudget = () => {
    return (budgetItems as any[]).reduce((sum: number, item: any) => sum + (parseFloat(item.budgetTotal) || 0), 0);
  };

  const form = useForm<z.infer<typeof budgetLineItemSchema>>({
    resolver: zodResolver(budgetLineItemSchema),
    defaultValues: {
      lineItemNumber: "",
      lineItemName: "",
      unconvertedUnitOfMeasure: "",
      unconvertedQty: "",
      actualQty: "0",
      unitCost: "",
      unitTotal: "",
      convertedQty: "",
      convertedUnitOfMeasure: "",
      conversionFactor: "1",
      costCode: "",
      productionRate: "",
      hours: "",
      budgetTotal: "",
      billing: "0",
      laborCost: "0",
      equipmentCost: "0",
      truckingCost: "0",
      dumpFeesCost: "0",
      materialCost: "0",
      subcontractorCost: "0",
      notes: "",
    },
  });

  const editForm = useForm<z.infer<typeof budgetLineItemSchema>>({
    resolver: zodResolver(budgetLineItemSchema),
    defaultValues: {
      lineItemNumber: "",
      lineItemName: "",
      unconvertedUnitOfMeasure: "",
      unconvertedQty: "",
      actualQty: "0",
      unitCost: "",
      unitTotal: "",
      convertedQty: "",
      convertedUnitOfMeasure: "",
      conversionFactor: "1",
      costCode: "",
      productionRate: "",
      hours: "",
      budgetTotal: "",
      billing: "0",
      laborCost: "0",
      equipmentCost: "0",
      truckingCost: "0",
      dumpFeesCost: "0",
      materialCost: "0",
      subcontractorCost: "0",
      notes: "",
    },
  });

  const updateBudgetItemMutation = useMutation({
    mutationFn: async (data: { id: number; updates: Partial<z.infer<typeof budgetLineItemSchema>> }) => {
      const response = await fetch(`/api/budget/${data.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data.updates),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations", selectedLocation, "budget"] });
      setShowEditDialog(false);
      setEditingItem(null);
      editForm.reset();
      toast({
        title: "Success",
        description: "Budget line item updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update budget line item",
        variant: "destructive",
      });
    },
  });

  const createBudgetItemMutation = useMutation({
    mutationFn: async (data: z.infer<typeof budgetLineItemSchema>) => {
      const response = await fetch(`/api/locations/${selectedLocation}/budget`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations", selectedLocation, "budget"] });
      setShowAddDialog(false);
      form.reset();
      toast({
        title: "Success",
        description: "Budget line item created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create budget line item",
        variant: "destructive",
      });
    },
  });

  const handleDeleteBudgetItem = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this budget item?')) {
      try {
        const response = await fetch(`/api/budget/${id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        queryClient.invalidateQueries({ queryKey: ["/api/locations", selectedLocation, "budget"] });
        toast({
          title: "Success",
          description: "Budget item deleted successfully",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete budget item",
          variant: "destructive",
        });
      }
    }
  };

  const recalculateParentHours = async (parentItem: any) => {
    try {
      const parentHours = getParentHoursSum(parentItem);
      const updatedParent = {
        ...parentItem,
        hours: parentHours.toFixed(2)
      };
      
      // Use immediate update for parent hours recalculation
      await handleInlineUpdate(parentItem.id, updatedParent);
    } catch (error) {
      console.error('Failed to recalculate parent hours:', error);
    }
  };

  const handleQuantityChange = async (itemId: number, newQuantity: string) => {
    try {
      const currentItem = (budgetItems as any[]).find((item: any) => item.id === itemId);
      if (!currentItem) return;

      const recalculatedItem = recalculateOnQtyChange(currentItem, newQuantity);
      
      const response = await fetch(`/api/budget/${itemId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(recalculatedItem),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // If this is a child item, recalculate parent hours
      if (isChildItem(currentItem)) {
        const parentId = getParentId(currentItem);
        const parentItem = (budgetItems as any[]).find((item: any) => item.lineItemNumber === parentId);
        if (parentItem) {
          await recalculateParentHours(parentItem);
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/locations", selectedLocation, "budget"] });
      
      toast({
        title: "Success",
        description: "Budget item updated with new calculations",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update budget item",
        variant: "destructive",
      });
    }
  };

  const handleEditItem = (item: any) => {
    setEditingItem(item);
    editForm.reset({
      lineItemNumber: item.lineItemNumber,
      lineItemName: item.lineItemName,
      unconvertedUnitOfMeasure: item.unconvertedUnitOfMeasure,
      unconvertedQty: item.unconvertedQty,
      actualQty: item.actualQty || "0",
      unitCost: item.unitCost,
      unitTotal: item.unitTotal,
      convertedQty: item.convertedQty || "",
      convertedUnitOfMeasure: item.convertedUnitOfMeasure || "",
      conversionFactor: item.conversionFactor || "1",
      costCode: item.costCode,
      productionRate: item.productionRate || "",
      hours: item.hours || "",
      budgetTotal: item.budgetTotal,
      billing: item.billing || "0",
      laborCost: item.laborCost || "0",
      equipmentCost: item.equipmentCost || "0",
      truckingCost: item.truckingCost || "0",
      dumpFeesCost: item.dumpFeesCost || "0",
      materialCost: item.materialCost || "0",
      subcontractorCost: item.subcontractorCost || "0",
      notes: item.notes || "",
    });
    setShowEditDialog(true);
  };

  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const isParentItem = (item: any) => {
    return item.lineItemNumber && !item.lineItemNumber.includes('.');
  };

  const isChildItem = (item: any) => {
    return item.lineItemNumber && item.lineItemNumber.includes('.');
  };

  const getParentId = (item: any) => {
    if (isChildItem(item)) {
      return item.lineItemNumber.split('.')[0];
    }
    return null;
  };

  const hasChildren = (parentItem: any) => {
    const items = budgetItems as any[];
    return items.some(child => 
      isChildItem(child) && getParentId(child) === parentItem.lineItemNumber
    );
  };

  const getParentQuantitySum = (parentItem: any) => {
    const items = budgetItems as any[];
    const children = items.filter(child => 
      isChildItem(child) && getParentId(child) === parentItem.lineItemNumber
    );
    return children.reduce((sum, child) => sum + (parseFloat(child.convertedQty) || 0), 0);
  };

  const getParentUnconvertedQtySum = (parentItem: any) => {
    const items = budgetItems as any[];
    const children = items.filter(child => 
      isChildItem(child) && getParentId(child) === parentItem.lineItemNumber
    );
    return children.reduce((sum, child) => sum + (parseFloat(child.unconvertedQty) || 0), 0);
  };

  const getParentHoursSum = (parentItem: any) => {
    const items = budgetItems as any[];
    const children = items.filter(child => 
      isChildItem(child) && getParentId(child) === parentItem.lineItemNumber
    );
    return children.reduce((sum, child) => sum + (parseFloat(child.hours) || 0), 0);
  };

  const updateChildrenPXRate = useCallback(async (parentItem: any, newPX: string) => {
    const items = budgetItems as any[];
    const children = items.filter(child => 
      isChildItem(child) && getParentId(child) === parentItem.lineItemNumber
    );
    
    // Update all children with new PX rate immediately
    for (const child of children) {
      const convertedQty = parseFloat(child.convertedQty || '0');
      const newHours = convertedQty * parseFloat(newPX);
      
      const updatedChild = {
        ...child,
        productionRate: newPX,
        hours: newHours.toFixed(2)
      };
      
      // Use immediate update for children when parent PX changes
      try {
        await handleInlineUpdate(child.id, updatedChild);
      } catch (error) {
        console.error('Failed to update child:', error);
      }
    }
  }, [budgetItems, handleInlineUpdate]);

  const getVisibleItems = () => {
    const items = budgetItems as any[];
    const visibleItems = [];
    
    for (const item of items) {
      if (isParentItem(item)) {
        visibleItems.push(item);
        if (expandedItems.has(item.lineItemNumber)) {
          // Add children
          const children = items.filter(child => 
            isChildItem(child) && getParentId(child) === item.lineItemNumber
          );
          visibleItems.push(...children);
        }
      } else if (!isChildItem(item)) {
        // Items that are neither parent nor child (standalone items)
        visibleItems.push(item);
      }
    }
    
    return visibleItems;
  };

  const handleExcelImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      if (!selectedLocation) {
        toast({
          title: "Error",
          description: "Please select a location first",
          variant: "destructive",
        });
        return;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        // Use the "full location" sheet, "Line Items" sheet, or first sheet
        let sheetName = workbook.SheetNames[0];
        if (workbook.SheetNames.includes('full location')) {
          sheetName = 'full location';
        } else if (workbook.SheetNames.includes('Line Items')) {
          sheetName = 'Line Items';
        }
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON array
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Skip header row and process data
        const budgetItems = [];
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as any[];
          
          // Try SW62 format first, then fall back to standard format
          let budgetItem = parseSW62ExcelRow(row, parseInt(selectedLocation));
          if (!budgetItem) {
            budgetItem = parseExcelRowToBudgetItem(row, parseInt(selectedLocation));
          }
          
          if (budgetItem) {
            budgetItems.push(budgetItem);
          }
        }
        
        if (budgetItems.length === 0) {
          toast({
            title: "Warning",
            description: "No valid budget items found in the Excel file",
            variant: "destructive",
          });
          return;
        }
        
        // Import all budget items
        let successCount = 0;
        for (const item of budgetItems) {
          try {
            const response = await fetch(`/api/locations/${selectedLocation}/budget`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(item),
            });
            
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            successCount++;
          } catch (error) {
            console.error('Error importing budget item:', error);
          }
        }
        
        // Refresh the budget data
        queryClient.invalidateQueries({ queryKey: ["/api/locations", selectedLocation, "budget"] });
        
        toast({
          title: "Success",
          description: `Successfully imported ${successCount} budget items from Excel`,
        });
        
      } catch (error) {
        console.error('Excel import error:', error);
        toast({
          title: "Error",
          description: "Failed to import Excel file. Please check the file format.",
          variant: "destructive",
        });
      }
    };
    input.click();
  };

  const onSubmit = (data: z.infer<typeof budgetLineItemSchema>) => {
    createBudgetItemMutation.mutate(data);
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
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-strong">Budget Management</h2>
            <p className="text-subtle mt-1">Track project budgets and line items</p>
          </div>
          <div className="flex items-center space-x-4">
            <Button 
              variant="outline" 
              className="flex items-center space-x-2"
              onClick={handleExcelImport}
              disabled={!selectedLocation}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Import Excel</span>
            </Button>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button 
                  className="bg-primary hover:bg-primary/90"
                  disabled={!selectedLocation}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Line Item
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add Budget Line Item</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="lineItemNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Line Item Number</FormLabel>
                            <FormControl>
                              <Input placeholder="1.1" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="costCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cost Code</FormLabel>
                            <FormControl>
                              <Input placeholder="CONCRETE" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="lineItemName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Line Item Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Concrete Forms" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="unconvertedQty"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quantity</FormLabel>
                            <FormControl>
                              <Input placeholder="100" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="unconvertedUnitOfMeasure"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Unit of Measure</FormLabel>
                            <FormControl>
                              <Input placeholder="SF" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="unitCost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Unit Cost</FormLabel>
                            <FormControl>
                              <Input placeholder="25.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="unitTotal"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit Total</FormLabel>
                          <FormControl>
                            <Input placeholder="2500.00" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="budgetTotal"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Budget Total</FormLabel>
                          <FormControl>
                            <Input placeholder="2500.00" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="laborCost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Labor Cost</FormLabel>
                            <FormControl>
                              <Input placeholder="1000.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="materialCost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Material Cost</FormLabel>
                            <FormControl>
                              <Input placeholder="600.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="equipmentCost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Equipment Cost</FormLabel>
                            <FormControl>
                              <Input placeholder="500.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="truckingCost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Trucking Cost</FormLabel>
                            <FormControl>
                              <Input placeholder="200.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Optional notes about this line item" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end space-x-2">
                      <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createBudgetItemMutation.isPending}>
                        {createBudgetItemMutation.isPending ? "Adding..." : "Add Line Item"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="p-6">
        <div className="space-y-6">
          {/* Project and Location Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Select Project</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={selectedProject} onValueChange={(value) => {
                  setSelectedProject(value);
                  setSelectedLocation(""); // Reset location when project changes
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects as any[]).map((project: any) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name} ({project.projectId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Select Location</CardTitle>
              </CardHeader>
              <CardContent>
                <Select 
                  value={selectedLocation} 
                  onValueChange={setSelectedLocation}
                  disabled={!selectedProject}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a location" />
                  </SelectTrigger>
                  <SelectContent>
                    {(locations as any[]).map((location: any) => (
                      <SelectItem key={location.id} value={location.id.toString()}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </div>

          {selectedLocation && (
            <>
              {/* Budget Summary */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <DollarSign className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="text-sm text-subtle">Total Budget</p>
                        <p className="text-2xl font-bold text-green-600">
                          {formatCurrency(getTotalBudget())}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <Calculator className="w-5 h-5 text-blue-600" />
                      <div>
                        <p className="text-sm text-subtle">Line Items</p>
                        <p className="text-2xl font-bold text-blue-600">{(budgetItems as any[]).length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <DollarSign className="w-5 h-5 text-orange-600" />
                      <div>
                        <p className="text-sm text-subtle">Labor Budget</p>
                        <p className="text-2xl font-bold text-orange-600">
                          {formatCurrency((budgetItems as any[]).reduce((sum: number, item: any) => sum + (parseFloat(item.laborCost) || 0), 0))}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <DollarSign className="w-5 h-5 text-purple-600" />
                      <div>
                        <p className="text-sm text-subtle">Material Budget</p>
                        <p className="text-2xl font-bold text-purple-600">
                          {formatCurrency((budgetItems as any[]).reduce((sum: number, item: any) => sum + (parseFloat(item.materialCost) || 0), 0))}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Budget Items Table */}
              <Card className="w-full">
                <CardHeader>
                  <CardTitle>Budget Line Items</CardTitle>
                </CardHeader>
                <CardContent>
                  {budgetLoading ? (
                    <Skeleton className="h-64" />
                  ) : (budgetItems as any[]).length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted">No budget items found for this project</p>
                      <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add First Line Item
                      </Button>
                    </div>
                  ) : (
              <div className="w-full overflow-x-auto">
                <div className="min-w-[1400px] max-h-[500px] overflow-y-auto">
                    <Table className="w-full">
                        <TableHeader className="sticky top-0 bg-white z-10">
                          <TableRow>
                            <TableHead className="w-20 sticky top-0 bg-white border-b">Line Item</TableHead>
                            <TableHead className="min-w-60 sticky top-0 bg-white border-b">Description</TableHead>
                            <TableHead className="w-16 sticky top-0 bg-white border-b">Unit</TableHead>
                            <TableHead className="w-20 sticky top-0 bg-white border-b">Qty</TableHead>
                            <TableHead className="w-24 sticky top-0 bg-white border-b">Unit Cost</TableHead>
                            <TableHead className="w-20 sticky top-0 bg-white border-b">Conv. UM</TableHead>
                            <TableHead className="w-24 sticky top-0 bg-white border-b">Conv. Qty</TableHead>
                            <TableHead className="w-20 sticky top-0 bg-white border-b">PX</TableHead>
                            <TableHead className="w-20 sticky top-0 bg-white border-b">Hours</TableHead>
                            <TableHead className="w-24 sticky top-0 bg-white border-b">Labor Cost</TableHead>
                            <TableHead className="w-24 sticky top-0 bg-white border-b">Equipment</TableHead>
                            <TableHead className="w-24 sticky top-0 bg-white border-b">Trucking</TableHead>
                            <TableHead className="w-24 sticky top-0 bg-white border-b">Dump Fees</TableHead>
                            <TableHead className="w-24 sticky top-0 bg-white border-b">Material</TableHead>
                            <TableHead className="w-24 sticky top-0 bg-white border-b">Sub</TableHead>
                            <TableHead className="w-24 sticky top-0 bg-white border-b">Budget</TableHead>
                            <TableHead className="w-24 sticky top-0 bg-white border-b">Billings</TableHead>
                            <TableHead className="w-24 sticky right-0 top-0 bg-white z-20 border-b">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getVisibleItems().map((item: any) => {
                            const isParent = isParentItem(item);
                            const isChild = isChildItem(item);
                            
                            // Helper function to format numbers without unnecessary decimals
                            const formatNumber = (value: string | number) => {
                              const num = parseFloat(value?.toString() || '0');
                              return num % 1 === 0 ? num.toString() : num.toFixed(2);
                            };
                            
                            return (
                              <TableRow key={item.id} className={isChild ? 'bg-gray-50' : ''}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center">
                                    {isParent && hasChildren(item) && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => toggleExpanded(item.lineItemNumber)}
                                        className="p-0 h-auto w-4 mr-2"
                                      >
                                        {expandedItems.has(item.lineItemNumber) ? 
                                          <ChevronDown className="w-4 h-4" /> : 
                                          <ChevronRight className="w-4 h-4" />
                                        }
                                      </Button>
                                    )}
                                    {(isChild || (isParent && !hasChildren(item))) && <span className="w-6"></span>}
                                    {item.lineItemNumber}
                                  </div>
                                </TableCell>
                                <TableCell className="max-w-60" title={item.lineItemName}>
                                  <div className={`${isChild ? 'pl-4' : ''} ${isParent ? 'font-semibold' : ''}`}>
                                    {item.lineItemName}
                                  </div>
                                </TableCell>
                                <TableCell>{item.unconvertedUnitOfMeasure}</TableCell>
                                <TableCell>
                                  {isParent && hasChildren(item) ? (
                                    <span className="text-gray-600 font-medium">
                                      {formatNumber(getParentUnconvertedQtySum(item))}
                                    </span>
                                  ) : (
                                    <Input
                                      type="number"
                                      value={item.unconvertedQty}
                                      onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                      className="w-20 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      step="0.01"
                                    />
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(item.unitCost)}
                                </TableCell>
                                <TableCell>{item.convertedUnitOfMeasure || '-'}</TableCell>
                                <TableCell className="text-right">
                                  {isParent && hasChildren(item) ? (
                                    <span className="text-gray-600 font-medium">
                                      {formatNumber(getParentQuantitySum(item))}
                                    </span>
                                  ) : (
                                    formatNumber(item.convertedQty)
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    value={getInputValue(item.id, 'productionRate', item.productionRate || '')}
                                    onChange={(e) => {
                                      // Update local input value immediately
                                      setInputValue(item.id, 'productionRate', e.target.value);
                                      const isParent = isParentItem(item);
                                      const isChild = isChildItem(item);
                                      
                                      // Children cannot edit PX rate directly
                                      if (isChild) {
                                        toast({
                                          title: "Cannot Edit",
                                          description: "Child items inherit PX rate from parent",
                                          variant: "destructive"
                                        });
                                        return;
                                      }

                                      const newPX = parseFloat(e.target.value || '0');
                                      const convertedQty = isParent && hasChildren(item) ? 
                                        getParentQuantitySum(item) : 
                                        parseFloat(item.convertedQty || '0');
                                      
                                      if (newPX > 0 && convertedQty > 0) {
                                        // When PX is adjusted, calculate Hours = converted qty * PX
                                        const newHours = convertedQty * newPX;
                                        const updatedItem = {
                                          ...item,
                                          productionRate: e.target.value,
                                          hours: newHours.toFixed(2)
                                        };
                                        
                                        // Use debounced update for typing
                                        debouncedUpdate(item.id, updatedItem);
                                        
                                        // If this is a parent with children, update all children PX rates
                                        if (isParent && hasChildren(item)) {
                                          updateChildrenPXRate(item, e.target.value);
                                        }
                                      } else {
                                        // Just update the PX rate without hours calculation
                                        const updatedItem = {
                                          ...item,
                                          productionRate: e.target.value
                                        };
                                        debouncedUpdate(item.id, updatedItem);
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const isParent = isParentItem(item);
                                        const isChild = isChildItem(item);
                                        
                                        if (isChild) return;

                                        const newPX = parseFloat(e.currentTarget.value || '0');
                                        const convertedQty = isParent && hasChildren(item) ? 
                                          getParentQuantitySum(item) : 
                                          parseFloat(item.convertedQty || '0');
                                        
                                        if (newPX > 0 && convertedQty > 0) {
                                          const newHours = convertedQty * newPX;
                                          const updatedItem = {
                                            ...item,
                                            productionRate: e.currentTarget.value,
                                            hours: newHours.toFixed(2)
                                          };
                                          
                                          immediateUpdate(item.id, updatedItem);
                                          
                                          if (isParent && hasChildren(item)) {
                                            updateChildrenPXRate(item, e.currentTarget.value);
                                          }
                                        } else {
                                          const updatedItem = {
                                            ...item,
                                            productionRate: e.currentTarget.value
                                          };
                                          immediateUpdate(item.id, updatedItem);
                                        }
                                        e.currentTarget.blur();
                                      }
                                    }}
                                    onBlur={(e) => {
                                      const isParent = isParentItem(item);
                                      const isChild = isChildItem(item);
                                      
                                      if (isChild) return;

                                      const newPX = parseFloat(e.target.value || '0');
                                      const convertedQty = isParent && hasChildren(item) ? 
                                        getParentQuantitySum(item) : 
                                        parseFloat(item.convertedQty || '0');
                                      
                                      if (newPX > 0 && convertedQty > 0) {
                                        const newHours = convertedQty * newPX;
                                        const updatedItem = {
                                          ...item,
                                          productionRate: e.target.value,
                                          hours: newHours.toFixed(2)
                                        };
                                        
                                        immediateUpdate(item.id, updatedItem);
                                        
                                        if (isParent && hasChildren(item)) {
                                          updateChildrenPXRate(item, e.target.value);
                                        }
                                      } else {
                                        const updatedItem = {
                                          ...item,
                                          productionRate: e.target.value
                                        };
                                        immediateUpdate(item.id, updatedItem);
                                        clearInputValue(item.id, 'productionRate');
                                      }
                                    }}
                                    className={`w-20 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                      isChildItem(item) ? 'bg-gray-100 cursor-not-allowed' : ''
                                    }`}
                                    step="0.01"
                                    disabled={isChildItem(item)}
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    value={getInputValue(item.id, 'hours', item.hours || '')}
                                    placeholder={isParentItem(item) && hasChildren(item) ? 
                                      `Sum: ${getParentHoursSum(item).toFixed(2)}` : 
                                      undefined
                                    }
                                    onChange={(e) => {
                                      // Update local input value immediately
                                      setInputValue(item.id, 'hours', e.target.value);
                                      const isParent = isParentItem(item);
                                      const isChild = isChildItem(item);
                                      
                                      // Children cannot edit hours directly
                                      if (isChild) {
                                        toast({
                                          title: "Cannot Edit",
                                          description: "Child items inherit hours from parent calculations",
                                          variant: "destructive"
                                        });
                                        return;
                                      }

                                      const newHours = parseFloat(e.target.value || '0');
                                      
                                      if (isParent && hasChildren(item)) {
                                        // Parent with children - manual hours change adjusts PX rate
                                        const parentQty = getParentQuantitySum(item);
                                        if (newHours > 0 && parentQty > 0) {
                                          const newPX = newHours / parentQty;
                                          const updatedItem = {
                                            ...item,
                                            hours: e.target.value,
                                            productionRate: newPX.toFixed(2)
                                          };
                                          
                                          // Update parent with debounced update
                                          debouncedUpdate(item.id, updatedItem);
                                          
                                          // Update all children PX rates
                                          updateChildrenPXRate(item, newPX.toFixed(2));
                                        } else {
                                          const updatedItem = {
                                            ...item,
                                            hours: e.target.value
                                          };
                                          debouncedUpdate(item.id, updatedItem);
                                        }
                                      } else {
                                        // Single item or child - normal hours change
                                        const convertedQty = parseFloat(item.convertedQty || '0');
                                        
                                        if (newHours > 0 && convertedQty > 0) {
                                          // When hours change, calculate PX = hours / convertedQty
                                          const newPX = newHours / convertedQty;
                                          const updatedItem = {
                                            ...item,
                                            hours: e.target.value,
                                            productionRate: newPX.toFixed(2)
                                          };
                                          
                                          debouncedUpdate(item.id, updatedItem);
                                        } else {
                                          // Just update the hours without PX calculation
                                          const updatedItem = {
                                            ...item,
                                            hours: e.target.value
                                          };
                                          debouncedUpdate(item.id, updatedItem);
                                        }
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const isParent = isParentItem(item);
                                        const isChild = isChildItem(item);
                                        
                                        if (isChild) return;

                                        const newHours = parseFloat(e.currentTarget.value || '0');
                                        
                                        if (isParent && hasChildren(item)) {
                                          const parentQty = getParentQuantitySum(item);
                                          if (newHours > 0 && parentQty > 0) {
                                            const newPX = newHours / parentQty;
                                            const updatedItem = {
                                              ...item,
                                              hours: e.currentTarget.value,
                                              productionRate: newPX.toFixed(2)
                                            };
                                            
                                            immediateUpdate(item.id, updatedItem);
                                            updateChildrenPXRate(item, newPX.toFixed(2));
                                          } else {
                                            const updatedItem = {
                                              ...item,
                                              hours: e.currentTarget.value
                                            };
                                            immediateUpdate(item.id, updatedItem);
                                          }
                                        } else {
                                          const convertedQty = parseFloat(item.convertedQty || '0');
                                          
                                          if (newHours > 0 && convertedQty > 0) {
                                            const newPX = newHours / convertedQty;
                                            const updatedItem = {
                                              ...item,
                                              hours: e.currentTarget.value,
                                              productionRate: newPX.toFixed(2)
                                            };
                                            
                                            immediateUpdate(item.id, updatedItem);
                                          } else {
                                            const updatedItem = {
                                              ...item,
                                              hours: e.currentTarget.value
                                            };
                                            immediateUpdate(item.id, updatedItem);
                                          }
                                        }
                                        clearInputValue(item.id, 'hours');
                                        e.currentTarget.blur();
                                      }
                                    }}
                                    onBlur={(e) => {
                                      const isParent = isParentItem(item);
                                      const isChild = isChildItem(item);
                                      
                                      if (isChild) return;

                                      const newHours = parseFloat(e.target.value || '0');
                                      
                                      if (isParent && hasChildren(item)) {
                                        const parentQty = getParentQuantitySum(item);
                                        if (newHours > 0 && parentQty > 0) {
                                          const newPX = newHours / parentQty;
                                          const updatedItem = {
                                            ...item,
                                            hours: e.target.value,
                                            productionRate: newPX.toFixed(2)
                                          };
                                          
                                          immediateUpdate(item.id, updatedItem);
                                          updateChildrenPXRate(item, newPX.toFixed(2));
                                        } else {
                                          const updatedItem = {
                                            ...item,
                                            hours: e.target.value
                                          };
                                          immediateUpdate(item.id, updatedItem);
                                        }
                                      } else {
                                        const convertedQty = parseFloat(item.convertedQty || '0');
                                        
                                        if (newHours > 0 && convertedQty > 0) {
                                          const newPX = newHours / convertedQty;
                                          const updatedItem = {
                                            ...item,
                                            hours: e.target.value,
                                            productionRate: newPX.toFixed(2)
                                          };
                                          
                                          immediateUpdate(item.id, updatedItem);
                                        } else {
                                          const updatedItem = {
                                            ...item,
                                            hours: e.target.value
                                          };
                                          immediateUpdate(item.id, updatedItem);
                                        }
                                      }
                                      clearInputValue(item.id, 'hours');
                                    }}
                                    className={`w-20 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                      isChildItem(item) ? 'bg-gray-100 cursor-not-allowed' : ''
                                    } ${
                                      isParentItem(item) && hasChildren(item) ? 'bg-blue-50 border-blue-200' : ''
                                    }`}
                                    step="0.01"
                                    disabled={isChildItem(item)}
                                  />
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(item.laborCost || 0)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(item.equipmentCost || 0)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(item.truckingCost || 0)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(item.dumpFeesCost || 0)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(item.materialCost || 0)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(item.subcontractorCost || 0)}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(item.budgetTotal || 0)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(item.billing || 0)}
                                </TableCell>
                                <TableCell className="sticky right-0 bg-white z-10 border-l border-gray-200">
                                  <div className="flex space-x-1">
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => handleEditItem(item)}
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="text-red-500 hover:text-red-700"
                                      onClick={() => handleDeleteBudgetItem(item.id)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                            </TableRow>
                            );
                          })}
                        </TableBody>
                        </Table>
                    </div>
                  </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Budget Line Item</DialogTitle>
            <DialogDescription>
              Edit the budget line item details including quantities, rates, and costs.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((data) => {
              if (editingItem) {
                updateBudgetItemMutation.mutate({
                  id: editingItem.id,
                  updates: data
                });
              }
            })} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="lineItemNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Line Item Number</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="costCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost Code</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="lineItemName"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="unconvertedUnitOfMeasure"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit of Measure</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="unconvertedQty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="unitCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Cost</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="productionRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PX (Production Rate)</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="number" 
                          step="0.01"
                          className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          onChange={(e) => {
                            field.onChange(e);
                            // Auto-calculate hours when PX changes
                            const convertedQty = parseFloat(editForm.getValues("convertedQty") || "0");
                            const newPX = parseFloat(e.target.value || "0");
                            if (newPX > 0 && convertedQty > 0) {
                              const newHours = convertedQty / newPX;
                              editForm.setValue("hours", newHours.toFixed(2));
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="hours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hours</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="number" 
                          step="0.01"
                          className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          onChange={(e) => {
                            field.onChange(e);
                            // Auto-calculate PX when hours change
                            const convertedQty = parseFloat(editForm.getValues("convertedQty") || "0");
                            const newHours = parseFloat(e.target.value || "0");
                            if (newHours > 0 && convertedQty > 0) {
                              const newPX = convertedQty / newHours;
                              editForm.setValue("productionRate", newPX.toFixed(2));
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="laborCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Labor Cost</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="equipmentCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Equipment Cost</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="materialCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Material Cost</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="subcontractorCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subcontractor Cost</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="budgetTotal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Budget Total</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateBudgetItemMutation.isPending}>
                  {updateBudgetItemMutation.isPending ? "Updating..." : "Update"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
