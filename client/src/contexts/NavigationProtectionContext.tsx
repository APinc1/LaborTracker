import { createContext, useContext, useState, ReactNode } from "react";
import { useLocation } from "wouter";

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

  const setNavigationHandlers = (handlers: { onSave: () => Promise<void>; onCancel: () => void }) => {
    setOnSave(() => handlers.onSave);
    setOnCancel(() => handlers.onCancel);
  };

  const protectedNavigate = (path: string) => {
    if (hasUnsavedChanges && onSave && onCancel) {
      const confirmed = window.confirm(
        'You have unsaved changes. Do you want to save before leaving this page?'
      );
      
      if (confirmed) {
        // Save changes then navigate
        onSave().then(() => {
          setLocation(path);
          setHasUnsavedChanges(false);
        }).catch(() => {
          // Handle save error
        });
      } else {
        // Ask if they want to discard changes
        const discard = window.confirm('Are you sure you want to discard your changes?');
        if (discard) {
          onCancel();
          setLocation(path);
          setHasUnsavedChanges(false);
        }
      }
    } else {
      // No unsaved changes, navigate normally
      setLocation(path);
    }
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