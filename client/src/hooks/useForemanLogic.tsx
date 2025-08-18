import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface ForemanDisplayInfo {
  id: number;
  name: string;
  displayText: string;
  isBold: boolean;
}

interface UseForemanLogicProps {
  task: any;
  assignments: any[];
  employees: any[];
  onTaskUpdate?: () => void;
}

export function useForemanLogic({ task, assignments, employees, onTaskUpdate }: UseForemanLogicProps) {
  const [showForemanModal, setShowForemanModal] = useState(false);
  const [foremanSelectionType, setForemanSelectionType] = useState<'overall' | 'responsible'>('overall');
  
  const queryClient = useQueryClient();

  // Static calculations without useEffect to prevent loops
  const allForemen = employees.filter(emp => emp.isForeman === true);
  
  const taskAssignments = assignments.filter(assignment => 
    assignment.taskId === task.id || assignment.taskId === task.taskId
  );
  
  const assignedForemenIds = taskAssignments
    .map(assignment => assignment.employeeId)
    .filter((id, index, array) => array.indexOf(id) === index); // Remove duplicates
  
  const assignedForemen = allForemen.filter(foreman => 
    assignedForemenIds.includes(foreman.id)
  );

  // Calculate foreman display (no state updates here)
  const foremanDisplay = useMemo(() => {
    // If task already has a foremanId set, use that
    if (task.foremanId) {
      const currentForeman = allForemen.find(f => f.id === task.foremanId);
      if (currentForeman) {
        const assignedCount = assignedForemen.length;
        let displayText = '';
        
        if (assignedCount === 0) {
          displayText = '(Responsible Foreman)';
        } else if (assignedCount === 1) {
          displayText = '(Foreman)';
        } else {
          displayText = '(Overall Foreman)';
        }
        
        return {
          id: currentForeman.id,
          name: currentForeman.name,
          displayText,
          isBold: assignedCount > 0 // Bold if actually assigned
        };
      }
    }

    // Single foreman case
    if (assignedForemen.length === 1) {
      const foreman = assignedForemen[0];
      return {
        id: foreman.id,
        name: foreman.name,
        displayText: '(Foreman)',
        isBold: true
      };
    }

    return null;
  }, [task.foremanId, assignedForemen, allForemen]);

  // Mutation to update task foreman
  const updateTaskForemanMutation = useMutation({
    mutationFn: async ({ taskId, foremanId }: { taskId: number; foremanId: number }) => {
      return apiRequest(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ foremanId })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      onTaskUpdate?.();
    }
  });

  // Function to trigger foreman selection
  const triggerForemanSelection = () => {
    if (assignedForemen.length >= 2) {
      setForemanSelectionType('overall');
      setShowForemanModal(true);
    } else if (assignedForemen.length === 0) {
      setForemanSelectionType('responsible');
      setShowForemanModal(true);
    }
    // Single foreman case is handled automatically
  };

  // Auto-trigger foreman selection when conditions are met
  useEffect(() => {
    console.log('🔍 FOREMAN AUTO-TRIGGER CHECK:', {
      taskName: task.name,
      taskHasForeman: !!task.foremanId,
      assignedForemenCount: assignedForemen.length,
      assignedForemen: assignedForemen.map(f => f.name),
      shouldTrigger: assignedForemen.length >= 2 && !task.foremanId
    });
    
    // Only auto-trigger if task doesn't already have a foreman set
    if (!task.foremanId && assignedForemen.length >= 2) {
      console.log('🔍 AUTO-TRIGGERING: Overall Foreman selection for', task.name);
      setForemanSelectionType('overall');
      setShowForemanModal(true);
    }
  }, [assignedForemen.length, task.foremanId, task.name, assignedForemen]);

  // Handle foreman selection from modal
  const handleForemanSelection = (foremanId: number) => {
    updateTaskForemanMutation.mutate({ 
      taskId: task.id, 
      foremanId 
    });
    setShowForemanModal(false);
  };

  return {
    foremanDisplay,
    showForemanModal,
    setShowForemanModal,
    foremanSelectionType,
    assignedForemen,
    allForemen,
    triggerForemanSelection,
    handleForemanSelection,
    needsForemanSelection: assignedForemen.length >= 2 || (assignedForemen.length === 0 && !task.foremanId)
  };
}