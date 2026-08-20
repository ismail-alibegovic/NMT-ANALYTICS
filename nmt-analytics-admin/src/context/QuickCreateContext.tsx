import { createContext, useContext, useState, type ReactNode } from "react";
import QuickCreateModal from "../components/common/QuickCreateModal";

type QuickCreateContextValue = {
  openQuickCreate: () => void;
};

const QuickCreateContext = createContext<QuickCreateContextValue | undefined>(undefined);

export function QuickCreateProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <QuickCreateContext.Provider value={{ openQuickCreate: () => setIsOpen(true) }}>
      {children}
      <QuickCreateModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </QuickCreateContext.Provider>
  );
}

export function useQuickCreate() {
  const context = useContext(QuickCreateContext);
  if (!context) throw new Error("useQuickCreate must be used inside QuickCreateProvider");
  return context;
}
