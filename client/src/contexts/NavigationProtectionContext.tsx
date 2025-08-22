import { createContext, useContext, useState, ReactNode } from "react";
import { useLocation } from "wouter";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface NavigationProtectionContextType {
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  protectedNavigate: (path: string) => void;
  onSave?: () => Promise<void>;
  onCancel?: () => void;
  setNavigationHandlers: (handlers: { onSave: () => Promise<void>; onCancel: () => void }) => void;
}

const NavigationProtectionContext = createContext<NavigationProtectionContextType | undefined>(undefined);

export function NavigationProtectionProvider({ children }: { children: ReactNode }) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [onSave, setOnSave] = useState<(() => Promise<void>) | undefined>();
  const [onCancel, setOnCancel] = useState<(() => void) | undefined>();
  const [, setLocation] = useLocation();
  const [showNavigationDialog, setShowNavigationDialog] = useState(false);
  const [pendingPath, setPendingPath] = useState<string>('');
  const [dialogStep, setDialogStep] = useState<'save' | 'discard'>('save');

  const setNavigationHandlers = (handlers: { onSave: () => Promise<void>; onCancel: () => void }) => {
    setOnSave(() => handlers.onSave);
    setOnCancel(() => handlers.onCancel);
  };

  const protectedNavigate = (path: string) => {
    if (hasUnsavedChanges && onSave && onCancel) {
      setPendingPath(path);
      setDialogStep('save');
      setShowNavigationDialog(true);
    } else {
      // No unsaved changes, navigate normally
      setLocation(path);
    }
  };

  const handleSaveAndNavigate = () => {
    if (onSave && pendingPath) {
      onSave().then(() => {
        setLocation(pendingPath);
        setHasUnsavedChanges(false);
        setShowNavigationDialog(false);
        setPendingPath('');
      }).catch(() => {
        // Handle save error - keep dialog open
      });
    }
  };

  const handleDiscardAndNavigate = () => {
    if (onCancel && pendingPath) {
      onCancel();
      setLocation(pendingPath);
      setHasUnsavedChanges(false);
      setShowNavigationDialog(false);
      setPendingPath('');
    }
  };

  const handleCancel = () => {
    setShowNavigationDialog(false);
    setPendingPath('');
    setDialogStep('save');
  };

  const handleDontSave = () => {
    setDialogStep('discard');
  };

  return (
    <NavigationProtectionContext.Provider
      value={{
        hasUnsavedChanges,
        setHasUnsavedChanges,
        protectedNavigate,
        onSave,
        onCancel,
        setNavigationHandlers,
      }}
    >
      {children}
      
      {/* Navigation Protection Dialog */}
      <AlertDialog open={showNavigationDialog} onOpenChange={setShowNavigationDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialogStep === 'save' ? 'Save Changes?' : 'Discard Changes?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialogStep === 'save' 
                ? 'You have unsaved changes. Would you like to save them before leaving this page?'
                : 'Are you sure you want to discard your unsaved changes? This action cannot be undone.'
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {dialogStep === 'save' ? (
              <>
                <AlertDialogCancel onClick={handleCancel}>
                  Stay on Page
                </AlertDialogCancel>
                <Button variant="outline" onClick={handleDontSave}>
                  Don't Save
                </Button>
                <AlertDialogAction onClick={handleSaveAndNavigate}>
                  Save & Continue
                </AlertDialogAction>
              </>
            ) : (
              <>
                <AlertDialogCancel onClick={() => setDialogStep('save')}>
                  Go Back
                </AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleDiscardAndNavigate}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Discard Changes
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NavigationProtectionContext.Provider>
  );
}

export function useNavigationProtection() {
  const context = useContext(NavigationProtectionContext);
  if (context === undefined) {
    throw new Error('useNavigationProtection must be used within a NavigationProtectionProvider');
  }
  return context;
}