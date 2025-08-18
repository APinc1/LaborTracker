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
  const [dismissedForTask, setDismissedForTask] = useState<string | null>(null);
  
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
    // Single foreman case is handled automatically in useEffect
  };

  // Automatically trigger foreman selection when conditions are met
  useEffect(() => {
    const taskKey = `${task.id}-${assignedForemen.length}`;
    
    // Only trigger if modal is not already showing, task doesn't have a foremanId, 
    // and this specific condition hasn't been dismissed for this task
    if (!showForemanModal && !task.foremanId && dismissedForTask !== taskKey) {
      if (assignedForemen.length >= 2) {
        console.log('🔍 FOREMAN LOGIC: Multiple foremen detected, triggering Overall Foreman selection', {
          assignedForemen: assignedForemen.map(f => f.name),
          taskName: task.name
        });
        setForemanSelectionType('overall');
        setShowForemanModal(true);
      } else if (assignedForemen.length === 0) {
        console.log('🔍 FOREMAN LOGIC: No foremen assigned, triggering Responsible Foreman selection', {
          taskName: task.name
        });
        setForemanSelectionType('responsible');
        setShowForemanModal(true);
      }
    }
  }, [assignedForemen.length, task.foremanId, task.id, task.name, showForemanModal, dismissedForTask]);

  // Handle foreman selection from modal
  const handleForemanSelection = (foremanId: number) => {
    updateTaskForemanMutation.mutate({ 
      taskId: task.id, 
      foremanId 
    });
    setShowForemanModal(false);
    setDismissedForTask(null); // Reset dismissed state when selection is made
  };

  // Handle modal dismiss/cancel
  const handleModalDismiss = () => {
    const taskKey = `${task.id}-${assignedForemen.length}`;
    setDismissedForTask(taskKey);
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
    handleModalDismiss,
    needsForemanSelection: assignedForemen.length >= 2 || (assignedForemen.length === 0 && !task.foremanId)
  };
}