import { useState, useEffect } from "react";
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
      setActualsData(initialData);
    }
  }, [budgetItems]);

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
    
    setActualsData(prev => ({
      ...prev,
      [item.id]: {
        id: item.id,
        actualQty: value,
        actualConvQty: calculatedConvQty,
      }
    }));
  };

  const handleActualConvQtyChange = (item: BudgetLineItem, value: string) => {
    const numValue = parseFloat(value) || 0;
    const conversionFactor = parseFloat(item.conversionFactor) || 1;
    const calculatedQty = conversionFactor !== 0 ? (numValue / conversionFactor).toFixed(2) : "0";
    
    setActualsData(prev => ({
      ...prev,
      [item.id]: {
        id: item.id,
        actualQty: calculatedQty,
        actualConvQty: value,
      }
    }));
  };

  const handleSave = () => {
    if (!locationId) return;
    
    // Sanitize data - convert empty strings to "0" for decimal columns
    const sanitizedItems = Object.values(actualsData).map(item => ({
      id: item.id,
      actualQty: item.actualQty === "" || item.actualQty === null ? "0" : item.actualQty,
      actualConvQty: item.actualConvQty === "" || item.actualConvQty === null ? "0" : item.actualConvQty,
    }));
    
    saveActualsMutation.mutate({ locationId, items: sanitizedItems });
  };

  const hasUnenteredActuals = () => {
    return Object.values(actualsData).some(
      entry => parseFloat(entry.actualQty) === 0 && parseFloat(entry.actualConvQty) === 0
    );
  };

  const isChildItem = (item: BudgetLineItem) => {
    return item.lineItemNumber && item.lineItemNumber.includes('.');
  };

  const isParentItem = (item: BudgetLineItem) => {
    return item.lineItemNumber && !item.lineItemNumber.includes('.');
  };

  const hasChildren = (parentItem: BudgetLineItem) => {
    return budgetItems.some(child => 
      isChildItem(child) && child.lineItemNumber.split('.')[0] === parentItem.lineItemNumber
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Enter Actual Quantities</DialogTitle>
          <DialogDescription>
            Enter the actual quantities for each budget line item. You can enter either the Actual Qty or Actual Conv Qty - the other will be calculated automatically using the conversion factor.
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
                  const hasNoActuals = parseFloat(entry.actualQty) === 0 && parseFloat(entry.actualConvQty) === 0;
                  const isChild = isChildItem(item);
                  const isParent = isParentItem(item);
                  const parentHasChildren = isParent && hasChildren(item);
                  
                  return (
                    <tr 
                      key={item.id} 
                      className={`border-b ${isChild ? 'bg-gray-50' : 'bg-white'} ${hasNoActuals ? 'bg-yellow-50' : ''}`}
                    >
                      <td className={`px-3 py-2 font-medium ${isChild ? 'pl-8' : ''}`}>
                        {item.lineItemNumber}
                      </td>
                      <td className={`px-3 py-2 ${isChild ? 'pl-6' : ''} ${parentHasChildren ? 'font-semibold' : ''}`}>
                        {item.lineItemName}
                      </td>
                      <td className="px-3 py-2">{item.costCode}</td>
                      <td className="px-3 py-2">{item.unconvertedUnitOfMeasure}</td>
                      <td className="px-3 py-2 text-right">{parseFloat(item.unconvertedQty).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          {hasNoActuals && (
                            <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                          )}
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={entry.actualQty}
                            onChange={(e) => handleActualQtyChange(item, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className="w-24"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">{item.convertedUnitOfMeasure || "-"}</td>
                      <td className="px-3 py-2 text-right">{parseFloat(item.convertedQty || "0").toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={entry.actualConvQty}
                          onChange={(e) => handleActualConvQtyChange(item, e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="w-24"
                        />
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
