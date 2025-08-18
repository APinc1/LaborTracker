import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface ForemanSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectForeman: (foremanId: number) => void;
  assignedForemen: any[];
  allForemen: any[];
  selectionType: 'overall' | 'responsible';
  taskName: string;
}

export function ForemanSelectionModal({
  isOpen,
  onClose,
  onSelectForeman,
  assignedForemen,
  allForemen,
  selectionType,
  taskName
}: ForemanSelectionModalProps) {
  const [selectedForemanId, setSelectedForemanId] = useState<string>('');

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedForemanId('');
    }
  }, [isOpen]);

  const handleSubmit = () => {
    if (selectedForemanId) {
      onSelectForeman(parseInt(selectedForemanId));
      onClose();
    }
  };

  const getTitle = () => {
    switch (selectionType) {
      case 'overall':
        return 'Select Overall Foreman';
      case 'responsible':
        return 'Select Responsible Foreman';
      default:
        return 'Select Foreman';
    }
  };

  const getDescription = () => {
    switch (selectionType) {
      case 'overall':
        return `Multiple foremen are assigned to "${taskName}". Please select which foreman should be designated as the Overall Foreman.`;
      case 'responsible':
        return `No foremen are assigned to "${taskName}". Please select which foreman should be responsible for this task (they will not be assigned to work on it).`;
      default:
        return 'Please select a foreman.';
    }
  };

  const foremanList = selectionType === 'overall' ? assignedForemen : allForemen;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>
            {getDescription()}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={selectedForemanId} onValueChange={setSelectedForemanId}>
          <div className="space-y-2">
            {foremanList.map((foreman) => (
              <div key={foreman.id} className="flex items-center space-x-2">
                <RadioGroupItem value={foreman.id.toString()} id={`foreman-${foreman.id}`} />
                <Label 
                  htmlFor={`foreman-${foreman.id}`} 
                  className="flex-1 cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{foreman.name}</span>
                    <span className="text-sm text-gray-500">ID: {foreman.teamMemberId}</span>
                  </div>
                </Label>
              </div>
            ))}
          </div>
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedForemanId}>
            Select Foreman
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}