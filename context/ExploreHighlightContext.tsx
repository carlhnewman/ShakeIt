// context/ExploreHighlightContext.tsx
import React, { createContext, useContext, useState, ReactNode } from 'react';

type ExploreHighlightContextType = {
  showExploreHighlight: boolean;
  setShowExploreHighlight: (value: boolean) => void;
};

const ExploreHighlightContext = createContext<ExploreHighlightContextType | undefined>(undefined);

export const ExploreHighlightProvider = ({ children }: { children: ReactNode }) => {
  const [showExploreHighlight, setShowExploreHighlight] = useState(false);

  return (
    <ExploreHighlightContext.Provider value={{ showExploreHighlight, setShowExploreHighlight }}>
      {children}
    </ExploreHighlightContext.Provider>
  );
};

export const useExploreHighlight = () => {
  const context = useContext(ExploreHighlightContext);
  if (context === undefined) {
    throw new Error('useExploreHighlight must be used within an ExploreHighlightProvider');
  }
  return context;
};
