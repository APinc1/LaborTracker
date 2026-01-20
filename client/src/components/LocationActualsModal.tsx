import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Save } from "lucide-react";

interface LocationActualsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: number | null;
}

interface BudgetLineItem {
  id: number;
  lineItemNumber: string;
  lineItemName: string;
  unconvertedUnitOfMeasure: string;
  unconvertedQty: string;
  convertedQty: string;
  actualQty: string;
  actualConvQty: string;
  convertedUnitOfMeasure: string | null;
  conversionFactor: string;
  costCode: string;
}

interface ActualsEntry {
  id: number;
  actualQty: string;
  actualConvQty: string;
}

export default function LocationActualsModal({ open, onOpenChange, locationId }: LocationActualsModalProps) {
  const { toast } = useToast();
  const [actualsData, setActualsData] = useState<Record<number, ActualsEntry>>({});

  const { data: budgetItems = [], isLoading } = useQuery<BudgetLineItem[]>({
    queryKey: ["/api/locations", locationId, "budget"],
    enabled: open && locationId !== null,
  });

  const isChildItem = useCallback((item: BudgetLineItem) => {
    return item.lineItemNumber && item.lineItemNumber.includes('.');
  }, []);

  const isParentItem = useCallback((item: BudgetLineItem) => {
    return item.lineItemNumber && !item.lineItemNumber.includes('.');
  }, []);

  const getChildren = useCallback((parentItem: BudgetLineItem) => {
    return budgetItems.filter(child => 
      isChildItem(child) && child.lineItemNumber.split('.')[0] === parentItem.lineItemNumber
    );
  }, [budgetItems, isChildItem]);

  const hasChildren = useCallback((parentItem: BudgetLineItem) => {
    return getChildren(parentItem).length > 0;
  }, [getChildren]);

  const getParentItem = useCallback((childItem: BudgetLineItem) => {
    if (!isChildItem(childItem)) return null;
    const parentLineNumber = childItem.lineItemNumber.split('.')[0];
    return budgetItems.find(item => item.lineItemNumber === parentLineNumber) || null;
  }, [budgetItems, isChildItem]);

  const recalculateParentTotals = useCallback((currentData: Record<number, ActualsEntry>) => {
    const newData = { ...currentData };
    
    budgetItems.forEach(item => {
      if (isParentItem(item) && hasChildren(item)) {
        const children = getChildren(item);
        let totalActualQty = 0;
        let totalActualConvQty = 0;
        
        children.forEach(child => {
          const childEntry = newData[child.id];
          if (childEntry) {
            totalActualQty += parseFloat(childEntry.actualQty) || 0;
            totalActualConvQty += parseFloat(childEntry.actualConvQty) || 0;
          }
        });
        
        newData[item.id] = {
          id: item.id,
          actualQty: totalActualQty.toFixed(2),
          actualConvQty: totalActualConvQty.toFixed(2),
        };
      }
    });
    
    return newData;
  }, [budgetItems, isParentItem, hasChildren, getChildren]);

  useEffect(() => {
    if (budgetItems.length > 0) {
      const initialData: Record<number, ActualsEntry> = {};
      budgetItems.forEach((item: BudgetLineItem) => {
        initialData[item.id] = {
          id: item.id,
          actualQty: item.actualQty || "0",
          actualConvQty: item.actualConvQty || "0",
        };
      });
      const dataWithParentTotals = recalculateParentTotals(initialData);
      setActualsData(dataWithParentTotals);
    }
  }, [budgetItems, recalculateParentTotals]);

  const saveActualsMutation = useMutation({
    mutationFn: async (data: { locationId: number; items: ActualsEntry[] }) => {
      return await apiRequest(`/api/locations/${data.locationId}/budget/actuals`, {
        method: "POST",
        body: JSON.stringify({ items: data.items }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations", locationId, "budget"] });
      toast({
        title: "Actuals Saved",
        description: "The actual quantities have been saved successfully.",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to save actuals",
        variant: "destructive",
      });
    },
  });

  const handleActualQtyChange = (item: BudgetLineItem, value: string) => {
    const numValue = parseFloat(value) || 0;
    const conversionFactor = parseFloat(item.conversionFactor) || 1;
    const calculatedConvQty = (numValue * conversionFactor).toFixed(2);
    
    setActualsData(prev => {
      const newData = {
        ...prev,
        [item.id]: {
          id: item.id,
          actualQty: value,
          actualConvQty: calculatedConvQty,
        }
      };
      return recalculateParentTotals(newData);
    });
  };

  const handleActualConvQtyChange = (item: BudgetLineItem, value: string) => {
    const numValue = parseFloat(value) || 0;
    const conversionFactor = parseFloat(item.conversionFactor) || 1;
    const calculatedQty = conversionFactor !== 0 ? (numValue / conversionFactor).toFixed(2) : "0";
    
    setActualsData(prev => {
      const newData = {
        ...prev,
        [item.id]: {
          id: item.id,
          actualQty: calculatedQty,
          actualConvQty: value,
        }
      };
      return recalculateParentTotals(newData);
    });
  };

  const handleSave = () => {
    if (!locationId) return;
    
    const sanitizedItems = Object.values(actualsData).map(item => ({
      id: item.id,
      actualQty: item.actualQty === "" || item.actualQty === null ? "0" : item.actualQty,
      actualConvQty: item.actualConvQty === "" || item.actualConvQty === null ? "0" : item.actualConvQty,
    }));
    
    saveActualsMutation.mutate({ locationId, items: sanitizedItems });
  };

  const hasUnenteredActuals = () => {
    // Show warning if ANY editable item has actualsEntered = false (user hasn't entered a value yet)
    const editableItems = budgetItems.filter(item => !(isParentItem(item) && hasChildren(item)));
    if (editableItems.length === 0) return false;
    
    return editableItems.some(item => !item.actualsEntered);
  };

  const isEditable = (item: BudgetLineItem) => {
    return !(isParentItem(item) && hasChildren(item));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Enter Actual Quantities</DialogTitle>
          <DialogDescription>
            Enter the actual quantities for child items. Parent totals are calculated automatically from their children.
          </DialogDescription>
        </DialogHeader>
        
        {hasUnenteredActuals() && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 flex items-center gap-2 text-sm text-yellow-800 flex-shrink-0">
            <AlertTriangle className="h-4 w-4" />
            <span>Some line items still have zero actual quantities. Please review before saving.</span>
          </div>
        )}

        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-gray-100 z-10">
              <tr className="border-b">
                <th className="text-left px-3 py-2 text-sm font-medium text-gray-700 w-20">Line Item</th>
                <th className="text-left px-3 py-2 text-sm font-medium text-gray-700 w-48">Description</th>
                <th className="text-left px-3 py-2 text-sm font-medium text-gray-700 w-24">Cost Code</th>
                <th className="text-left px-3 py-2 text-sm font-medium text-gray-700 w-16">Unit</th>
                <th className="text-right px-3 py-2 text-sm font-medium text-gray-700 w-24">Budgeted Qty</th>
                <th className="text-center px-3 py-2 text-sm font-medium text-gray-700 w-28">Actual Qty</th>
                <th className="text-left px-3 py-2 text-sm font-medium text-gray-700 w-20">Conv UM</th>
                <th className="text-right px-3 py-2 text-sm font-medium text-gray-700 w-24">Budgeted Conv Qty</th>
                <th className="text-center px-3 py-2 text-sm font-medium text-gray-700 w-28">Actual Conv Qty</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="text-center py-8">
                    Loading budget items...
                  </td>
                </tr>
              ) : budgetItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-gray-500">
                    No budget items found for this location.
                  </td>
                </tr>
              ) : (
                budgetItems.map((item: BudgetLineItem) => {
                  const entry = actualsData[item.id] || { actualQty: "0", actualConvQty: "0" };
                  const isChild = isChildItem(item);
                  const isParent = isParentItem(item);
                  const parentHasChildren = isParent && hasChildren(item);
                  const canEdit = isEditable(item);
                  const needsActuals = canEdit && !item.actualsEntered;
                  
                  return (
                    <tr 
                      key={item.id} 
                      className={`border-b ${needsActuals ? 'bg-yellow-50' : isChild ? 'bg-slate-100' : parentHasChildren ? 'bg-blue-50' : 'bg-white'}`}
                    >
                      <td className={`px-3 py-2 font-medium ${isChild ? 'pl-8 text-gray-600' : ''}`}>
                        <div className="flex items-center gap-1">
                          {needsActuals && <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />}
                          {item.lineItemNumber}
                        </div>
                      </td>
                      <td className={`px-3 py-2 ${isChild ? 'pl-6 text-gray-600' : ''} ${parentHasChildren ? 'font-semibold' : ''}`}>
                        {item.lineItemName}
                      </td>
                      <td className="px-3 py-2">{item.costCode}</td>
                      <td className="px-3 py-2">{item.unconvertedUnitOfMeasure}</td>
                      <td className="px-3 py-2 text-right">{parseFloat(item.unconvertedQty).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        {canEdit ? (
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={entry.actualQty}
                            onChange={(e) => handleActualQtyChange(item, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className="w-24"
                          />
                        ) : (
                          <span className="font-semibold text-blue-700">
                            {parseFloat(entry.actualQty).toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{item.convertedUnitOfMeasure || "-"}</td>
                      <td className="px-3 py-2 text-right">{parseFloat(item.convertedQty || "0").toLocaleString()}</td>
                      <td className="px-3 py-2">
                        {canEdit ? (
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={entry.actualConvQty}
                            onChange={(e) => handleActualConvQtyChange(item, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className="w-24"
                          />
                        ) : (
                          <span className="font-semibold text-blue-700">
                            {parseFloat(entry.actualConvQty).toLocaleString()}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center pt-4 border-t flex-shrink-0">
          <div className="text-sm text-gray-500">
            {budgetItems.length} line item{budgetItems.length !== 1 ? "s" : ""}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Skip for Now
            </Button>
            <Button onClick={handleSave} disabled={saveActualsMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {saveActualsMutation.isPending ? "Saving..." : "Save Actuals"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
