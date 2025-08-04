import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Users, User, Clock, CheckCircle } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface AssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string | number;
  taskDate: string;
}

interface EmployeeWithAvailability {
  teamMemberId: string;
  name: string;
  employeeType: string;
  primaryTrade?: string;
  secondaryTrade?: string;
  tertiaryTrade?: string;
  unionStatus?: string;
  apprenticeLevel?: string;
  crews?: string[];
  scheduledHours: number;
  remainingHours: number;
  status: 'available' | 'partial' | 'full';
}

interface CrewWithAvailability {
  id: string;
  name: string;
  description?: string;
  memberIds: string[];
  members: EmployeeWithAvailability[];
  status: 'available' | 'partial' | 'full';
  totalScheduledHours: number;
  averageRemainingHours: number;
}

export default function AssignmentModal({ isOpen, onClose, taskId, taskDate }: AssignmentModalProps) {
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [selectedCrews, setSelectedCrews] = useState<Set<string>>(new Set());
  const [assignmentHours, setAssignmentHours] = useState<Record<string, number>>({});
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

  // Fetch existing assignments for the task date to calculate availability
  const { data: allAssignments = [] } = useQuery({
    queryKey: ["/api/assignments"],
    staleTime: 30000,
  });

  // Fetch all tasks for the date to get schedule conflicts
  const { data: allTasks = [] } = useQuery({
    queryKey: ["/api/tasks/date-range", taskDate, taskDate],
    staleTime: 30000,
  });

  // Calculate employee availability for the task date
  const calculateEmployeeAvailability = (employeeId: string): EmployeeWithAvailability => {
    const employee = (employees as any[]).find((emp: any) => emp.teamMemberId === employeeId);
    if (!employee) {
      return {
        teamMemberId: employeeId,
        name: 'Unknown',
        employeeType: 'Unknown',
        scheduledHours: 0,
        remainingHours: 8,
        status: 'available'
      };
    }

    // Find assignments for this employee on the task date
    const employeeAssignments = (allAssignments as any[]).filter((assignment: any) => {
      const assignmentTask = (allTasks as any[]).find((task: any) => task.id === assignment.taskId || task.taskId === assignment.taskId);
      return assignment.employeeId === employeeId && 
             assignmentTask && 
             assignmentTask.taskDate === taskDate;
    });

    const scheduledHours = employeeAssignments.reduce((total: number, assignment: any) => {
      return total + (parseFloat(assignment.assignedHours) || 0);
    }, 0);

    const remainingHours = Math.max(0, 8 - scheduledHours);
    let status: 'available' | 'partial' | 'full' = 'available';
    
    if (scheduledHours >= 8) {
      status = 'full';
    } else if (scheduledHours > 0) {
      status = 'partial';
    }

    return {
      ...employee,
      scheduledHours,
      remainingHours,
      status
    };
  };

  // Get crews with their members and availability
  const getCrewsWithAvailability = (): CrewWithAvailability[] => {
    return (crews as any[]).map((crew: any) => {
      // Find all employees in this crew
      const crewMembers = (employees as any[])
        .filter((employee: any) => employee.crewId === crew.id)
        .map((employee: any) => calculateEmployeeAvailability(employee.teamMemberId));
      
      const totalScheduledHours = crewMembers.reduce((sum, member) => sum + member.scheduledHours, 0);
      const averageRemainingHours = crewMembers.length > 0 ? 
        crewMembers.reduce((sum, member) => sum + member.remainingHours, 0) / crewMembers.length : 8;
      
      let status: 'available' | 'partial' | 'full' = 'available';
      if (crewMembers.length > 0) {
        if (crewMembers.every(member => member.status === 'full')) {
          status = 'full';
        } else if (crewMembers.some(member => member.status !== 'available')) {
          status = 'partial';
        }
      }

      return {
        id: crew.id.toString(),
        name: crew.name,
        description: crew.description,
        memberIds: crewMembers.map(member => member.teamMemberId),
        members: crewMembers,
        status,
        totalScheduledHours,
        averageRemainingHours
      };
    });
  };

  const employeesWithAvailability = (employees as any[]).map((emp: any) => calculateEmployeeAvailability(emp.teamMemberId));
  const crewsWithAvailability = getCrewsWithAvailability();

  // Handle employee selection
  const toggleEmployeeSelection = (employeeId: string) => {
    const newSelection = new Set(selectedEmployees);
    if (newSelection.has(employeeId)) {
      newSelection.delete(employeeId);
      const newHours = { ...assignmentHours };
      delete newHours[employeeId];
      setAssignmentHours(newHours);
    } else {
      newSelection.add(employeeId);
      const employee = employeesWithAvailability.find(emp => emp.teamMemberId === employeeId);
      setAssignmentHours({
        ...assignmentHours,
        [employeeId]: Math.min(8, employee?.remainingHours || 8)
      });
    }
    setSelectedEmployees(newSelection);
  };

  // Handle crew selection (selects all crew members)
  const toggleCrewSelection = (crewId: string) => {
    const crew = crewsWithAvailability.find(c => c.id === crewId);
    if (!crew) return;

    const newCrewSelection = new Set(selectedCrews);
    const newEmployeeSelection = new Set(selectedEmployees);
    const newHours = { ...assignmentHours };

    if (newCrewSelection.has(crewId)) {
      // Deselect crew and all its members
      newCrewSelection.delete(crewId);
      crew.memberIds.forEach(memberId => {
        newEmployeeSelection.delete(memberId);
        delete newHours[memberId];
      });
    } else {
      // Select crew and all its members
      newCrewSelection.add(crewId);
      crew.members.forEach(member => {
        newEmployeeSelection.add(member.teamMemberId);
        newHours[member.teamMemberId] = Math.min(8, member.remainingHours);
      });
    }

    setSelectedCrews(newCrewSelection);
    setSelectedEmployees(newEmployeeSelection);
    setAssignmentHours(newHours);
  };

  // Handle hours change
  const updateAssignmentHours = (employeeId: string, hours: number) => {
    const employee = employeesWithAvailability.find(emp => emp.teamMemberId === employeeId);
    const maxHours = employee?.remainingHours || 8;
    const validHours = Math.min(Math.max(0, hours), maxHours);
    
    setAssignmentHours({
      ...assignmentHours,
      [employeeId]: validHours
    });
  };

  // Create assignments
  const createAssignmentsMutation = useMutation({
    mutationFn: async () => {
      const assignments = Array.from(selectedEmployees).map(employeeId => ({
        taskId: taskId,
        employeeId: employeeId,
        assignedHours: assignmentHours[employeeId] || 8,
        actualHours: 0
      }));

      const promises = assignments.map(assignment =>
        apiRequest('/api/assignments', {
          method: 'POST',
          body: JSON.stringify(assignment),
          headers: { 'Content-Type': 'application/json' }
        })
      );

      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: "Success", description: "Assignments created successfully" });
      onClose();
      setSelectedEmployees(new Set());
      setSelectedCrews(new Set());
      setAssignmentHours({});
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create assignments", variant: "destructive" });
    },
  });

  const getEmployeeCardStyle = (employee: EmployeeWithAvailability): string => {
    const isSelected = selectedEmployees.has(employee.teamMemberId);
    let baseStyle = "p-3 border rounded-lg cursor-pointer transition-all ";
    
    if (isSelected) {
      baseStyle += "border-blue-500 bg-blue-50 ";
    } else {
      baseStyle += "border-gray-200 hover:border-gray-300 ";
    }

    if (employee.status === 'full') {
      baseStyle += "bg-red-50 border-red-200 ";
    } else if (employee.status === 'partial') {
      baseStyle += "bg-yellow-50 border-yellow-200 ";
    }

    return baseStyle;
  };

  const getCrewCardStyle = (crew: CrewWithAvailability): string => {
    const isSelected = selectedCrews.has(crew.id);
    let baseStyle = "p-3 border rounded-lg cursor-pointer transition-all ";
    
    if (isSelected) {
      baseStyle += "border-blue-500 bg-blue-50 ";
    } else {
      baseStyle += "border-gray-200 hover:border-gray-300 ";
    }

    if (crew.status === 'full') {
      baseStyle += "bg-red-50 border-red-200 ";
    } else if (crew.status === 'partial') {
      baseStyle += "bg-yellow-50 border-yellow-200 ";
    }

    return baseStyle;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Crew & Employees</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Crews Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Crews
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {crewsWithAvailability.map((crew) => (
                  <div
                    key={crew.id}
                    className={getCrewCardStyle(crew)}
                    onClick={() => toggleCrewSelection(crew.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className={`font-medium ${crew.status === 'full' ? 'line-through text-red-600' : ''}`}>
                          {crew.name}
                        </h4>
                        <p className="text-sm text-gray-500">{crew.members.length} members</p>
                        {crew.status === 'partial' && (
                          <p className="text-sm text-orange-600">
                            Avg {crew.averageRemainingHours.toFixed(1)}h remaining
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {crew.status === 'full' && <Badge variant="destructive">Fully Booked</Badge>}
                        {crew.status === 'partial' && <Badge variant="outline" className="border-yellow-500 text-yellow-700">Partially Booked</Badge>}
                        {crew.status === 'available' && <Badge variant="outline" className="border-green-500 text-green-700">Available</Badge>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Separator />

          {/* Individual Employees Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Individual Employees
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {employeesWithAvailability.map((employee) => (
                  <div key={employee.teamMemberId}>
                    <div
                      className={getEmployeeCardStyle(employee)}
                      onClick={() => toggleEmployeeSelection(employee.teamMemberId)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className={`font-medium text-sm ${employee.status === 'full' ? 'line-through text-red-600' : ''}`}>
                            {employee.name}
                          </h4>
                          <p className="text-xs text-gray-500">{employee.teamMemberId}</p>
                          <Badge variant="outline" className="text-xs">
                            {employee.employeeType}
                          </Badge>
                        </div>
                        <div className="text-right">
                          {employee.status === 'full' && <Badge variant="destructive" className="text-xs">8h Booked</Badge>}
                          {employee.status === 'partial' && (
                            <Badge variant="outline" className="border-yellow-500 text-yellow-700 text-xs">
                              {employee.remainingHours}h Left
                            </Badge>
                          )}
                          {employee.status === 'available' && <Badge variant="outline" className="border-green-500 text-green-700 text-xs">Available</Badge>}
                        </div>
                      </div>

                      {/* Hours input for selected employees */}
                      {selectedEmployees.has(employee.teamMemberId) && employee.status !== 'full' && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <Label className="text-xs">Hours to assign:</Label>
                          <Input
                            type="number"
                            min="0"
                            max={employee.remainingHours}
                            value={assignmentHours[employee.teamMemberId] || ''}
                            onChange={(e) => updateAssignmentHours(employee.teamMemberId, parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs mt-1"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Assignment Summary */}
          {(selectedEmployees.size > 0 || selectedCrews.size > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Assignment Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm">
                    <strong>Selected Employees:</strong> {selectedEmployees.size}
                  </p>
                  <p className="text-sm">
                    <strong>Selected Crews:</strong> {selectedCrews.size}
                  </p>
                  <p className="text-sm">
                    <strong>Total Hours:</strong> {
                      Array.from(selectedEmployees).reduce((total, empId) => {
                        return total + (assignmentHours[empId] || 0);
                      }, 0)
                    }h
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => createAssignmentsMutation.mutate()}
              disabled={selectedEmployees.size === 0 || createAssignmentsMutation.isPending}
            >
              {createAssignmentsMutation.isPending ? 'Creating...' : 'Create Assignments'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}