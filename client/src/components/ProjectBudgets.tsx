import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calculator, ChevronDown, ChevronRight, Upload, Download, Home, FolderOpen, DollarSign, FileSpreadsheet } from "lucide-react";
import { downloadBudgetTemplate, FORMAT_REQUIREMENTS, validateBudgetData } from "@/lib/budgetTemplateUtils";
import { parseSW62ExcelRowForProject } from "@/lib/customExcelParser";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';

const EXAMPLE_BUDGET_DATA = [
  {lineItemNumber:"1",description:"Mobilization per General Requirements",unit:"LS",qty:"1",unitCost:"$15,000",unitTotal:"$15,000",costCode:"Mobilization",convUnit:"LS",convQty:"1",px:"1",hours:"",laborCost:"",equipment:"",trucking:"",dumpFees:"",material:"",sub:"",budget:"",billing:"$15,000"},
  {lineItemNumber:"2",description:"Allowance for Differing Site Conditions",unit:"LS",qty:"1",unitCost:"$10,000",unitTotal:"$10,000",costCode:"Allowance",convUnit:"LS",convQty:"1",px:"-",hours:"",laborCost:"",equipment:"",trucking:"",dumpFees:"",material:"",sub:"",budget:"",billing:"$10,000"},
  {lineItemNumber:"5",description:"Traffic Control",unit:"LS",qty:"1",unitCost:"$70,000",unitTotal:"$70,000",costCode:"Traffic Control",convUnit:"LS",convQty:"4",px:"-",hours:"192",laborCost:"$15,360",equipment:"",trucking:"",dumpFees:"",material:"$15,000",sub:"",budget:"$30,360",billing:"$70,000"},
  {lineItemNumber:"6",description:"Clearing and Grubbing",unit:"LS",qty:"1",unitCost:"$15,000",unitTotal:"$15,000",costCode:"Demo/Ex",convUnit:"LS",convQty:"1",px:"1",hours:"1",laborCost:"$800",equipment:"",trucking:"",dumpFees:"",material:"",sub:"",budget:"$800",billing:"$15,000"},
  {lineItemNumber:"15",description:"Unclassified Excavation",unit:"CY",qty:"3,500",unitCost:"$20",unitTotal:"$70,000",costCode:"Demo/Ex",convUnit:"CY",convQty:"3,500",px:"10",hours:"350",laborCost:"$28,000",equipment:"",trucking:"$12,250",dumpFees:"$12,250",material:"",sub:"",budget:"$52,500",billing:"$70,000"},
  {lineItemNumber:"15.1",description:"Concrete Curb Type A",unit:"LF",qty:"79",unitCost:"-",unitTotal:"-",costCode:"Demo/Ex",convUnit:"CY",convQty:"1.46",px:"6",hours:"",laborCost:"",equipment:"",trucking:"",dumpFees:"",material:"",sub:"",budget:"",billing:""},
  {lineItemNumber:"15.2",description:"Concrete Integral Curb and Gutter",unit:"LF",qty:"317",unitCost:"-",unitTotal:"-",costCode:"Demo/Ex",convUnit:"CY",convQty:"45.29",px:"6",hours:"",laborCost:"",equipment:"",trucking:"",dumpFees:"",material:"",sub:"",budget:"",billing:""},
  {lineItemNumber:"19",description:"Concrete Curb Type A",unit:"LF",qty:"79",unitCost:"$80",unitTotal:"$6,320",costCode:"Concrete",convUnit:"CY",convQty:"1.46",px:"6",hours:"9",laborCost:"$711.43",equipment:"",trucking:"",dumpFees:"",material:"$329.17",sub:"",budget:"$1,040.60",billing:"$6,320"},
  {lineItemNumber:"25",description:"Asphalt Concrete Pavement",unit:"TON",qty:"158",unitCost:"$400",unitTotal:"$63,200",costCode:"Asphalt",convUnit:"TON",convQty:"158",px:"1",hours:"158",laborCost:"$14,220",equipment:"",trucking:"",dumpFees:"",material:"$15,010",sub:"",budget:"$29,230",billing:"$63,200"},
  {lineItemNumber:"25.1",description:"Asphalt Concrete Pavement",unit:"SF",qty:"4,161",unitCost:"-",unitTotal:"-",costCode:"Asphalt",convUnit:"TON",convQty:"154.09",px:"1",hours:"",laborCost:"",equipment:"",trucking:"",dumpFees:"",material:"",sub:"",budget:"",billing:""},
  {lineItemNumber:"26",description:"Crushed Miscellaneous Base",unit:"CY",qty:"101.34",unitCost:"$250",unitTotal:"$36,250",costCode:"Base/Grading",convUnit:"CY",convQty:"101.34",px:"1",hours:"145",laborCost:"$13,050",equipment:"",trucking:"",dumpFees:"",material:"$10,134",sub:"",budget:"$23,184",billing:"$36,250"},
  {lineItemNumber:"26.1",description:"Concrete Curb Type A",unit:"LF",qty:"79",unitCost:"-",unitTotal:"-",costCode:"Base/Grading",convUnit:"CY",convQty:"1.46",px:"1",hours:"",laborCost:"",equipment:"",trucking:"",dumpFees:"",material:"",sub:"",budget:"",billing:""},
  {lineItemNumber:"28",description:"Pedestrian Barricade",unit:"EA",qty:"3",unitCost:"$2,500",unitTotal:"$7,500",costCode:"Sub",convUnit:"EA",convQty:"3",px:"-",hours:"",laborCost:"",equipment:"",trucking:"",dumpFees:"",material:"",sub:"$6,375",budget:"$6,375",billing:"$7,500"},
  {lineItemNumber:"34",description:"Signage and Striping",unit:"LS",qty:"1",unitCost:"$18,000",unitTotal:"$18,000",costCode:"Sub",convUnit:"LS",convQty:"1",px:"-",hours:"",laborCost:"",equipment:"",trucking:"",dumpFees:"",material:"",sub:"$15,300",budget:"$15,300",billing:"$18,000"},
];

export default function ProjectBudgets() {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [costCodeFilter, setCostCodeFilter] = useState<string>("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [showBudgetUploadDialog, setShowBudgetUploadDialog] = useState(false);
  const [showExampleBudgetDialog, setShowExampleBudgetDialog] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedProjectId) return;

    setIsUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, defval: '' }) as any[][];

      const validation = validateBudgetData(jsonData);

      if (!validation.isValid) {
        toast({
          title: "Validation Error",
          description: `Found ${validation.errors.length} errors in the file. Please fix and re-upload.`,
          variant: "destructive",
        });
        setIsUploading(false);
        return;
      }

      const dataRows = jsonData.slice(1).filter((row: any[]) => row.some(cell => cell !== ''));
      const budgetItems: any[] = [];
      
      for (const row of dataRows) {
        const budgetItem = parseSW62ExcelRowForProject(row);
        if (budgetItem) {
          budgetItems.push(budgetItem);
        }
      }

      const response = await fetch(`/api/projects/${selectedProjectId}/budget/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: budgetItems }),
      });

      if (!response.ok) {
        throw new Error('Failed to upload budget');
      }

      toast({
        title: "Success",
        description: `Successfully uploaded ${budgetItems.length} budget items.`,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProjectId, "budget"] });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload budget file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
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
                <DollarSign className="w-5 h-5" />
                Master Budget
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
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex items-center gap-2"
                  onClick={() => setShowBudgetUploadDialog(true)}
                  disabled={isUploading}
                  data-testid="button-upload-master-budget"
                >
                  <Upload className="w-4 h-4" />
                  {isUploading ? "Uploading..." : "Upload Budget"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {budgetLoading ? (
              <Skeleton className="h-64" />
            ) : (budgetItems as any[]).length === 0 ? (
              <div className="text-center py-8">
                <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No master budget uploaded</p>
                <p className="text-sm text-gray-400 mt-2">Upload an Excel file to set up the project's master budget</p>
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

      {/* Upload Master Budget Dialog */}
      <Dialog open={showBudgetUploadDialog} onOpenChange={setShowBudgetUploadDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Master Budget</DialogTitle>
            <DialogDescription>
              Upload an Excel file containing the project's master budget. This will be
              used as the source for location budgets. The file should follow the SW62
              Excel format (21 columns).
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
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  data-testid="button-select-excel-file"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isUploading ? "Uploading..." : "Select Excel File"}
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".xlsx,.xls"
                  className="hidden"
                  data-testid="input-budget-file"
                />
              </div>
            </div>
            
            <div className="flex justify-center">
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
            
            {(budgetItems as any[]).length > 0 && (
              <p className="text-sm text-amber-600">
                Note: Uploading a new budget will replace the existing {(budgetItems as any[]).length} items.
              </p>
            )}
          </div>
          <div className="flex justify-end">
            <Button 
              variant="outline" 
              onClick={() => setShowBudgetUploadDialog(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Example Budget Dialog */}
      <Dialog open={showExampleBudgetDialog} onOpenChange={setShowExampleBudgetDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Example Master Budget</DialogTitle>
            <DialogDescription>
              This is an example of a properly formatted master budget file with 62 line items.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full min-w-[2000px] text-xs border-collapse">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="px-2 py-1 border text-left font-medium">Line Item</th>
                  <th className="px-2 py-1 border text-left font-medium min-w-40">Description</th>
                  <th className="px-2 py-1 border text-left font-medium">Unit</th>
                  <th className="px-2 py-1 border text-right font-medium">Qty</th>
                  <th className="px-2 py-1 border text-right font-medium">Unit Cost</th>
                  <th className="px-2 py-1 border text-right font-medium">Unit Total</th>
                  <th className="px-2 py-1 border text-left font-medium">Cost Code</th>
                  <th className="px-2 py-1 border text-left font-medium">Conv. Unit</th>
                  <th className="px-2 py-1 border text-right font-medium">Conv. Qty</th>
                  <th className="px-2 py-1 border text-right font-medium">PX</th>
                  <th className="px-2 py-1 border text-right font-medium">Hours</th>
                  <th className="px-2 py-1 border text-right font-medium">Labor Cost</th>
                  <th className="px-2 py-1 border text-right font-medium">Equipment</th>
                  <th className="px-2 py-1 border text-right font-medium">Trucking</th>
                  <th className="px-2 py-1 border text-right font-medium">Dump Fees</th>
                  <th className="px-2 py-1 border text-right font-medium">Material</th>
                  <th className="px-2 py-1 border text-right font-medium">Sub</th>
                  <th className="px-2 py-1 border text-right font-medium">Budget</th>
                  <th className="px-2 py-1 border text-right font-medium">Billing</th>
                </tr>
              </thead>
              <tbody>
                {EXAMPLE_BUDGET_DATA.map((row, idx) => {
                  const isParent = !row.lineItemNumber.includes('.');
                  return (
                    <tr key={idx} className={isParent ? 'bg-amber-50 font-medium' : 'bg-white'}>
                      <td className="px-2 py-1 border">{row.lineItemNumber}</td>
                      <td className="px-2 py-1 border">{row.description}</td>
                      <td className="px-2 py-1 border">{row.unit}</td>
                      <td className="px-2 py-1 border text-right">{row.qty}</td>
                      <td className="px-2 py-1 border text-right">{row.unitCost}</td>
                      <td className="px-2 py-1 border text-right">{row.unitTotal}</td>
                      <td className="px-2 py-1 border">{row.costCode}</td>
                      <td className="px-2 py-1 border">{row.convUnit}</td>
                      <td className="px-2 py-1 border text-right">{row.convQty}</td>
                      <td className="px-2 py-1 border text-right">{row.px}</td>
                      <td className="px-2 py-1 border text-right">{row.hours}</td>
                      <td className="px-2 py-1 border text-right">{row.laborCost}</td>
                      <td className="px-2 py-1 border text-right">{row.equipment}</td>
                      <td className="px-2 py-1 border text-right">{row.trucking}</td>
                      <td className="px-2 py-1 border text-right">{row.dumpFees}</td>
                      <td className="px-2 py-1 border text-right">{row.material}</td>
                      <td className="px-2 py-1 border text-right">{row.sub}</td>
                      <td className="px-2 py-1 border text-right">{row.budget}</td>
                      <td className="px-2 py-1 border text-right">{row.billing}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end pt-4">
            <Button variant="outline" onClick={() => setShowExampleBudgetDialog(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
