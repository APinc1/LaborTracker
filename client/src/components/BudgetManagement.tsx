import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Upload, Edit, Trash2, DollarSign, Calculator } from "lucide-react";

export default function BudgetManagement() {
  const [selectedProject, setSelectedProject] = useState<string>("");

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

  if (projectsLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Budget Management</h2>
            <p className="text-gray-600 mt-1">Track project budgets and line items</p>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="outline" className="flex items-center space-x-2">
              <Upload className="w-4 h-4" />
              <span>Import Excel</span>
            </Button>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Add Line Item
            </Button>
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
                        <p className="text-sm text-gray-600">Total Budget</p>
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
                        <p className="text-sm text-gray-600">Line Items</p>
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
                        <p className="text-sm text-gray-600">Labor Budget</p>
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
                        <p className="text-sm text-gray-600">Material Budget</p>
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
                      <p className="text-gray-500">No budget items found for this project</p>
                      <Button className="mt-4">
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
