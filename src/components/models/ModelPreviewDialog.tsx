import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { DemoSurfaceView } from '@/components/map/DemoSurfaceView';
import { ModelMetadata } from './ModelMetadata';
import type { Model, Subtile } from '@/lib/cea/rules';

const noSubtiles: Subtile[] = [];
const noReferences: Model[] = [];
const approved = (tile: Subtile) => tile.is_approved_for_coordinates;
const readOnly = () => {};

interface ModelPreviewDialogProps {
  model: Model | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue?: (model: Model) => void;
}

export function ModelPreviewDialog({ model, open, onOpenChange, onContinue }: ModelPreviewDialogProps) {
  if (!model) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[100dvh] w-screen max-w-none gap-0 overflow-hidden rounded-none p-0 sm:rounded-none"
        dir="rtl"
      >
        <DialogHeader className="absolute inset-x-0 top-0 z-10 h-20 border-b bg-background px-12 py-3 text-right sm:text-right">
          <div className="flex h-full min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate text-lg">{model.name}</DialogTitle>
              <DialogDescription className="sr-only">תצוגת מודל לקריאה בלבד</DialogDescription>
              <Badge variant="outline" className="mt-1 text-warning">דמו — משטח וגובה מדומים</Badge>
            </div>
            {onContinue && (
              <Button className="shrink-0" onClick={() => onContinue(model)}>
                <span className="hidden sm:inline">המשך לבחירת פוליגונים</span>
                <span className="sm:hidden">הבא</span>
                <ArrowLeft className="mr-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogHeader>
        <div className="absolute inset-x-0 bottom-0 top-20 isolate z-0">
          <DemoSurfaceView
            model={model}
            subtiles={noSubtiles}
            referenceModels={noReferences}
            referenceSubtiles={noSubtiles}
            effectiveApproved={approved}
            onToggle={readOnly}
            target={null}
          />
        </div>
        <aside
          aria-label="מידע נלווה למודל"
          className="absolute bottom-3 right-3 z-10 h-[33.333333dvh] w-[420px] max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-md border bg-card text-card-foreground"
        >
          <ModelMetadata model={model} embedded />
        </aside>
      </DialogContent>
    </Dialog>
  );
}
