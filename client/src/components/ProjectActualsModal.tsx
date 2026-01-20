import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

interface ProjectActualsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
}

interface ActualsSummaryItem {
  lineItemNumber: string;
  lineItemName: string;
  costCode: string;
  unit: string;
  projectQty: number;
  convUnit: string;
  projectConvQty: number;
  locationQtySum: number;
  locationConvQtySum: number;
  actualQtySum: number;
  actualConvQtySum: number;
  locationCount: number;
}

interface ActualsSummaryResponse {
  projectBudgetItems: ActualsSummaryItem[];
  locationCount: number;
}

export default function ProjectActualsModal({ open, onOpenChange, projectId }: ProjectActualsModalProps) {
  const { data, isLoading } = useQuery<ActualsSummaryResponse>({
    queryKey: ['/api/projects', projectId, 'budget', 'actuals-summary'],
    enabled: open && !!projectId,
  });

  const isChildItem = (lineItemNumber: string) => lineItemNumber.includes('.');
  
  const sortedItems = data?.projectBudgetItems?.sort((a, b) => {
    const aParts = a.lineItemNumber.split('.').map(Number);
    const bParts = b.lineItemNumber.split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aVal = aParts[i] || 0;
      const bVal = bParts[i] || 0;
      if (aVal !== bVal) return aVal - bVal;
    }
    return 0;
  }) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Budget vs Location Budgets vs Actuals</DialogTitle>
          <p className="text-sm text-gray-500">
            Comparing project budget quantities with summed location budgets and actual quantities
            {data?.locationCount !== undefined && ` (${data.locationCount} locations)`}
          </p>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-left font-medium text-gray-700 w-16">Line #</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-700 min-w-[150px]">Description</th>
                  <th className="px-2 py-2 text-left font-medium text-gray-700 w-24">Cost Code</th>
                  <th className="px-2 py-2 text-center font-medium text-gray-700 w-16">Unit</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-700 w-20">
                    <span className="text-blue-600">Budget Qty</span>
                  </th>
                  <th className="px-2 py-2 text-right font-medium text-gray-700 w-20">
                    <span className="text-green-600">Loc Qty</span>
                  </th>
                  <th className="px-2 py-2 text-right font-medium text-gray-700 w-20">
                    <span className="text-orange-600">Actual Qty</span>
                  </th>
                  <th className="px-2 py-2 text-center font-medium text-gray-700 w-16">Conv UM</th>
                  <th className="px-2 py-2 text-right font-medium text-gray-700 w-20">
                    <span className="text-blue-600">Budget Conv</span>
                  </th>
                  <th className="px-2 py-2 text-right font-medium text-gray-700 w-20">
                    <span className="text-green-600">Loc Conv</span>
                  </th>
                  <th className="px-2 py-2 text-right font-medium text-gray-700 w-20">
                    <span className="text-orange-600">Actual Conv</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => {
                  const isChild = isChildItem(item.lineItemNumber);
                  return (
                    <tr 
                      key={item.lineItemNumber} 
                      className={`border-b hover:bg-gray-50 ${isChild ? 'bg-slate-50' : ''}`}
                    >
                      <td className={`px-2 py-2 font-medium ${isChild ? 'pl-6 text-gray-600' : ''}`}>
                        {item.lineItemNumber}
                      </td>
                      <td className={`px-2 py-2 ${isChild ? 'text-gray-600' : ''}`} title={item.lineItemName}>
                        <span className="line-clamp-2">{item.lineItemName}</span>
                      </td>
                      <td className="px-2 py-2 text-gray-600">{item.costCode || '-'}</td>
                      <td className="px-2 py-2 text-center text-gray-600">{item.unit || '-'}</td>
                      <td className="px-2 py-2 text-right text-blue-700 font-medium">
                        {item.projectQty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-2 text-right text-green-700">
                        {item.locationQtySum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-2 text-right text-orange-700 font-medium">
                        {item.actualQtySum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-2 text-center text-gray-600">{item.convUnit || '-'}</td>
                      <td className="px-2 py-2 text-right text-blue-700 font-medium">
                        {item.projectConvQty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-2 text-right text-green-700">
                        {item.locationConvQtySum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-2 text-right text-orange-700 font-medium">
                        {item.actualConvQtySum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
