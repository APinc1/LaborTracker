import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calculator, ChevronDown, ChevronRight, Upload, Download, Home, FolderOpen } from "lucide-react";
import { downloadBudgetTemplate, FORMAT_REQUIREMENTS } from "@/lib/budgetTemplateUtils";

export default function ProjectBudgets() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [costCodeFilter, setCostCodeFilter] = useState<string>("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const { data: projects = [], isLoading: projectsLoading } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const { data: budgetItems = [], isLoading: budgetLoading } = useQuery<any[]>({
    queryKey: ["/api/projects", selectedProjectId, "budget"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${selectedProjectId}/budget`);
      if (!response.ok) throw new Error('Failed to fetch budget');
      return response.json();
    },
    enabled: !!selectedProjectId,
  });

  const activeProjects = (projects as any[])
    .filter((project: any) => !project.isInactive)
    .sort((a: any, b: any) => a.name.localeCompare(b.name));

  const selectedProject = activeProjects.find((p: any) => p.id.toString() === selectedProjectId);

  // Helper functions for budget display
  const hasChildren = (lineItemNumber: string, items: any[]) => {
    return items.some((item: any) => {
      const itemNum = item.lineItemNumber;
      return itemNum !== lineItemNumber && itemNum.startsWith(lineItemNumber + '.');
    });
  };

  const isItemVisible = (item: any, items: any[]) => {
    const parts = item.lineItemNumber.split('.');
    for (let i = 1; i < parts.length; i++) {
      const parentNum = parts.slice(0, i).join('.');
      if (collapsedGroups.has(parentNum)) {
        return false;
      }
    }
    return true;
  };

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

  const getUniqueCostCodes = () => {
    const codes = new Set<string>();
    (budgetItems as any[]).forEach((item: any) => {
      if (item.costCode) codes.add(item.costCode);
    });
    return Array.from(codes).sort();
  };

  const getFilteredBudgetItems = () => {
    let items = budgetItems as any[];
    if (costCodeFilter !== "all") {
      items = items.filter((item: any) => item.costCode === costCodeFilter);
    }
    return items.sort((a: any, b: any) => {
      const aParts = a.lineItemNumber.split('.').map(Number);
      const bParts = b.lineItemNumber.split('.').map(Number);
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aVal = aParts[i] || 0;
        const bVal = bParts[i] || 0;
        if (aVal !== bVal) return aVal - bVal;
      }
      return 0;
    });
  };

  // Calculate cost code summaries
  const getCostCodeSummaries = () => {
    const summaries: { [key: string]: { convQty: number; medianPx: number; hours: number; budget: number; pxValues: number[] } } = {};
    
    (budgetItems as any[]).forEach((item: any) => {
      const code = item.costCode || 'No Code';
      if (!summaries[code]) {
        summaries[code] = { convQty: 0, medianPx: 0, hours: 0, budget: 0, pxValues: [] };
      }
      summaries[code].convQty += parseFloat(item.convertedQty || 0);
      summaries[code].hours += parseFloat(item.hours || 0);
      summaries[code].budget += parseFloat(item.budgetTotal || 0);
      if (item.productionRate) {
        summaries[code].pxValues.push(parseFloat(item.productionRate));
      }
    });

    // Calculate median PX for each cost code
    Object.keys(summaries).forEach(code => {
      const pxValues = summaries[code].pxValues.sort((a, b) => a - b);
      if (pxValues.length > 0) {
        const mid = Math.floor(pxValues.length / 2);
        summaries[code].medianPx = pxValues.length % 2 !== 0 
          ? pxValues[mid] 
          : (pxValues[mid - 1] + pxValues[mid]) / 2;
      }
    });

    return Object.entries(summaries)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, data]) => ({ code, ...data }));
  };

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-sm text-gray-600 mb-4">
        <Link href="/">
          <span className="flex items-center hover:text-gray-900 cursor-pointer">
            <Home className="w-4 h-4" />
          </span>
        </Link>
        <span>/</span>
        {selectedProject ? (
          <>
            <Link href={`/projects/${selectedProjectId}`}>
              <span className="flex items-center gap-1 hover:text-gray-900 cursor-pointer text-[#1e40af]">
                <FolderOpen className="w-4 h-4" />
                {selectedProject.name}
              </span>
            </Link>
            <span>/</span>
            <span className="flex items-center gap-1 font-medium text-gray-900">
              <Calculator className="w-4 h-4" />
              Budget
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1 font-medium text-gray-900">
            <Calculator className="w-4 h-4" />
            Budget
          </span>
        )}
      </nav>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Project Budget Management</h1>
      {/* Project Selector */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Select Project
          </CardTitle>
        </CardHeader>
        <CardContent>
          {projectsLoading ? (
            <Skeleton className="h-10 w-full max-w-md" />
          ) : (
            <Select
              value={selectedProjectId}
              onValueChange={(value) => {
                setSelectedProjectId(value);
                setCostCodeFilter("all");
                setCollapsedGroups(new Set());
              }}
            >
              <SelectTrigger className="w-full max-w-md" data-testid="select-project">
                <SelectValue placeholder="Choose a project..." />
              </SelectTrigger>
              <SelectContent>
                {activeProjects.map((project: any) => (
                  <SelectItem key={project.id} value={project.id.toString()}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>
      {/* Budget Display */}
      {selectedProject && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5" />
                Master Budget - {selectedProject.name}
              </CardTitle>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex items-center gap-2"
                  onClick={() => downloadBudgetTemplate()}
                  data-testid="button-download-budget-template"
                >
                  <Download className="w-4 h-4" />
                  Download Template
                </Button>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Upload Master Budget
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {budgetLoading ? (
              <Skeleton className="h-64" />
            ) : (budgetItems as any[]).length === 0 ? (
              <div className="text-center py-8">
                <Calculator className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No budget items found for this project</p>
                <p className="text-sm text-gray-400 mt-2">Upload an excel file to import budget data</p>
                
                <div className="mt-6 max-w-md mx-auto text-left bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3 text-sm">Format Requirements</h4>
                  <div className="space-y-2">
                    {FORMAT_REQUIREMENTS.map((req, idx) => (
                      <div key={idx}>
                        <p className="text-xs font-medium text-gray-700">{req.title}:</p>
                        <ul className="text-xs text-gray-600 ml-3 list-disc">
                          {req.items.map((item, itemIdx) => (
                            <li key={itemIdx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {/* Cost Code Summary Cards */}
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 mb-3">Cost Code Summary</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {getCostCodeSummaries().map((summary) => (
                      <div key={summary.code} className="bg-gray-50 rounded-lg p-3 border">
                        <div className="font-medium text-gray-900 mb-2">{summary.code}</div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-xs text-gray-500">Conv. Qty</p>
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

                {/* Filter */}
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900 text-lg">Budget Line Items</h4>
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
                </div>

                {/* Budget Table */}
                <div className="border rounded-md overflow-hidden">
                  <div className="overflow-auto max-h-[500px]">
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
      )}
    </div>
  );
}
