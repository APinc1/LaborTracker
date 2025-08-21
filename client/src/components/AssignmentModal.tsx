import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Users, User, Clock, CheckCircle, X } from 'lucide-react';
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
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [selectedCrews, setSelectedCrews] = useState<string[]>([]);
  const [assignmentHours, setAssignmentHours] = useState<Record<string, number>>({});
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
  const [crewSearchTerm, setCrewSearchTerm] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [showCrewDropdown, setShowCrewDropdown] = useState(false);
  const { toast } = useToast();

  // Refs for handling dropdown focus
  const employeeDropdownRef = useRef<HTMLDivElement>(null);
  const crewDropdownRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens/closes or taskId changes
  const [modalInitialized, setModalInitialized] = React.useState(false);
  
  React.useEffect(() => {
    if (isOpen && !modalInitialized) {
      setSelectedEmployeeIds([]);
      setSelectedCrews([]);
      setAssignmentHours({});
      setEmployeeSearchTerm('');
      setCrewSearchTerm('');
      setModalInitialized(true);
    } else if (!isOpen) {
      setModalInitialized(false);
    }
  }, [isOpen, taskId, modalInitialized]);

  // Handle outside clicks for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(event.target as Node)) {
        setShowEmployeeDropdown(false);
      }
      if (crewDropdownRef.current && !crewDropdownRef.current.contains(event.target as Node)) {
        setShowCrewDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch employees with loading state
  const { data: employees = [], isLoading: employeesLoading } = useQuery({
    queryKey: ["/api/employees"],
    staleTime: 30000,
    retry: 3,
    retryDelay: 1000,
  });

  // Fetch crews with loading state
  const { data: crews = [], isLoading: crewsLoading } = useQuery({
    queryKey: ["/api/crews"],
    staleTime: 30000,
    retry: 3,
    retryDelay: 1000,
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

  // Fetch existing assignments for this task to show current state
  const { data: existingAssignments = [] } = useQuery({
    queryKey: ["/api/tasks", taskId, "assignments"],
    enabled: !!taskId,
    staleTime: 30000,
  });

  // Initialize selections with existing assignments
  React.useEffect(() => {
    if (modalInitialized && !employeesLoading && !crewsLoading && employees.length > 0 && crews.length > 0) {
      if (existingAssignments.length > 0) {
        const existingEmployeeIds = existingAssignments.map((assignment: any) => {
          const employee = (employees as any[]).find(emp => emp.id === assignment.employeeId);
          return employee?.id.toString();
        }).filter(Boolean);
        
        const existingHours: Record<string, number> = {};
        existingAssignments.forEach((assignment: any) => {
          const employee = (employees as any[]).find(emp => emp.id === assignment.employeeId);
          if (employee) {
            existingHours[employee.id.toString()] = parseFloat(assignment.assignedHours);
          }
        });

        // Check if any crews are fully assigned
        const assignedCrews: string[] = [];
        (crews as any[]).forEach(crew => {
          const crewMembers = (employees as any[]).filter(emp => emp.crewId === crew.id);
          const assignedMembers = crewMembers.filter(member => 
            existingEmployeeIds.includes(member.id.toString())
          );
          
          // If all crew members are assigned, mark crew as selected
          if (crewMembers.length > 0 && assignedMembers.length === crewMembers.length) {
            assignedCrews.push(crew.id.toString());
          }
        });

        setSelectedEmployeeIds(existingEmployeeIds);
        setSelectedCrews(assignedCrews);
        setAssignmentHours(existingHours);
      }
    }
  }, [modalInitialized, existingAssignments.length, employees.length, crews.length]);

  // Clear existing assignments function
  const clearExistingAssignmentsMutation = useMutation({
    mutationFn: async () => {
      if (existingAssignments.length === 0) return;
      
      const deletePromises = existingAssignments.map((assignment: any) =>
        apiRequest(`/api/assignments/${assignment.id}`, {
          method: 'DELETE'
        })
      );
      
      return Promise.all(deletePromises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
    }
  });

  // Calculate employee availability for the task date (excluding current task when editing)
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

    // Find assignments for this employee on the task date, excluding current task
    const employeeAssignments = (allAssignments as any[]).filter((assignment: any) => {
      const assignmentTask = (allTasks as any[]).find((task: any) => task.id === assignment.taskId || task.taskId === assignment.taskId);
      return assignment.employeeId === employee.id && 
             assignment.taskId !== taskId &&  // Exclude current task assignments when editing
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

  const employeesWithAvailability = employeesLoading ? [] : (employees as any[]).map((emp: any) => calculateEmployeeAvailability(emp.teamMemberId));
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
      // First, clear existing assignments
      if (existingAssignments.length > 0) {
        await clearExistingAssignmentsMutation.mutateAsync();
      }
      
      // Then create new assignments
      const assignments = Array.from(selectedEmployees).map(teamMemberId => {
        const employee = (employees as any[]).find(emp => emp.teamMemberId === teamMemberId);
        if (!employee) return null;
        
        return {
          assignmentId: `${taskId}_${employee.id}`,
          taskId: taskId,
          employeeId: employee.id,
          assignmentDate: taskDate,
          assignedHours: (assignmentHours[teamMemberId] || 8).toString(),
          actualHours: null
        };
      }).filter(Boolean);

      if (assignments.length === 0) return [];

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
      // Invalidate all assignment-related queries
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments", "date"] });
      
      // Also invalidate the schedule queries to refresh task displays
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          query.queryKey[0] === "/api/tasks/date-range" && 
          query.queryKey.length >= 3 && 
          query.queryKey[1] && 
          query.queryKey[2]
      });
      
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
                            {employee.isForeman && (
                              <Badge variant="default" className="ml-2 text-xs bg-blue-600">
                                Foreman
                              </Badge>
                            )}
                          </h4>
                          <p className="text-xs text-gray-500">{employee.teamMemberId}</p>
                          <div className="flex gap-1 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {employee.employeeType}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {employee.primaryTrade}
                            </Badge>
                          </div>
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
              {createAssignmentsMutation.isPending ? 'Saving...' : 
               existingAssignments.length > 0 ? 'Update Assignments' : 'Create Assignments'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}