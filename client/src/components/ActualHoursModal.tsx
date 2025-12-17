import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, Save, X, Check, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ActualHoursModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: any;
  assignments: any[];
  employees: any[];
  onUpdate?: () => void;
}

export default function ActualHoursModal({
  isOpen,
  onClose,
  task,
  assignments,
  employees,
  onUpdate
}: ActualHoursModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingHours, setEditingHours] = useState<Record<number, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const taskAssignments = assignments.filter(a => 
    a.taskId === task?.id && !a.isDriverHours
  );

  useEffect(() => {
    if (isOpen && taskAssignments.length > 0) {
      const initialHours: Record<number, string> = {};
      taskAssignments.forEach(a => {
        initialHours[a.id] = a.actualHours?.toString() || '';
      });
      setEditingHours(initialHours);
      setHasChanges(false);
    }
  }, [isOpen, task?.id]);

  const getEmployeeName = (employeeId: number) => {
    const employee = employees.find(e => e.id === employeeId);
    return employee?.name || `Employee ${employeeId}`;
  };

  const getEmployeeRole = (employeeId: number) => {
    const employee = employees.find(e => e.id === employeeId);
    return employee?.role || '';
  };

  const handleHoursChange = (assignmentId: number, value: string) => {
    setEditingHours(prev => ({ ...prev, [assignmentId]: value }));
    setHasChanges(true);
  };

  const saveActualHoursMutation = useMutation({
    mutationFn: async (updates: { id: number; actualHours: string }[]) => {
      const results = await Promise.all(
        updates.map(async update => {
          const response = await fetch(`/api/assignments/${update.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actualHours: update.actualHours })
          });
          if (!response.ok) throw new Error(`Failed to update assignment ${update.id}`);
          return response.json();
        })
      );
      return results;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Actual hours saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      setHasChanges(false);
      onUpdate?.();
      onClose();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save actual hours", variant: "destructive" });
    }
  });

  const handleSave = () => {
    const updates = Object.entries(editingHours)
      .filter(([id, hours]) => {
        const assignment = taskAssignments.find(a => a.id === parseInt(id));
        const originalHours = assignment?.actualHours?.toString() || '';
        return hours !== originalHours;
      })
      .map(([id, hours]) => ({
        id: parseInt(id),
        actualHours: hours
      }));

    if (updates.length > 0) {
      saveActualHoursMutation.mutate(updates);
    } else {
      onClose();
    }
  };

  const getStatusBadge = (assignment: any) => {
    const hours = parseFloat(editingHours[assignment.id] || '0');
    const assignedHours = parseFloat(assignment.assignedHours || '8');
    
    if (!editingHours[assignment.id] && editingHours[assignment.id] !== '0') {
      return <Badge variant="outline" className="text-gray-500">Pending</Badge>;
    }
    
    if (hours === assignedHours) {
      return <Badge className="bg-green-100 text-green-800">Optimal</Badge>;
    } else if (hours < assignedHours) {
      return <Badge className="bg-yellow-100 text-yellow-800">Under</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800">Over</Badge>;
    }
  };

  const totalScheduled = taskAssignments.reduce((sum, a) => sum + parseFloat(a.assignedHours || 0), 0);
  const totalActual = taskAssignments.reduce((sum, a) => {
    const hours = editingHours[a.id];
    return sum + (hours ? parseFloat(hours) : 0);
  }, 0);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Actual Hours - {task?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
            <div>
              <span className="font-medium">Task Date:</span> {task?.taskDate}
            </div>
            <div>
              <span className="font-medium">Cost Code:</span> {task?.costCode}
            </div>
          </div>

          {taskAssignments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p>No assignments found for this task</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Scheduled</TableHead>
                    <TableHead className="text-right">Actual Hours</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taskAssignments.map(assignment => (
                    <TableRow key={assignment.id}>
                      <TableCell className="font-medium">
                        {getEmployeeName(assignment.employeeId)}
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {getEmployeeRole(assignment.employeeId)}
                      </TableCell>
                      <TableCell className="text-right">
                        {parseFloat(assignment.assignedHours || 0).toFixed(1)}h
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          max="24"
                          value={editingHours[assignment.id] || ''}
                          onChange={(e) => handleHoursChange(assignment.id, e.target.value)}
                          className="w-20 text-right"
                          placeholder="0.0"
                          data-testid={`input-actual-hours-${assignment.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(assignment)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                <div className="text-sm">
                  <span className="font-medium">Total Scheduled:</span> {totalScheduled.toFixed(1)}h
                </div>
                <div className="text-sm">
                  <span className="font-medium">Total Actual:</span> {totalActual.toFixed(1)}h
                </div>
                <div className={`text-sm font-medium ${totalActual > totalScheduled ? 'text-red-600' : totalActual < totalScheduled ? 'text-yellow-600' : 'text-green-600'}`}>
                  {totalActual === totalScheduled ? (
                    <span className="flex items-center gap-1"><Check className="w-4 h-4" /> On Target</span>
                  ) : totalActual > totalScheduled ? (
                    <span>+{(totalActual - totalScheduled).toFixed(1)}h Over</span>
                  ) : (
                    <span>-{(totalScheduled - totalActual).toFixed(1)}h Under</span>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-hours">
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={!hasChanges || saveActualHoursMutation.isPending}
              data-testid="button-save-hours"
            >
              <Save className="w-4 h-4 mr-1" />
              {saveActualHoursMutation.isPending ? 'Saving...' : 'Save Hours'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
