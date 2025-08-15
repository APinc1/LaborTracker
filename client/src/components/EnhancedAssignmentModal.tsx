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
  const [employeeHours, setEmployeeHours] = useState<Record<string, string>>({});
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
  const [crewSearchTerm, setCrewSearchTerm] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [showCrewDropdown, setShowCrewDropdown] = useState(false);
  const [selectedSuperintendentId, setSelectedSuperintendentId] = useState<string | null>(null);
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
      setEmployeeHours({});
      setEditingEmployeeId(null);
      setEmployeeSearchTerm('');
      setCrewSearchTerm('');
      setSelectedSuperintendentId(null);
    }
  }, [isOpen, taskId]);

  // Handle outside clicks for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(event.target as Node)) {
        // Add a small delay to prevent immediate closing when clicking items
        setTimeout(() => setShowEmployeeDropdown(false), 100);
      }
      if (crewDropdownRef.current && !crewDropdownRef.current.contains(event.target as Node)) {
        setTimeout(() => setShowCrewDropdown(false), 100);
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

  const { data: users = [] } = useQuery({
    queryKey: ["/api/users"],
    staleTime: 30000,
  });

  // Fetch existing assignments for this task
  const { data: existingAssignments = [] } = useQuery({
    queryKey: ["/api/tasks", taskId, "assignments"],
    enabled: !!taskId,
    staleTime: 30000,
  });

  // Fetch current task details to get superintendent
  const { data: currentTask } = useQuery({
    queryKey: ["/api/tasks", taskId],
    enabled: !!taskId,
    staleTime: 30000,
  });

  // Fetch location data to get project info
  const { data: currentLocation } = useQuery({
    queryKey: ["/api/locations", currentTask?.locationId],
    enabled: !!currentTask?.locationId,
    staleTime: 30000,
  });

  // Fetch project data using location's projectId
  const { data: currentProject } = useQuery({
    queryKey: ["/api/projects", currentLocation?.projectId],
    enabled: !!currentLocation?.projectId,
    staleTime: 30000,
  });

  // Only log once when modal opens
  useEffect(() => {
    if (isOpen) {
      console.log('Assignment Modal - Current Task:', currentTask);
      console.log('Assignment Modal - Current Location:', currentLocation);
      console.log('Assignment Modal - Current Project:', currentProject);
    }
  }, [isOpen]);

  // Filter users for superintendent dropdown
  const superintendents = (users as any[]).filter((user: any) => user.role === 'Superintendent');

  // Load existing assignments when modal opens
  useEffect(() => {
    if (isOpen && employees.length > 0) {
      // Always load existing assignments if they exist
      if (existingAssignments.length > 0) {
        const existingEmployeeIds = existingAssignments.map((assignment: any) => {
          const employee = (employees as any[]).find(emp => emp.id === assignment.employeeId);
          return employee?.id.toString();
        }).filter(Boolean);

        // Load hours from first assignment for default, and individual hours for each employee
        const firstAssignmentHours = existingAssignments[0]?.assignedHours?.toString() || '8';
        const individualHours: Record<string, string> = {};
        existingAssignments.forEach((assignment: any) => {
          const employee = (employees as any[]).find(emp => emp.id === assignment.employeeId);
          if (employee) {
            individualHours[employee.id.toString()] = assignment.assignedHours?.toString() || '8';
          }
        });

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

        // console.log('Loading existing assignments:', {
        //   existingEmployeeIds,
        //   individualHours,
        //   assignedCrews
        // });

        setSelectedEmployeeIds(existingEmployeeIds);
        setSelectedCrews(assignedCrews);
        setDefaultHours(firstAssignmentHours);
        setEmployeeHours(individualHours);
      }
    }

    // Load superintendent from current task, or default from project (only on first open)
    if (isOpen) {
      // console.log('Setting superintendent - Task superintendent:', currentTask?.superintendentId);
      // console.log('Setting superintendent - Project default:', currentProject?.defaultSuperintendent);
      // console.log('Current selected superintendent:', selectedSuperintendentId);
      
      if (currentTask && currentTask.superintendentId) {
        // console.log('Using task superintendent:', currentTask.superintendentId);
        setSelectedSuperintendentId(currentTask.superintendentId.toString());
      } else if (selectedSuperintendentId === null && currentProject && currentProject.defaultSuperintendent) {
        // Only set default if no superintendent is currently selected
        // console.log('No superintendent selected, using project default:', currentProject.defaultSuperintendent);
        
        // Check if defaultSuperintendent is a name (string) or ID (number)
        if (typeof currentProject.defaultSuperintendent === 'string') {
          // Find user by name
          const superintendentUser = superintendents.find((user: any) => 
            user.name === currentProject.defaultSuperintendent
          );
          if (superintendentUser) {
            // console.log('Found superintendent by name:', superintendentUser);
            setSelectedSuperintendentId(superintendentUser.id.toString());
          } else {
            // console.log('Superintendent name not found in users list');
          }
        } else {
          // It's already an ID
          setSelectedSuperintendentId(currentProject.defaultSuperintendent.toString());
        }
      } else if (!currentTask?.superintendentId && selectedSuperintendentId !== null) {
        // console.log('Keeping user-selected superintendent:', selectedSuperintendentId);
      }
    }
  }, [isOpen, existingAssignments.length, employees.length, crews.length, currentTask?.id, currentLocation?.id, currentProject?.id]);

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
      console.log('🧨 CLEARING ASSIGNMENTS - existingAssignments:', existingAssignments);
      console.log('🧨 CLEARING ASSIGNMENTS - currentTask:', currentTask);
      
      const promises = [];
      
      // Delete existing employee assignments
      if (existingAssignments.length > 0) {
        console.log('🧨 Deleting', existingAssignments.length, 'existing assignments');
        const deletePromises = existingAssignments.map((assignment: any) => {
          console.log('🧨 DELETE assignment:', assignment.id);
          return apiRequest(`/api/assignments/${assignment.id}`, { method: 'DELETE' });
        });
        promises.push(...deletePromises);
      }
      
      // Clear superintendent from task if it exists
      if (currentTask && currentTask.superintendentId) {
        console.log('🧨 Clearing superintendent from task:', currentTask.superintendentId);
        const clearSuperintendentPromise = apiRequest(`/api/tasks/${taskId}`, {
          method: 'PUT',
          body: JSON.stringify({ superintendentId: null }),
          headers: { 'Content-Type': 'application/json' }
        });
        promises.push(clearSuperintendentPromise);
      }
      
      console.log('🧨 Total promises to execute:', promises.length);
      const results = await Promise.all(promises);
      console.log('🧨 Clear assignments results:', results);
      return results;
    },
    onSuccess: () => {
      // Aggressive cache invalidation for clearing assignments
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/date-range"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments", "date"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      
      // Force complete cache removal and refetch
      setTimeout(() => {
        queryClient.removeQueries({ queryKey: ["/api/assignments"] });
        queryClient.refetchQueries({ queryKey: ["/api/assignments"] });
        // Also invalidate with refetchType: 'active' to force active queries to refetch
        queryClient.invalidateQueries({ queryKey: ["/api/assignments"], refetchType: 'active' });
      }, 50);
      
      // Additional aggressive invalidation - nuclear option
      queryClient.resetQueries({ queryKey: ["/api/assignments"] });
      
      // Force immediate optimistic cache update - manually update the cache
      setTimeout(() => {
        queryClient.setQueryData(["/api/assignments"], (oldData: any[]) => {
          if (!oldData) return [];
          // Remove all assignments for this specific task
          return oldData.filter(assignment => assignment.taskId !== taskId);
        });
      }, 100);
    }
  });

  // Create assignments
  const createAssignmentsMutation = useMutation({
    mutationFn: async () => {
      // Always clear existing assignments first to avoid conflicts
      if (existingAssignments.length > 0) {
        await clearExistingAssignmentsMutation.mutateAsync();
      }
      
      // Capture current state values to avoid stale closure
      const currentSelectedEmployeeIds = [...selectedEmployeeIds];
      const currentSelectedSuperintendentId = selectedSuperintendentId;
      

      
      // Create new assignments for all selected employees, excluding superintendent
      // Superintendents should only be assigned to the task's superintendentId field, not as assignments
      const superintendentIdStr = currentSelectedSuperintendentId === "none" ? null : currentSelectedSuperintendentId;
      
      const assignments = currentSelectedEmployeeIds
        .filter(employeeIdStr => employeeIdStr !== superintendentIdStr) // Exclude superintendent from assignments
        .map(employeeIdStr => {
          const employee = (employees as any[]).find(emp => emp.id.toString() === employeeIdStr);
          if (!employee) return null;
          
          return {
            assignmentId: `${taskId}_${employee.id}`,
            taskId: taskId,
            employeeId: employee.id,
            assignmentDate: taskDate,
            assignedHours: employeeHours[employeeIdStr] || defaultHours,
            actualHours: null
          };
        }).filter(Boolean);

      console.log('Selected employees:', currentSelectedEmployeeIds);
      console.log('Selected superintendent:', superintendentIdStr);
      console.log('Creating assignments for employees (excluding superintendent):', assignments.map(a => a.employeeId));

      // Create assignments for employees (if any)
      let results = [];
      if (assignments.length > 0) {
        const promises = assignments.map(assignment =>
          apiRequest('/api/assignments', {
            method: 'POST',
            body: JSON.stringify(assignment),
            headers: { 'Content-Type': 'application/json' }
          })
        );
        results = await Promise.all(promises);
      }

      // Update task with superintendent if selected (including clearing superintendent)
      if (currentSelectedSuperintendentId !== null && currentTask) {
        const superintendentIdToUpdate = currentSelectedSuperintendentId === "none" ? null : parseInt(currentSelectedSuperintendentId);
        // Only update if superintendent has changed
        if (currentTask.superintendentId !== superintendentIdToUpdate) {
          await apiRequest(`/api/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify({ superintendentId: superintendentIdToUpdate }),
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Return both results and current state for onSuccess callback
      return { results, currentSelectedEmployeeIds, currentSelectedSuperintendentId };
    },
    onSuccess: (data) => {
      const { results, currentSelectedEmployeeIds, currentSelectedSuperintendentId } = data;
      // Optimistic cache update for assignment creation - immediately add new assignments
      queryClient.setQueryData(["/api/assignments"], (oldData: any[]) => {
        if (!oldData) return [];
        
        // Remove any existing assignments for this task first
        const filteredData = oldData.filter(assignment => assignment.taskId !== taskId);
        
        // Add the new assignments based on selected employees (excluding superintendent)
        const superintendentIdStr = currentSelectedSuperintendentId === "none" ? null : currentSelectedSuperintendentId;
        const newAssignments = currentSelectedEmployeeIds
          .filter(employeeIdStr => employeeIdStr !== superintendentIdStr)
          .map((employeeIdStr, index) => {
            const employee = (employees as any[])?.find(emp => emp.id.toString() === employeeIdStr);
            return {
              id: `temp_${taskId}_${employeeIdStr}_${Date.now() + index}`,
              assignmentId: `${taskId}_${employeeIdStr}`,
              taskId: taskId,
              employeeId: parseInt(employeeIdStr),
              assignedHours: 8,
              actualHours: null,
              assignmentDate: taskDate, // Use the actual task date
              notes: null,
              // Add employee info for immediate display
              employee: employee ? {
                id: employee.id,
                name: employee.name,
                teamMemberId: employee.teamMemberId
              } : null
            };
          });
        
        return [...filteredData, ...newAssignments];
      });

      // Also update the specific task assignments cache
      queryClient.setQueryData(["/api/tasks", taskId, "assignments"], (oldData: any[]) => {
        const superintendentIdStr = currentSelectedSuperintendentId === "none" ? null : currentSelectedSuperintendentId;
        return currentSelectedEmployeeIds
          .filter(employeeIdStr => employeeIdStr !== superintendentIdStr)
          .map((employeeIdStr, index) => {
            const employee = (employees as any[])?.find(emp => emp.id.toString() === employeeIdStr);
            return {
              id: `temp_${taskId}_${employeeIdStr}_${Date.now() + index}`,
              assignmentId: `${taskId}_${employeeIdStr}`,
              taskId: taskId,
              employeeId: parseInt(employeeIdStr),
              assignedHours: 8,
              actualHours: null,
              assignmentDate: taskDate,
              notes: null,
              employee: employee ? {
                id: employee.id,
                name: employee.name,
                teamMemberId: employee.teamMemberId
              } : null
            };
          });
      });

      // Invalidate queries to fetch fresh data after the optimistic update
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments", "date"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/date-range"] });
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      
      // Force a complete refresh of all related data
      setTimeout(() => {
        // Force refetch of all assignment-related queries
        queryClient.refetchQueries({ queryKey: ["/api/assignments"] });
        queryClient.refetchQueries({ queryKey: ["/api/tasks", taskId] });
        queryClient.refetchQueries({ queryKey: ["/api/tasks/date-range"] });
        
        // Clear all assignment-related cache entries
        queryClient.removeQueries({ queryKey: ["/api/assignments"] });
        queryClient.removeQueries({ queryKey: ["/api/tasks", taskId, "assignments"] });
        queryClient.resetQueries({ queryKey: ["/api/assignments"] });
        
        // Refetch fresh data with active refetch
        queryClient.refetchQueries({ queryKey: ["/api/assignments"] });
        queryClient.invalidateQueries({ queryKey: ["/api/assignments"], refetchType: 'active' });
        
        // Optimistic cache update - immediately update the cache with fresh data
        queryClient.setQueryData(["/api/assignments"], (oldData: any[]) => {
          if (!oldData) return [];
          // Remove all assignments for this specific task
          return oldData.filter(assignment => assignment.taskId !== taskId);
        });
      }, 100);
      
      toast({ title: "Success", description: "Assignments and superintendent updated successfully" });
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
      <DialogContent className="max-w-2xl max-h-[95vh] h-[750px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Employees to {taskName}</DialogTitle>
          <div className="text-sm text-gray-500">
            Date: {taskDate}
            {existingAssignments.length > 0 && (
              <div className="text-blue-600 mt-1">
                Click on employees below to add them to this task, or modify existing assignments
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Superintendent Selection */}
          <div>
            <Label className="text-sm font-medium">Superintendent</Label>
            <div className="text-xs text-gray-600 mb-2">Select superintendent for this task</div>
            <div className="relative">
              <select
                value={selectedSuperintendentId || "none"}
                onChange={(e) => setSelectedSuperintendentId(e.target.value === "none" ? null : e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="none">None</option>
                {superintendents.map((user: any) => (
                  <option key={user.id} value={user.id.toString()}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Separator />

          {/* Assigned Hours Section */}
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
                          
                          // Remove hours for deselected crew members
                          const updatedHours = { ...employeeHours };
                          crewMemberIds.forEach(empId => {
                            delete updatedHours[empId];
                          });
                          setEmployeeHours(updatedHours);
                        } else {
                          // Add crew members
                          const crewMemberIds = (employees as any[])
                            .filter(emp => emp.crewId === firstCrew.id)
                            .map(emp => emp.id.toString());
                          
                          const updatedEmployeeIds = Array.from(new Set([...selectedEmployeeIds, ...crewMemberIds]));
                          setSelectedEmployeeIds(updatedEmployeeIds);
                          
                          // Add default hours for new crew members
                          const updatedHours = { ...employeeHours };
                          crewMemberIds.forEach(empId => {
                            if (!employeeHours[empId]) {
                              updatedHours[empId] = defaultHours;
                            }
                          });
                          setEmployeeHours(updatedHours);
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
                              
                              // Remove hours for deselected crew members
                              const updatedHours = { ...employeeHours };
                              crewMemberIds.forEach(empId => {
                                delete updatedHours[empId];
                              });
                              setEmployeeHours(updatedHours);
                            } else {
                              // Add crew members
                              const crewMemberIds = (employees as any[])
                                .filter(emp => emp.crewId === crew.id)
                                .map(emp => emp.id.toString());
                              
                              const updatedEmployeeIds = Array.from(new Set([...selectedEmployeeIds, ...crewMemberIds]));
                              setSelectedEmployeeIds(updatedEmployeeIds);
                              
                              // Add default hours for new crew members
                              const updatedHours = { ...employeeHours };
                              crewMemberIds.forEach(empId => {
                                if (!employeeHours[empId]) {
                                  updatedHours[empId] = defaultHours;
                                }
                              });
                              setEmployeeHours(updatedHours);
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
                    <span className="text-sm text-gray-600">
                      {selectedEmployees.length} employee(s) selected 
                      {existingAssignments.length > 0 && (
                        <span className="text-blue-600 ml-1">
                          (editing existing assignments)
                        </span>
                      )}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        setSelectedEmployeeIds([]);
                        setSelectedCrews([]);
                        setEmployeeHours({});
                        setEditingEmployeeId(null);
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
                      
                      const employeeId = emp.id.toString();
                      const isEditing = editingEmployeeId === employeeId;
                      
                      return (
                        <div 
                          key={emp.id} 
                          className={`text-xs px-2 py-1 rounded-lg border transition-colors ${getSelectedEmployeeBadgeStyle()}`}
                        >
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{emp.name}</span>
                            {isEditing ? (
                              <input
                                type="number"
                                min="0"
                                max="24"
                                step="0.5"
                                value={employeeHours[employeeId] || defaultHours}
                                onChange={(e) => {
                                  setEmployeeHours(prev => ({ ...prev, [employeeId]: e.target.value }));
                                }}
                                onBlur={() => setEditingEmployeeId(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === 'Escape') {
                                    setEditingEmployeeId(null);
                                  }
                                }}
                                className="w-12 px-1 py-0 text-xs border rounded ml-1 bg-white"
                                autoFocus
                              />
                            ) : (
                              <span 
                                className="text-xs opacity-75 cursor-pointer hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingEmployeeId(employeeId);
                                }}
                              >
                                ({employeeHours[employeeId] || defaultHours}h assigned)
                              </span>
                            )}
                            <button
                              type="button"
                              className="ml-1 hover:bg-gray-300 rounded-full w-4 h-4 flex items-center justify-center transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                const newIds = selectedEmployeeIds.filter(id => id !== employeeId);
                                setSelectedEmployeeIds(newIds);
                                
                                // Remove individual hours
                                const { [employeeId]: removed, ...remainingHours } = employeeHours;
                                setEmployeeHours(remainingHours);
                                setEditingEmployeeId(null);
                                
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
                          const employeeId = topEmployee.id.toString();
                          setSelectedEmployeeIds(newIds);
                          // Add default hours if not set
                          if (!employeeHours[employeeId]) {
                            setEmployeeHours(prev => ({ ...prev, [employeeId]: defaultHours }));
                          }
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
                            console.log('Employee clicked:', employee.name, 'ID:', employeeId);
                            console.log('Currently selected:', selectedEmployeeIds);
                            console.log('Is selected:', isSelected);
                            
                            if (isSelected) {
                              const newIds = selectedEmployeeIds.filter(id => id !== employeeId);
                              console.log('Removing employee, new IDs:', newIds);
                              setSelectedEmployeeIds(newIds);
                              // Remove individual hours
                              const { [employeeId]: removed, ...remainingHours } = employeeHours;
                              setEmployeeHours(remainingHours);
                            } else {
                              const newIds = [...selectedEmployeeIds, employeeId];
                              console.log('Adding employee, new IDs:', newIds);
                              setSelectedEmployeeIds(newIds);
                              // Add default hours if not set
                              if (!employeeHours[employeeId]) {
                                setEmployeeHours(prev => ({ ...prev, [employeeId]: defaultHours }));
                              }
                            }
                            
                            // Keep dropdown open for easier multi-selection
                            // Don't close the dropdown automatically
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



          {/* Action buttons */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={() => createAssignmentsMutation.mutate()}
              disabled={createAssignmentsMutation.isPending || (selectedEmployeeIds.length === 0 && (selectedSuperintendentId === null || selectedSuperintendentId === "none"))}
            >
              {createAssignmentsMutation.isPending ? "Saving..." : "Save Assignments"}
            </Button>
          </div>
          
          {/* White space div to balance modal spacing */}
          <div className="h-32 mt-[59px] mb-[59px]"></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}