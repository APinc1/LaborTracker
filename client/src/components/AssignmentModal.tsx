import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { X, Users, ChevronDown } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface AssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string | number;
  taskDate: string;
}

interface Employee {
  id: number;
  teamMemberId: string;
  name: string;
  employeeType: string;
  apprenticeLevel?: number;
  primaryTrade?: string;
  crewId?: number;
}

interface Crew {
  id: number;
  name: string;
  description?: string;
}

export default function AssignmentModal({ isOpen, onClose, taskId, taskDate }: AssignmentModalProps) {
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [selectedCrews, setSelectedCrews] = useState<Set<string>>(new Set());
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const { toast } = useToast();

  // Fetch employees
  const { data: employees = [] } = useQuery({
    queryKey: ["/api/employees"],
    staleTime: 30000,
  });

  // Fetch crews
  const { data: crews = [] } = useQuery({
    queryKey: ["/api/crews"],
    staleTime: 30000,
  });

  // Get crew members count
  const getCrewMemberCount = (crewId: number): number => {
    return (employees as Employee[]).filter(emp => emp.crewId === crewId).length;
  };

  // Handle crew selection
  const toggleCrewSelection = (crewId: string) => {
    const crew = (crews as Crew[]).find(c => c.id.toString() === crewId);
    if (!crew) return;

    const newSelectedCrews = new Set(selectedCrews);
    if (newSelectedCrews.has(crewId)) {
      newSelectedCrews.delete(crewId);
      // Also deselect all crew members
      const crewMembers = (employees as Employee[])
        .filter(emp => emp.crewId === crew.id)
        .map(emp => emp.teamMemberId);
      const newSelectedEmployees = new Set(selectedEmployees);
      crewMembers.forEach(memberId => newSelectedEmployees.delete(memberId));
      setSelectedEmployees(newSelectedEmployees);
    } else {
      newSelectedCrews.add(crewId);
      // Also select all crew members
      const crewMembers = (employees as Employee[])
        .filter(emp => emp.crewId === crew.id)
        .map(emp => emp.teamMemberId);
      const newSelectedEmployees = new Set(selectedEmployees);
      crewMembers.forEach(memberId => newSelectedEmployees.add(memberId));
      setSelectedEmployees(newSelectedEmployees);
    }
    setSelectedCrews(newSelectedCrews);
  };

  // Handle employee selection
  const toggleEmployeeSelection = (employeeId: string) => {
    const newSelected = new Set(selectedEmployees);
    if (newSelected.has(employeeId)) {
      newSelected.delete(employeeId);
    } else {
      newSelected.add(employeeId);
    }
    setSelectedEmployees(newSelected);

    // Check if this affects crew selection
    const employee = (employees as Employee[]).find(emp => emp.teamMemberId === employeeId);
    if (employee?.crewId) {
      const crewMembers = (employees as Employee[])
        .filter(emp => emp.crewId === employee.crewId)
        .map(emp => emp.teamMemberId);
      
      const allMembersSelected = crewMembers.every(memberId => 
        memberId === employeeId ? newSelected.has(memberId) : selectedEmployees.has(memberId)
      );
      
      const newSelectedCrews = new Set(selectedCrews);
      if (allMembersSelected) {
        newSelectedCrews.add(employee.crewId.toString());
      } else {
        newSelectedCrews.delete(employee.crewId.toString());
      }
      setSelectedCrews(newSelectedCrews);
    }
  };

  // Create assignments mutation
  const createAssignmentsMutation = useMutation({
    mutationFn: async (assignments: any[]) => {
      const results = [];
      for (const assignment of assignments) {
        const result = await apiRequest(`/api/assignments`, {
          method: 'POST',
          body: assignment,
        });
        results.push(result);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assignments'] });
      queryClient.invalidateQueries({ queryKey: [`/api/tasks/${taskId}/assignments`] });
      toast({ title: "Success", description: "Assignments created successfully" });
      onClose();
      setSelectedEmployees(new Set());
      setSelectedCrews(new Set());
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create assignments", variant: "destructive" });
    },
  });

  // Handle assignment submission
  const handleSubmit = () => {
    const assignments = Array.from(selectedEmployees).map(employeeId => {
      const employee = (employees as Employee[]).find(emp => emp.teamMemberId === employeeId);
      return {
        assignmentId: `${taskId}_${employee?.id}`,
        taskId: Number(taskId),
        employeeId: employee?.id,
        assignmentDate: taskDate,
        assignedHours: "8",
        actualHours: null
      };
    });

    if (assignments.length === 0) {
      toast({ title: "Warning", description: "Please select at least one employee or crew", variant: "destructive" });
      return;
    }

    createAssignmentsMutation.mutate(assignments);
  };

  const getEmployeeDisplayRole = (employee: Employee): string => {
    if (employee.employeeType === 'Apprentice') {
      return 'Apprentice';
    }
    return employee.employeeType;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between border-b pb-4">
          <DialogTitle className="text-xl font-semibold">Assign Crew & Employees</DialogTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Crews Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              <h3 className="text-lg font-semibold">Crews</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(crews as Crew[]).map((crew) => {
                const memberCount = getCrewMemberCount(crew.id);
                const isSelected = selectedCrews.has(crew.id.toString());
                
                return (
                  <Card 
                    key={crew.id}
                    className={`p-4 cursor-pointer border-2 transition-all ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => toggleCrewSelection(crew.id.toString())}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{crew.name}</h4>
                        <p className="text-sm text-gray-500">{memberCount} members</p>
                      </div>
                      <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
                        Available
                      </Badge>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Individual Employees Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              <h3 className="text-lg font-semibold">Individual Employees</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(employees as Employee[]).map((employee) => {
                const isSelected = selectedEmployees.has(employee.teamMemberId);
                
                return (
                  <Card 
                    key={employee.teamMemberId}
                    className={`p-4 cursor-pointer border-2 transition-all ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => toggleEmployeeSelection(employee.teamMemberId)}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{employee.name}</h4>
                        <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
                          Available
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500">{employee.teamMemberId}</p>
                      <p className="text-sm font-medium">{getEmployeeDisplayRole(employee)}</p>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Assignment Summary */}
          <div className="border-t pt-4">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setSummaryExpanded(!summaryExpanded)}
            >
              <h3 className="text-lg font-semibold">Assignment Summary</h3>
              <ChevronDown className={`w-5 h-5 transition-transform ${summaryExpanded ? 'rotate-180' : ''}`} />
            </div>
            
            {summaryExpanded && (
              <div className="mt-4 space-y-2">
                <div className="text-sm text-gray-600">
                  Selected Crews: {selectedCrews.size}
                </div>
                <div className="text-sm text-gray-600">
                  Selected Employees: {selectedEmployees.size}
                </div>
                {selectedEmployees.size > 0 && (
                  <div className="text-sm text-gray-600">
                    Employees: {Array.from(selectedEmployees).map(id => {
                      const emp = (employees as Employee[]).find(e => e.teamMemberId === id);
                      return emp?.name;
                    }).join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t pt-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={selectedEmployees.size === 0 || createAssignmentsMutation.isPending}
          >
            {createAssignmentsMutation.isPending ? 'Assigning...' : 'Assign Selected'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}