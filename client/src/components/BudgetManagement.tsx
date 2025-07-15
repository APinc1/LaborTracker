import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Upload, Edit, Trash2, DollarSign, Calculator } from "lucide-react";
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
  const [showAddDialog, setShowAddDialog] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 30000,
  });

  const { data: budgetItems = [], isLoading: budgetLoading } = useQuery({
    queryKey: ["/api/projects", selectedProject, "budget"],
    enabled: !!selectedProject,
    staleTime: 30000,
  });

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Number(amount) || 0);
  };

  const getTotalBudget = () => {
    return budgetItems.reduce((sum: number, item: any) => sum + (parseFloat(item.budgetTotal) || 0), 0);
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

  const createBudgetItemMutation = useMutation({
    mutationFn: async (data: z.infer<typeof budgetLineItemSchema>) => {
      return await apiRequest(`/api/projects/${selectedProject}/budget`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProject, "budget"] });
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

  const handleExcelImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      if (!selectedProject) {
        toast({
          title: "Error",
          description: "Please select a project first",
          variant: "destructive",
        });
        return;
      }

      // For now, show a message that Excel import is coming soon
      toast({
        title: "Coming Soon",
        description: "Excel import functionality will be available in the next update",
      });
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
              disabled={!selectedProject}
            >
              <Upload className="w-4 h-4" />
              <span>Import Excel</span>
            </Button>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button 
                  className="bg-primary hover:bg-primary/90"
                  disabled={!selectedProject}
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
          {/* Project Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Select Project</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="w-full md:w-1/3">
                  <SelectValue placeholder="Choose a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project: any) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name} ({project.projectId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {selectedProject && (
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
                        <p className="text-2xl font-bold text-blue-600">{budgetItems.length}</p>
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
                          {formatCurrency(budgetItems.reduce((sum: number, item: any) => sum + (parseFloat(item.laborCost) || 0), 0))}
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
                          {formatCurrency(budgetItems.reduce((sum: number, item: any) => sum + (parseFloat(item.materialCost) || 0), 0))}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Budget Items Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Budget Line Items</CardTitle>
                </CardHeader>
                <CardContent>
                  {budgetLoading ? (
                    <Skeleton className="h-64" />
                  ) : budgetItems.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted">No budget items found for this project</p>
                      <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add First Line Item
                      </Button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Line Item</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Cost Code</TableHead>
                            <TableHead>Unit</TableHead>
                            <TableHead>Quantity</TableHead>
                            <TableHead>Unit Cost</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {budgetItems.map((item: any) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.lineItemNumber}</TableCell>
                              <TableCell>{item.lineItemName}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{item.costCode}</Badge>
                              </TableCell>
                              <TableCell>{item.unconvertedUnitOfMeasure}</TableCell>
                              <TableCell>{item.unconvertedQty}</TableCell>
                              <TableCell>{formatCurrency(item.unitCost)}</TableCell>
                              <TableCell className="font-medium">
                                {formatCurrency(item.budgetTotal)}
                              </TableCell>
                              <TableCell>
                                <div className="flex space-x-1">
                                  <Button variant="ghost" size="sm">
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
