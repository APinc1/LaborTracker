import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Users, User, Clock, CheckCircle, X } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface EnhancedAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string | number;
  taskDate: string;
  taskName?: string;
}

export default function EnhancedAssignmentModal({ 
  isOpen, 
  onClose, 
  taskId, 
  taskDate, 
  taskName = "Task" 
}: EnhancedAssignmentModalProps) {
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [selectedCrews, setSelectedCrews] = useState<string[]>([]);
  const [defaultHours, setDefaultHours] = useState<string>('8');
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
  const [crewSearchTerm, setCrewSearchTerm] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [showCrewDropdown, setShowCrewDropdown] = useState(false);
  const { toast } = useToast();

  // Refs for handling dropdown focus
  const employeeDropdownRef = useRef<HTMLDivElement>(null);
  const crewDropdownRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedEmployeeIds([]);
      setSelectedCrews([]);
      setDefaultHours('8');
      setEmployeeSearchTerm('');
      setCrewSearchTerm('');
    }
  }, [isOpen, taskId]);

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

  // Fetch data
  const { data: employees = [] } = useQuery({
    queryKey: ["/api/employees"],
    staleTime: 30000,
  });

  const { data: crews = [] } = useQuery({
    queryKey: ["/api/crews"],
    staleTime: 30000,
  });

  const { data: allAssignments = [] } = useQuery({
    queryKey: ["/api/assignments"],
    staleTime: 30000,
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ["/api/tasks/date-range", taskDate, taskDate],
    staleTime: 30000,
  });

  // Fetch existing assignments for this task
  const { data: existingAssignments = [] } = useQuery({
    queryKey: ["/api/tasks", taskId, "assignments"],
    enabled: !!taskId,
    staleTime: 30000,
  });

  // Load existing assignments when modal opens
  useEffect(() => {
    if (isOpen && existingAssignments.length > 0 && employees.length > 0) {
      const existingEmployeeIds = existingAssignments.map((assignment: any) => {
        const employee = (employees as any[]).find(emp => emp.id === assignment.employeeId);
        return employee?.id.toString();
      }).filter(Boolean);

      // Load hours from first assignment (assuming all have same hours)
      const firstAssignmentHours = existingAssignments[0]?.assignedHours?.toString() || '8';

      // Check for fully assigned crews
      const assignedCrews: string[] = [];
      (crews as any[]).forEach(crew => {
        const crewMembers = (employees as any[]).filter(emp => emp.crewId === crew.id);
        const assignedMembers = crewMembers.filter(member => 
          existingEmployeeIds.includes(member.id.toString())
        );
        
        if (crewMembers.length > 0 && assignedMembers.length === crewMembers.length) {
          assignedCrews.push(crew.id.toString());
        }
      });

      setSelectedEmployeeIds(existingEmployeeIds);
      setSelectedCrews(assignedCrews);
      setDefaultHours(firstAssignmentHours);
    }
  }, [isOpen, existingAssignments, employees, crews]);

  // Calculate employee availability
  const calculateEmployeeAvailability = (employee: any) => {
    const employeeAssignments = (allAssignments as any[]).filter((assignment: any) => {
      const assignmentTask = (allTasks as any[]).find((task: any) => 
        (task.id === assignment.taskId || task.taskId === assignment.taskId)
      );
      return assignment.employeeId === employee.id && 
             assignment.taskId !== taskId &&  // Exclude current task
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

  const employeesWithAvailability = (employees as any[]).map(calculateEmployeeAvailability);
  
  const filteredEmployees = employeesWithAvailability.filter((employee: any) =>
    employee.name.toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
    employee.teamMemberId.toLowerCase().includes(employeeSearchTerm.toLowerCase())
  );

  const selectedEmployees = employeesWithAvailability.filter((emp: any) => 
    selectedEmployeeIds.includes(emp.id.toString())
  );

  // Calculate crew availability
  const calculateCrewAvailability = (crew: any) => {
    const crewMembers = employeesWithAvailability.filter((emp: any) => emp.crewId === crew.id);
    const totalMembers = crewMembers.length;
    
    if (totalMembers === 0) {
      return { ...crew, status: 'available', memberCount: 0, remainingHours: 8 };
    }

    const availableMembers = crewMembers.filter(member => member.status === 'available').length;
    const partialMembers = crewMembers.filter(member => member.status === 'partial').length;
    const fullMembers = crewMembers.filter(member => member.status === 'full').length;
    
    const averageRemainingHours = crewMembers.reduce((sum, member) => sum + member.remainingHours, 0) / totalMembers;
    
    let status: 'available' | 'partial' | 'full' = 'available';
    if (fullMembers === totalMembers) {
      status = 'full';
    } else if (partialMembers > 0 || fullMembers > 0) {
      status = 'partial';
    }

    return {
      ...crew,
      status,
      memberCount: totalMembers,
      remainingHours: averageRemainingHours
    };
  };

  const crewsWithAvailability = (crews as any[]).map(calculateCrewAvailability);
  
  const filteredCrews = crewsWithAvailability.filter((crew: any) =>
    crew.name.toLowerCase().includes(crewSearchTerm.toLowerCase())
  );

  // Clear existing assignments
  const clearExistingAssignmentsMutation = useMutation({
    mutationFn: async () => {
      if (existingAssignments.length === 0) return;
      const deletePromises = existingAssignments.map((assignment: any) =>
        apiRequest(`/api/assignments/${assignment.id}`, { method: 'DELETE' })
      );
      return Promise.all(deletePromises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
    }
  });

  // Create assignments
  const createAssignmentsMutation = useMutation({
    mutationFn: async () => {
      // Clear existing assignments first
      if (existingAssignments.length > 0) {
        await clearExistingAssignmentsMutation.mutateAsync();
      }
      
      // Create new assignments
      const assignments = selectedEmployeeIds.map(employeeIdStr => {
        const employee = (employees as any[]).find(emp => emp.id.toString() === employeeIdStr);
        if (!employee) return null;
        
        return {
          assignmentId: `${taskId}_${employee.id}`,
          taskId: taskId,
          employeeId: employee.id,
          assignmentDate: taskDate,
          assignedHours: defaultHours,
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
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments", "date"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/date-range"] });
      
      toast({ title: "Success", description: "Assignments updated successfully" });
      onClose();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update assignments", variant: "destructive" });
    },
  });

  const getAvailabilityBadge = (employee: any) => {
    if (employee.status === 'full') {
      return (
        <Badge className="bg-red-500 text-white text-xs">
          {employee.scheduledHours}h Booked
        </Badge>
      );
    } else if (employee.status === 'partial') {
      return (
        <Badge className="bg-yellow-500 text-black text-xs">
          {employee.remainingHours}h Left
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-green-500 text-white text-xs">
          Available
        </Badge>
      );
    }
  };

  const getCrewAvailabilityBadge = (crew: any) => {
    if (crew.status === 'full') {
      return <Badge className="bg-red-500 text-white text-xs">All Booked</Badge>;
    } else if (crew.status === 'partial') {
      return <Badge className="bg-yellow-500 text-black text-xs">Some Booked</Badge>;
    } else {
      return <Badge className="bg-green-500 text-white text-xs">Available</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Employees to {taskName}</DialogTitle>
          <div className="text-sm text-gray-500">Date: {taskDate}</div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Crews Section */}
          <div>
            <Label className="text-base font-medium">Crews</Label>
            <div className="mt-2">
              {/* Selected crews display */}
              {selectedCrews.length > 0 && (
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600">{selectedCrews.length} crew(s) selected</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        // Remove all crew-selected employees
                        const crewMemberIds = (employees as any[])
                          .filter(emp => selectedCrews.includes(emp.crewId?.toString()))
                          .map(emp => emp.id.toString());
                        
                        const updatedEmployeeIds = selectedEmployeeIds.filter(
                          empId => !crewMemberIds.includes(empId)
                        );
                        
                        setSelectedEmployeeIds(updatedEmployeeIds);
                        setSelectedCrews([]);
                      }}
                    >
                      Clear All
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedCrews.map((crewId: string) => {
                      const crew = (crews as any[]).find(c => c.id.toString() === crewId);
                      if (!crew) return null;
                      
                      return (
                        <div key={crewId} className="text-xs px-2 py-1 rounded-lg border bg-blue-100 border-blue-200 text-blue-800">
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{crew.name}</span>
                            <button
                              type="button"
                              className="ml-1 hover:bg-blue-300 rounded-full w-4 h-4 flex items-center justify-center transition-colors"
                              onClick={() => {
                                const updatedCrews = selectedCrews.filter(id => id !== crewId);
                                setSelectedCrews(updatedCrews);
                                
                                // Remove only this crew's members
                                const crewMemberIds = (employees as any[])
                                  .filter(emp => emp.crewId === crew.id)
                                  .map(emp => emp.id.toString());
                                
                                const updatedEmployeeIds = selectedEmployeeIds.filter(
                                  empId => !crewMemberIds.includes(empId)
                                );
                                
                                setSelectedEmployeeIds(updatedEmployeeIds);
                              }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              <div className="relative" ref={crewDropdownRef}>
                <Input
                  type="text"
                  placeholder="Search and select crews..."
                  value={crewSearchTerm}
                  onChange={(e) => setCrewSearchTerm(e.target.value)}
                  onClick={() => setShowCrewDropdown(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (filteredCrews.length > 0) {
                        const firstCrew = filteredCrews[0];
                        const crewId = firstCrew.id.toString();
                        const isSelected = selectedCrews.includes(crewId);
                        
                        let newSelectedCrews;
                        if (isSelected) {
                          newSelectedCrews = selectedCrews.filter(id => id !== crewId);
                        } else {
                          newSelectedCrews = [...selectedCrews, crewId];
                        }
                        
                        setSelectedCrews(newSelectedCrews);
                        
                        if (isSelected) {
                          // Remove crew members
                          const crewMemberIds = (employees as any[])
                            .filter(emp => emp.crewId === firstCrew.id)
                            .map(emp => emp.id.toString());
                          
                          const updatedEmployeeIds = selectedEmployeeIds.filter(
                            empId => !crewMemberIds.includes(empId)
                          );
                          
                          setSelectedEmployeeIds(updatedEmployeeIds);
                        } else {
                          // Add crew members
                          const crewMemberIds = (employees as any[])
                            .filter(emp => emp.crewId === firstCrew.id)
                            .map(emp => emp.id.toString());
                          
                          const updatedEmployeeIds = Array.from(new Set([...selectedEmployeeIds, ...crewMemberIds]));
                          setSelectedEmployeeIds(updatedEmployeeIds);
                        }
                        
                        setCrewSearchTerm('');
                        setShowCrewDropdown(false);
                      }
                    }
                  }}
                  className="w-full"
                />
                
                {showCrewDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredCrews.map((crew: any) => {
                      const isSelected = selectedCrews.includes(crew.id.toString());
                      let cardStyle = "px-3 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ";
                      
                      if (isSelected) {
                        cardStyle += "ring-2 ring-blue-500 ";
                      }

                      if (crew.status === 'full') {
                        cardStyle += "bg-red-100 hover:bg-red-200 ";
                      } else if (crew.status === 'partial') {
                        cardStyle += "bg-yellow-50 hover:bg-yellow-100 ";
                      } else {
                        cardStyle += "bg-blue-50 hover:bg-blue-100 ";
                      }

                      return (
                        <div
                          key={crew.id}
                          className={cardStyle}
                          onClick={() => {
                            const crewId = crew.id.toString();
                            const crewIsSelected = selectedCrews.includes(crewId);
                            
                            let newSelectedCrews;
                            if (crewIsSelected) {
                              newSelectedCrews = selectedCrews.filter(id => id !== crewId);
                            } else {
                              newSelectedCrews = [...selectedCrews, crewId];
                            }
                            
                            setSelectedCrews(newSelectedCrews);
                            
                            if (crewIsSelected) {
                              // Remove crew members
                              const crewMemberIds = (employees as any[])
                                .filter(emp => emp.crewId === crew.id)
                                .map(emp => emp.id.toString());
                              
                              const updatedEmployeeIds = selectedEmployeeIds.filter(
                                empId => !crewMemberIds.includes(empId)
                              );
                              
                              setSelectedEmployeeIds(updatedEmployeeIds);
                            } else {
                              // Add crew members
                              const crewMemberIds = (employees as any[])
                                .filter(emp => emp.crewId === crew.id)
                                .map(emp => emp.id.toString());
                              
                              const updatedEmployeeIds = Array.from(new Set([...selectedEmployeeIds, ...crewMemberIds]));
                              setSelectedEmployeeIds(updatedEmployeeIds);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sm">{crew.name}</span>
                                {getCrewAvailabilityBadge(crew)}
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                {crew.memberCount} members
                              </div>
                              <div className="text-xs text-gray-600">
                                Avg {crew.remainingHours.toFixed(1)}h remaining
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Employees Section */}
          <div>
            <Label className="text-base font-medium">Individual Employees</Label>
            <div className="mt-2">
              {/* Selected employees display */}
              {selectedEmployees.length > 0 && (
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600">{selectedEmployees.length} employee(s) selected</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        setSelectedEmployeeIds([]);
                        setSelectedCrews([]);
                      }}
                    >
                      Clear All
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedEmployees.map((emp: any) => {
                      const getSelectedEmployeeBadgeStyle = () => {
                        if (emp.status === 'full') {
                          return "bg-red-100 border-red-200 text-red-800 hover:bg-red-200";
                        } else if (emp.status === 'partial') {
                          return "bg-yellow-100 border-yellow-200 text-yellow-800 hover:bg-yellow-200";
                        } else {
                          return "bg-green-100 border-green-200 text-green-800 hover:bg-green-200";
                        }
                      };
                      
                      return (
                        <div key={emp.id} className={`text-xs px-2 py-1 rounded-lg border ${getSelectedEmployeeBadgeStyle()}`}>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{emp.name}</span>
                            <span className="text-xs opacity-75">
                              ({emp.status === 'full' ? `${emp.scheduledHours}h` : emp.status === 'partial' ? `${emp.remainingHours}h left` : 'Available'})
                            </span>
                            <button
                              type="button"
                              className="ml-1 hover:bg-gray-300 rounded-full w-4 h-4 flex items-center justify-center transition-colors"
                              onClick={() => {
                                const newIds = selectedEmployeeIds.filter(id => id !== emp.id.toString());
                                setSelectedEmployeeIds(newIds);
                                
                                // Remove from crew selection if this was the last member
                                const employeeCrewId = emp.crewId?.toString();
                                if (employeeCrewId) {
                                  const crewMembers = (employees as any[]).filter(e => e.crewId?.toString() === employeeCrewId);
                                  const remainingMembers = crewMembers.filter(member => 
                                    newIds.includes(member.id.toString())
                                  );
                                  
                                  if (remainingMembers.length === 0) {
                                    setSelectedCrews(prev => prev.filter(id => id !== employeeCrewId));
                                  }
                                }
                              }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              <div className="relative" ref={employeeDropdownRef}>
                <Input
                  type="text"
                  placeholder="Search and select employees..."
                  value={employeeSearchTerm}
                  onChange={(e) => {
                    setEmployeeSearchTerm(e.target.value);
                    setShowEmployeeDropdown(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const currentFilteredEmployees = employeeSearchTerm 
                        ? filteredEmployees 
                        : employeesWithAvailability;
                      
                      if (currentFilteredEmployees.length > 0) {
                        const topEmployee = currentFilteredEmployees[0];
                        if (!selectedEmployeeIds.includes(topEmployee.id.toString())) {
                          const newIds = [...selectedEmployeeIds, topEmployee.id.toString()];
                          setSelectedEmployeeIds(newIds);
                        }
                        setEmployeeSearchTerm('');
                        setShowEmployeeDropdown(false);
                      }
                    } else if (e.key === 'Escape') {
                      setShowEmployeeDropdown(false);
                    }
                  }}
                  onClick={() => setShowEmployeeDropdown(true)}
                  className="w-full"
                />
                
                {showEmployeeDropdown && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredEmployees.map((employee: any) => {
                      const isSelected = selectedEmployeeIds.includes(employee.id.toString());
                      let cardStyle = "px-3 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ";
                      
                      if (isSelected) {
                        cardStyle += "ring-2 ring-blue-500 ";
                      }

                      if (employee.status === 'full') {
                        cardStyle += "bg-red-100 hover:bg-red-200 ";
                      } else if (employee.status === 'partial') {
                        cardStyle += "bg-yellow-50 hover:bg-yellow-100 ";
                      } else {
                        cardStyle += "bg-blue-50 hover:bg-blue-100 ";
                      }

                      return (
                        <div
                          key={employee.id}
                          className={cardStyle}
                          onClick={() => {
                            const employeeId = employee.id.toString();
                            if (isSelected) {
                              const newIds = selectedEmployeeIds.filter(id => id !== employeeId);
                              setSelectedEmployeeIds(newIds);
                            } else {
                              const newIds = [...selectedEmployeeIds, employeeId];
                              setSelectedEmployeeIds(newIds);
                            }
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={isSelected}
                              onClick={(e) => e.stopPropagation()}
                              onCheckedChange={() => {}} // Handled by row click
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="font-medium text-sm">{employee.name}</span>
                                  <div className="text-xs text-gray-600">
                                    {employee.teamMemberId} • {employee.employeeType}
                                  </div>
                                  {employee.primaryTrade && (
                                    <div className="text-xs text-gray-600">
                                      {employee.primaryTrade}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {getAvailabilityBadge(employee)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Hours Input */}
          <div>
            <Label className="text-sm font-medium">Assigned Hours</Label>
            <div className="text-xs text-gray-600 mb-2">Hours to assign to all selected employees</div>
            <Input
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={defaultHours}
              onChange={(e) => setDefaultHours(e.target.value)}
              className="w-24"
              placeholder="8"
            />
          </div>

          <Separator />

          {/* Action buttons */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={() => createAssignmentsMutation.mutate()}
              disabled={createAssignmentsMutation.isPending || selectedEmployeeIds.length === 0}
            >
              {createAssignmentsMutation.isPending ? "Saving..." : "Save Assignments"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}