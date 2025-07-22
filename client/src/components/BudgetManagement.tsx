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
import { Plus, Upload, Edit, Trash2, DollarSign, Calculator, FileSpreadsheet, ChevronDown, ChevronRight, ArrowLeft, Home, Building2, MapPin } from "lucide-react";
import * as XLSX from 'xlsx';
import { parseExcelRowToBudgetItem, calculateBudgetFormulas, recalculateOnQtyChange } from "@/lib/budgetCalculations";
import { parseSW62ExcelRow } from "@/lib/customExcelParser";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useNavigationProtection } from "@/contexts/NavigationProtectionContext";

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
  const [isEditMode, setIsEditMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalValues, setOriginalValues] = useState<Map<string, any>>(new Map());
  const [selectedCostCodeFilter, setSelectedCostCodeFilter] = useState<string>('all');

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const updateTimeoutRef = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const { setHasUnsavedChanges: setGlobalUnsavedChanges, setNavigationHandlers } = useNavigationProtection();
  
  // Handle URL parameters for direct location budget access
  const [isDirectAccess, setIsDirectAccess] = useState(false);
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const locationId = urlParams.get('locationId');
    if (locationId) {
      setSelectedLocation(locationId);
      setIsDirectAccess(true);
    }
  }, []);


  const handleInlineUpdate = useCallback(async (itemId: number, updatedItem: any) => {
    try {
      // Clean up the data to ensure proper string formatting for decimal fields
      const cleanedItem = {
        ...updatedItem,
        // Ensure all decimal fields are strings
        productionRate: updatedItem.productionRate?.toString() || '0',
        hours: updatedItem.hours?.toString() || '0',
        unconvertedQty: updatedItem.unconvertedQty?.toString() || '0',
        convertedQty: updatedItem.convertedQty?.toString() || '0',
        unitCost: updatedItem.unitCost?.toString() || '0',
        unitTotal: updatedItem.unitTotal?.toString() || '0',
        budgetTotal: updatedItem.budgetTotal?.toString() || '0',
        conversionFactor: updatedItem.conversionFactor?.toString() || '1',
        // Remove undefined/null values
        ...(updatedItem.laborCost !== undefined && { laborCost: updatedItem.laborCost.toString() }),
        ...(updatedItem.equipmentCost !== undefined && { equipmentCost: updatedItem.equipmentCost.toString() }),
        ...(updatedItem.truckingCost !== undefined && { truckingCost: updatedItem.truckingCost.toString() }),
        ...(updatedItem.dumpFeesCost !== undefined && { dumpFeesCost: updatedItem.dumpFeesCost.toString() }),
        ...(updatedItem.materialCost !== undefined && { materialCost: updatedItem.materialCost.toString() }),
        ...(updatedItem.subcontractorCost !== undefined && { subcontractorCost: updatedItem.subcontractorCost.toString() }),
        ...(updatedItem.billing !== undefined && { billing: updatedItem.billing.toString() }),
        ...(updatedItem.actualQty !== undefined && { actualQty: updatedItem.actualQty.toString() }),
      };
      
      const response = await fetch(`/api/budget/${itemId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(cleanedItem),
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Update failed:', errorData);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/locations", selectedLocation, "budget"] });
      
      toast({
        title: "Success",
        description: "Budget item updated successfully",
      });
      
      // Reset unsaved changes flag after successful update
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Update error:', error);
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
    setHasUnsavedChanges(true);
    setGlobalUnsavedChanges(true);
  }, [setGlobalUnsavedChanges]);

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

  // Warn about unsaved changes when navigating away
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    if (hasUnsavedChanges) {
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, [hasUnsavedChanges]);

  // Store original values when entering edit mode
  const enterEditMode = () => {
    const originalValues = new Map();
    (budgetItems as any[]).forEach(item => {
      originalValues.set(item.id, { ...item });
    });
    setOriginalValues(originalValues);
    setIsEditMode(true);
  };

  // Register navigation handlers when component mounts
  useEffect(() => {
    setNavigationHandlers({
      onSave: saveAllChanges,
      onCancel: cancelChanges,
    });
  }, [setNavigationHandlers]);

  // Save all changes at once
  const saveAllChanges = async () => {
    try {
      const items = budgetItems as any[];
      const promises = [];
      
      for (const item of items) {
        const hasChanges = 
          getInputValue(item.id, 'unconvertedQty', '') !== '' ||
          getInputValue(item.id, 'productionRate', '') !== '' ||
          getInputValue(item.id, 'hours', '') !== '';
        
        if (hasChanges) {
          const updatedItem = {
            ...item,
            unconvertedQty: getInputValue(item.id, 'unconvertedQty', item.unconvertedQty),
            productionRate: getInputValue(item.id, 'productionRate', item.productionRate),
            hours: getInputValue(item.id, 'hours', item.hours),
            convertedQty: getInputValue(item.id, 'convertedQty', item.convertedQty)
          };
          
          promises.push(handleInlineUpdate(item.id, updatedItem));
        }
      }
      
      await Promise.all(promises);
      setIsEditMode(false);
      setHasUnsavedChanges(false);
      setGlobalUnsavedChanges(false);
      setInputValues(new Map());
      
      toast({
        title: "Success",
        description: "All changes have been saved",
      });
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to save changes",
        variant: "destructive",
      });
    }
  };

  // Cancel changes and restore original values
  const cancelChanges = () => {
    setIsEditMode(false);
    setHasUnsavedChanges(false);
    setGlobalUnsavedChanges(false);
    setInputValues(new Map());
    queryClient.invalidateQueries({ queryKey: ["/api/locations", selectedLocation, "budget"] });
    
    toast({
      title: "Changes Cancelled",
      description: "All unsaved changes have been discarded",
    });
  };









  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 30000,
  });

  // Fetch current location details for breadcrumbs
  const { data: currentLocation, isLoading: locationLoading } = useQuery({
    queryKey: ["/api/locations", selectedLocation],
    enabled: !!selectedLocation,
    staleTime: 30000,
  });

  // Fetch current project details for breadcrumbs
  const { data: currentProject, isLoading: projectLoading } = useQuery({
    queryKey: ["/api/projects", currentLocation?.projectId],
    enabled: !!currentLocation?.projectId,
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

  // Auto-set project when accessing via direct location access
  useEffect(() => {
    if (isDirectAccess && currentLocation?.projectId && !selectedProject) {
      setSelectedProject(currentLocation.projectId.toString());
    }
  }, [isDirectAccess, currentLocation, selectedProject]);

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Number(amount) || 0);
  };

  const formatNumber = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num);
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

  const recalculateParentFromChildren = async (parentItem: any, updatedChild?: any) => {
    try {
      // Get fresh budget items to ensure we have the latest data
      const freshBudgetResponse = await fetch(`/api/locations/${selectedLocation}/budget`);
      const freshBudgetItems = await freshBudgetResponse.json();
      
      // If we have an updated child, use it in the calculation
      let itemsToUse = freshBudgetItems;
      if (updatedChild) {
        itemsToUse = freshBudgetItems.map((item: any) => 
          item.id === updatedChild.id ? updatedChild : item
        );
      }
      
      // Calculate parent sums using fresh data
      const children = itemsToUse.filter((child: any) => 
        child.lineItemNumber?.includes('.') && 
        child.lineItemNumber?.split('.')[0] === parentItem.lineItemNumber
      );
      
      const parentHours = children.reduce((sum: number, child: any) => 
        sum + (parseFloat(child.hours) || 0), 0
      );
      
      const parentConvertedQty = children.reduce((sum: number, child: any) => 
        sum + (parseFloat(child.convertedQty) || 0), 0
      );
      
      // Parent QTY = Parent Conv QTY = Sum of children Conv QTY
      const updatedParent = {
        ...parentItem,
        hours: parentHours.toFixed(2),
        convertedQty: parentConvertedQty.toFixed(2),
        unconvertedQty: parentConvertedQty.toFixed(2) // QTY should equal Conv QTY for parent
      };
      
      // Use immediate update for parent recalculation
      await handleInlineUpdate(parentItem.id, updatedParent);
    } catch (error) {
      console.error('Failed to recalculate parent from children:', error);
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
      
      // If this is a child item, recalculate parent from children
      if (isChildItem(currentItem)) {
        const parentId = getParentId(currentItem);
        const parentItem = (budgetItems as any[]).find((item: any) => item.lineItemNumber === parentId);
        if (parentItem) {
          await recalculateParentFromChildren(parentItem, recalculatedItem);
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/locations", selectedLocation, "budget"] });
      
      // Reset unsaved changes flag after successful update
      setHasUnsavedChanges(false);
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

  const getChildren = (parentItem: any) => {
    const items = budgetItems as any[];
    return items.filter(child => 
      isChildItem(child) && getParentId(child) === parentItem.lineItemNumber
    );
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
        // Check if parent should be shown based on cost code filter
        const shouldShowParent = selectedCostCodeFilter === 'all' || item.costCode === selectedCostCodeFilter;
        
        if (shouldShowParent) {
          visibleItems.push(item);
          if (expandedItems.has(item.lineItemNumber)) {
            // Add children
            const children = items.filter(child => 
              isChildItem(child) && getParentId(child) === item.lineItemNumber
            );
            visibleItems.push(...children);
          }
        }
      } else if (!isChildItem(item)) {
        // Items that are neither parent nor child (standalone items)
        const shouldShowStandalone = selectedCostCodeFilter === 'all' || item.costCode === selectedCostCodeFilter;
        if (shouldShowStandalone) {
          visibleItems.push(item);
        }
      }
    }
    
    return visibleItems;
  };

  const getUniqueCostCodes = () => {
    const items = budgetItems as any[];
    const costCodes = new Set<string>();
    
    items.forEach(item => {
      if (item.costCode) {
        costCodes.add(item.costCode);
      }
    });
    
    return Array.from(costCodes).sort();
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
        {/* Breadcrumb Navigation - Always Visible */}
        <div className="mb-4">
          <nav className="flex items-center space-x-2 text-sm text-gray-600">
            <button
              onClick={() => setLocation("/")}
              className="p-1 h-auto hover:bg-gray-100 rounded flex items-center"
            >
              <Home className="w-4 h-4" />
            </button>
            <span>/</span>
            
            {currentProject ? (
              <>
                <button
                  onClick={() => setLocation(`/projects/${currentProject.id}`)}
                  className="p-1 h-auto hover:bg-gray-100 text-blue-600 hover:text-blue-800 rounded flex items-center"
                >
                  <Building2 className="w-4 h-4 mr-1" />
                  {currentProject.name}
                </button>
                <span>/</span>
              </>
            ) : (
              <>
                <span className="text-gray-400">
                  <Building2 className="w-4 h-4 mr-1 inline" />
                  Project
                </span>
                <span>/</span>
              </>
            )}
            
            {currentLocation ? (
              <>
                <button
                  onClick={() => setLocation(`/locations/${currentLocation.locationId}`)}
                  className="p-1 h-auto hover:bg-gray-100 text-blue-600 hover:text-blue-800 rounded flex items-center"
                >
                  <MapPin className="w-4 h-4 mr-1" />
                  {currentLocation.name}
                </button>
                <span>/</span>
              </>
            ) : (
              <>
                <span className="text-gray-400">
                  <MapPin className="w-4 h-4 mr-1 inline" />
                  Location
                </span>
                <span>/</span>
              </>
            )}
            
            <span className="text-gray-900 font-medium">Budget</span>
          </nav>
        </div>
        
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
          {(
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
                        <SelectItem key={location.locationId} value={location.locationId}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>
          )}

          {selectedLocation && (
            <>
              {/* Cost Code Summary Cards */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Cost Code Summary</h3>
                  {selectedCostCodeFilter !== 'all' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCostCodeFilter('all')}
                      className="text-sm"
                    >
                      Clear Filter
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(() => {
                  try {
                    const items = budgetItems as any[];
                    if (!items || items.length === 0) {
                      return (
                        <Card className="col-span-full">
                          <CardContent className="p-4">
                            <p className="text-center text-gray-500">No budget items found</p>
                          </CardContent>
                        </Card>
                      );
                    }

                    const costCodeGroups = items.reduce((groups: any, item: any) => {
                      if (!item) return groups;
                      
                      // Only include items that are either:
                      // 1. Parent items (have children)
                      // 2. Standalone items (no children and not a child)
                      // Skip child items to avoid double counting
                      const isParent = item.lineItemNumber && !item.lineItemNumber.includes('.');
                      const isChild = item.lineItemNumber && item.lineItemNumber.includes('.');
                      const hasChildren = items.some(child => 
                        child.lineItemNumber && child.lineItemNumber.includes('.') && 
                        child.lineItemNumber.split('.')[0] === item.lineItemNumber
                      );
                      
                      // Include if it's a parent OR if it's a standalone item (not a child and has no children)
                      if (isParent || (!isChild && !hasChildren)) {
                        const costCode = item.costCode || 'No Code';
                        if (!groups[costCode]) {
                          groups[costCode] = [];
                        }
                        groups[costCode].push(item);
                      }
                      
                      return groups;
                    }, {});

                    return Object.entries(costCodeGroups).map(([costCode, items]: [string, any[]]) => {
                      try {
                        const totalConvertedQty = items.reduce((sum, item) => sum + (parseFloat(item.convertedQty) || 0), 0);
                        const totalHours = items.reduce((sum, item) => sum + (parseFloat(item.hours) || 0), 0);
                        const totalValue = items.reduce((sum, item) => sum + (parseFloat(item.unitTotal) || 0), 0);
                        
                        // Skip cards where total converted quantity is 0
                        if (totalConvertedQty === 0) {
                          return null;
                        }
                        
                        // Calculate median PX rate
                        const pxRates = items.map(item => parseFloat(item.productionRate) || 0).filter(rate => rate > 0).sort((a, b) => a - b);
                        const medianPX = pxRates.length > 0 ? 
                          pxRates.length % 2 === 0 ? 
                            (pxRates[pxRates.length / 2 - 1] + pxRates[pxRates.length / 2]) / 2 : 
                            pxRates[Math.floor(pxRates.length / 2)] : 0;

                        return (
                          <Card 
                            key={costCode} 
                            data-cost-code-card={costCode}
                            className={`hover:shadow-md transition-all cursor-pointer ${
                              selectedCostCodeFilter === costCode ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                            }`}
                            onClick={() => {
                              if (selectedCostCodeFilter === costCode) {
                                setSelectedCostCodeFilter('all');
                              } else {
                                setSelectedCostCodeFilter(costCode);
                              }
                            }}
                          >
                            <CardContent className="p-4">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <h3 className="font-semibold text-sm text-gray-900">{costCode}</h3>
                                  <span className="text-xs text-gray-500">{items.length} items</span>
                                </div>
                                {selectedCostCodeFilter === costCode && (
                                  <div className="text-xs text-blue-600 font-medium">
                                    ✓ Filtering table
                                  </div>
                                )}
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <p className="text-gray-600">Conv. Qty</p>
                                    <p className="font-medium">{formatNumber(totalConvertedQty.toFixed(2))}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-600">Median PX</p>
                                    <p className="font-medium">{formatNumber(medianPX.toFixed(2))}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-600">Hours</p>
                                    <p className="font-medium">{formatNumber(totalHours.toFixed(2))}</p>
                                  </div>
                                  <div>
                                    <p className="text-gray-600">Value</p>
                                    <p className="font-medium text-blue-600">{formatCurrency(totalValue)}</p>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      } catch (error) {
                        console.error('Error rendering cost code card:', error);
                        return (
                          <Card key={costCode} className="bg-red-50 border-red-200">
                            <CardContent className="p-4">
                              <p className="text-red-600 text-sm">Error loading {costCode}</p>
                            </CardContent>
                          </Card>
                        );
                      }
                    }).filter(card => card !== null);
                  } catch (error) {
                    console.error('Error in cost code cards:', error);
                    return (
                      <Card className="col-span-full bg-red-50 border-red-200">
                        <CardContent className="p-4">
                          <p className="text-red-600 text-sm">Error loading cost code summary</p>
                        </CardContent>
                      </Card>
                    );
                  }
                })()}
                </div>
              </div>

              {/* Budget Items Table */}
              <Card className="w-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Budget Line Items</CardTitle>
                    <div className="flex gap-2 items-center">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium">Filter by Cost Code:</label>
                        <Select value={selectedCostCodeFilter} onValueChange={setSelectedCostCodeFilter}>
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="All Cost Codes" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Cost Codes</SelectItem>
                            {getUniqueCostCodes().map(costCode => (
                              <SelectItem key={costCode} value={costCode}>
                                {costCode}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {!isEditMode ? (
                        <Button
                          variant="outline"
                          onClick={enterEditMode}
                          className="flex items-center gap-2"
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            onClick={saveAllChanges}
                            className="flex items-center gap-2"
                          >
                            Save
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              if (hasUnsavedChanges) {
                                if (window.confirm('You have unsaved changes. Are you sure you want to cancel without saving?')) {
                                  cancelChanges();
                                }
                              } else {
                                cancelChanges();
                              }
                            }}
                            className="flex items-center gap-2"
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
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
              <div className="w-full border rounded-lg">
                <div className="overflow-auto max-h-[500px] relative">
                    <table className="w-full min-w-[1400px] border-collapse sticky-table">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                          <tr className="border-b">
                            <th className="w-20 sticky left-0 top-0 bg-gray-100 border-r z-20 px-4 py-3 text-left font-medium text-gray-900" style={{position: 'sticky', left: '0px', top: '0px'}}>Line Item</th>
                            <th className="min-w-60 sticky top-0 bg-gray-100 border-r z-20 px-4 py-3 text-left font-medium text-gray-900" style={{position: 'sticky', left: '80px', top: '0px'}}>Description</th>
                            <th className="w-20 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">Cost Code</th>
                            <th className="w-16 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">Unit</th>
                            <th className="w-20 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">Qty</th>
                            <th className="w-24 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">Unit Cost</th>
                            <th className="w-24 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">Unit Total</th>
                            <th className="w-20 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">Conv. UM</th>
                            <th className="w-24 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">Conv. Qty</th>
                            <th className="w-20 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">PX</th>
                            <th className="w-20 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">Hours</th>
                            <th className="w-24 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">Labor Cost</th>
                            <th className="w-24 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">Equipment</th>
                            <th className="w-24 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">Trucking</th>
                            <th className="w-24 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">Dump Fees</th>
                            <th className="w-24 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">Material</th>
                            <th className="w-24 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">Sub</th>
                            <th className="w-24 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">Budget</th>
                            <th className="w-24 sticky top-0 bg-gray-50 px-4 py-3 text-left font-medium text-gray-900">Billings</th>
                            {isEditMode && (
                              <th className="w-16 sticky right-0 top-0 bg-gray-100 z-20 border-l px-4 py-3 text-left font-medium text-gray-900">Delete</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {getVisibleItems().map((item: any) => {
                            const isParent = isParentItem(item);
                            const isChild = isChildItem(item);
                            
                            // Helper function to format numbers without unnecessary decimals
                            const formatNumber = (value: string | number) => {
                              const num = parseFloat(value?.toString() || '0');
                              return num % 1 === 0 ? num.toString() : num.toFixed(2);
                            };
                            
                            return (
                              <tr key={`budget-item-${item.id}-${item.lineItemNumber}`} className={`border-b ${isChild ? 'bg-gray-50' : 'bg-white'}`}>
                                <td className={`font-medium sticky left-0 border-r z-10 px-4 py-3 ${isChild ? 'bg-gray-100' : 'bg-gray-100'}`} style={{position: 'sticky', left: '0px'}}>
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
                                </td>
                                <td className={`max-w-60 sticky border-r z-10 px-4 py-3 ${isChild ? 'bg-gray-100' : 'bg-gray-100'}`} style={{position: 'sticky', left: '80px'}} title={item.lineItemName}>
                                  <div className={`${isChild ? 'pl-4' : ''} ${isParent ? 'font-semibold' : ''}`}>
                                    {item.lineItemName}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  {item.costCode || '-'}
                                </td>
                                <td className="px-4 py-3">{item.unconvertedUnitOfMeasure}</td>
                                <td className="px-4 py-3">
                                  {isParent && hasChildren(item) ? (
                                    <span className="text-gray-600 font-medium text-right w-20 inline-block">
                                      {formatNumber(getInputValue(item.id, 'unconvertedQty', getParentQuantitySum(item).toString()))}
                                    </span>
                                  ) : isEditMode ? (
                                    <Input
                                      type="number"
                                      value={getInputValue(item.id, 'unconvertedQty', item.unconvertedQty)}
                                      onChange={(e) => {
                                        setInputValue(item.id, 'unconvertedQty', e.target.value);
                                        
                                        // Recalculate derived values locally
                                        const newQty = parseFloat(e.target.value || '0');
                                        const conversionFactor = parseFloat(item.conversionFactor || '1');
                                        const newConvertedQty = newQty * conversionFactor;
                                        const px = parseFloat(getInputValue(item.id, 'productionRate', item.productionRate) || '0');
                                        const newHours = newConvertedQty * px;
                                        
                                        setInputValue(item.id, 'convertedQty', newConvertedQty.toFixed(2));
                                        setInputValue(item.id, 'hours', newHours.toFixed(2));
                                        
                                        // If this is a child item, update parent quantities and hours
                                        if (isChildItem(item)) {
                                          const parentId = getParentId(item);
                                          const parentItem = (budgetItems as any[]).find((parent: any) => parent.lineItemNumber === parentId);
                                          if (parentItem) {
                                            const children = getChildren(parentItem);
                                            
                                            // Update parent converted quantity (sum of children converted qty)
                                            const parentConvertedQty = children.reduce((sum, child) => {
                                              const childId = child.id === item.id ? item.id : child.id;
                                              const childConvQty = childId === item.id ? newConvertedQty : parseFloat(getInputValue(child.id, 'convertedQty', child.convertedQty) || '0');
                                              return sum + childConvQty;
                                            }, 0);
                                            
                                            // Update parent hours (sum of children hours)
                                            const parentHours = children.reduce((sum, child) => {
                                              const childId = child.id === item.id ? item.id : child.id;
                                              const childHours = childId === item.id ? newHours : parseFloat(getInputValue(child.id, 'hours', child.hours) || '0');
                                              return sum + childHours;
                                            }, 0);
                                            
                                            setInputValue(parentItem.id, 'convertedQty', parentConvertedQty.toFixed(2));
                                            setInputValue(parentItem.id, 'hours', parentHours.toFixed(2));
                                            
                                            // For parent items, Qty = Conv Qty
                                            setInputValue(parentItem.id, 'unconvertedQty', parentConvertedQty.toFixed(2));
                                          }
                                        }
                                      }}
                                      className="w-20 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      step="0.01"
                                    />
                                  ) : (
                                    <span className="text-right w-20 inline-block">
                                      {formatNumber(item.unconvertedQty)}
                                    </span>
                                  )}
                                </td>
                                <td className="text-right px-4 py-3">
                                  {formatCurrency(item.unitCost)}
                                </td>
                                <td className="text-right px-4 py-3">
                                  {formatCurrency(item.unitTotal)}
                                </td>
                                <td className="px-4 py-3">{item.convertedUnitOfMeasure || '-'}</td>
                                <td className="text-right px-4 py-3">
                                  {isParent && hasChildren(item) ? (
                                    <span className="text-gray-600 font-medium">
                                      {formatNumber(getInputValue(item.id, 'convertedQty', getParentQuantitySum(item).toString()))}
                                    </span>
                                  ) : (
                                    formatNumber(getInputValue(item.id, 'convertedQty', item.convertedQty))
                                  )}
                                </td>
                                <td className="text-right px-4 py-3">
                                  {isEditMode ? (
                                    <Input
                                      type="number"
                                      value={getInputValue(item.id, 'productionRate', item.productionRate || '')}
                                      onChange={(e) => {
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

                                        setInputValue(item.id, 'productionRate', e.target.value);
                                        
                                        const newPX = parseFloat(e.target.value || '0');
                                        const isParent = isParentItem(item);
                                        
                                        if (isParent && hasChildren(item)) {
                                          // Parent PX change: update all children PX, then recalculate hours
                                          const children = getChildren(item);
                                          let totalChildHours = 0;
                                          
                                          children.forEach(child => {
                                            setInputValue(child.id, 'productionRate', newPX.toFixed(2));
                                            const childConvertedQty = parseFloat(getInputValue(child.id, 'convertedQty', child.convertedQty) || '0');
                                            const childNewHours = childConvertedQty * newPX;
                                            setInputValue(child.id, 'hours', childNewHours.toFixed(2));
                                            totalChildHours += childNewHours;
                                          });
                                          
                                          // Parent hours = sum of children hours (use calculated total)
                                          setInputValue(item.id, 'hours', totalChildHours.toFixed(2));
                                        } else {
                                          // Single item: Hours = Conv Qty × PX
                                          const convertedQty = parseFloat(getInputValue(item.id, 'convertedQty', item.convertedQty) || '0');
                                          const newHours = convertedQty * newPX;
                                          setInputValue(item.id, 'hours', newHours.toFixed(2));
                                        }
                                      }}

                                      className={`w-20 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                        isChildItem(item) ? 'bg-gray-100 cursor-not-allowed' : ''
                                      }`}
                                      step="0.01"
                                      disabled={isChildItem(item)}
                                    />
                                  ) : (
                                    <span className="text-right w-20 inline-block">
                                      {formatNumber(getInputValue(item.id, 'productionRate', item.productionRate || '0'))}
                                    </span>
                                  )}
                                </td>
                                <td className="text-right px-4 py-3">
                                  {isEditMode ? (
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
                                    }}
                                    
                                    onBlur={(e) => {
                                      // Only run calculations when user finishes editing (on blur)
                                      const isParent = isParentItem(item);
                                      const isChild = isChildItem(item);
                                      
                                      if (isChild) return;

                                      const newHours = parseFloat(e.target.value || '0');
                                      
                                      if (isParent && hasChildren(item)) {
                                        // Parent with children - manual hours change adjusts parent PX, then children PX
                                        const parentQty = parseFloat(getInputValue(item.id, 'convertedQty', getParentQuantitySum(item).toString()));
                                        if (newHours > 0 && parentQty > 0) {
                                          const newPX = newHours / parentQty;
                                          setInputValue(item.id, 'productionRate', newPX.toFixed(2));
                                          
                                          // Update all children with new PX rate and recalculate total hours
                                          const children = getChildren(item);
                                          let totalChildHours = 0;
                                          
                                          children.forEach(child => {
                                            setInputValue(child.id, 'productionRate', newPX.toFixed(2));
                                            const childConvertedQty = parseFloat(getInputValue(child.id, 'convertedQty', child.convertedQty) || '0');
                                            const childNewHours = childConvertedQty * newPX;
                                            setInputValue(child.id, 'hours', childNewHours.toFixed(2));
                                            totalChildHours += childNewHours;
                                          });
                                          
                                          // Update parent hours to match sum of children
                                          setInputValue(item.id, 'hours', totalChildHours.toFixed(2));
                                        }
                                      } else {
                                        // Single item - normal hours change calculates PX = hours / convertedQty
                                        const convertedQty = parseFloat(getInputValue(item.id, 'convertedQty', item.convertedQty) || '0');
                                        
                                        if (newHours > 0 && convertedQty > 0) {
                                          // When hours change, calculate PX = hours / convertedQty
                                          const newPX = newHours / convertedQty;
                                          setInputValue(item.id, 'productionRate', newPX.toFixed(2));
                                        }
                                      }
                                    }}
                                    
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        (e.target as HTMLInputElement).blur();
                                      }
                                    }}


                                      className={`w-20 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                        isChildItem(item) ? 'bg-gray-100 cursor-not-allowed' : ''
                                      } ${
                                        isParentItem(item) && hasChildren(item) ? 'bg-blue-50 border-blue-200' : ''
                                      }`}
                                      step="0.01"
                                      disabled={isChildItem(item)}
                                    />
                                  ) : (
                                    <span className="text-right w-20 inline-block">
                                      {isParentItem(item) && hasChildren(item) ? 
                                        `${parseFloat(getInputValue(item.id, 'hours', getParentHoursSum(item).toString())).toFixed(2)}` : 
                                        formatNumber(getInputValue(item.id, 'hours', item.hours || '0'))
                                      }
                                    </span>
                                  )}
                                </td>
                                <td className="text-right px-4 py-3">
                                  {formatCurrency(item.laborCost || 0)}
                                </td>
                                <td className="text-right px-4 py-3">
                                  {formatCurrency(item.equipmentCost || 0)}
                                </td>
                                <td className="text-right px-4 py-3">
                                  {formatCurrency(item.truckingCost || 0)}
                                </td>
                                <td className="text-right px-4 py-3">
                                  {formatCurrency(item.dumpFeesCost || 0)}
                                </td>
                                <td className="text-right px-4 py-3">
                                  {formatCurrency(item.materialCost || 0)}
                                </td>
                                <td className="text-right px-4 py-3">
                                  {formatCurrency(item.subcontractorCost || 0)}
                                </td>
                                <td className="text-right font-medium">
                                  {formatCurrency(item.budgetTotal || 0)}
                                </td>
                                <td className="text-right px-4 py-3">
                                  {formatCurrency(item.billing || 0)}
                                </td>
                                {isEditMode && (
                                  <td className={`sticky right-0 z-10 border-l border-gray-200 px-4 py-3 ${isChild ? 'bg-gray-100' : 'bg-gray-100'}`}>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="text-red-500 hover:text-red-700"
                                      onClick={() => handleDeleteBudgetItem(item.id)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                        </table>
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
