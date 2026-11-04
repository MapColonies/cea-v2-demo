import { CheckCircle, Search, Grid3x3, Shield, KeyRound } from 'lucide-react';

export const flowSteps = [
  { key: 'search', label: 'חיפוש מודל', icon: <Search className="w-4 h-4" /> },
  { key: 'subtiles', label: 'תתי-אזורים ואישור', icon: <Grid3x3 className="w-4 h-4" /> },
  { key: 'performer', label: 'שם המאשר', icon: <Shield className="w-4 h-4" /> },
  { key: 'password', label: 'אימות מנהל', icon: <KeyRound className="w-4 h-4" /> },
];

interface FlowStepsProps {
  currentIndex: number;
}

export function FlowStepsIndicator({ currentIndex }: FlowStepsProps) {
  return (
    <div className="flex items-center justify-center gap-2" dir="rtl">
      {flowSteps.map((step, index) => (
        <div key={step.key} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${
                index < currentIndex
                  ? 'bg-primary border-primary text-primary-foreground'
                  : index === currentIndex
                  ? 'border-primary text-primary bg-primary/10'
                  : 'border-muted-foreground/30 text-muted-foreground'
              }`}
            >
              {index < currentIndex ? <CheckCircle className="w-4 h-4" /> : step.icon}
            </div>
            <span
              className={`hidden md:inline text-xs ${
                index === currentIndex ? 'text-primary font-medium' : 'text-muted-foreground'
              }`}
            >
              {step.label}
            </span>
          </div>
          {index < flowSteps.length - 1 && (
            <div
              className={`w-6 h-0.5 mx-2 ${
                index < currentIndex ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
