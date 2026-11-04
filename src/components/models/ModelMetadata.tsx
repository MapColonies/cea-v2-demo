import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calendar, Ruler, Target, FileText, CheckCircle, XCircle, Layers, Clock, User, ArrowDownUp } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';

type Model = Database['public']['Tables']['models']['Row'];

interface ModelMetadataProps {
  model: Model;
  embedded?: boolean;
}

export function ModelMetadata({ model, embedded = false }: ModelMetadataProps) {
  const isMobile = useIsMobile();

  // Calculate area coverage (approximate in km²)
  const latDiff = Math.abs(Number(model.bbox_north) - Number(model.bbox_south));
  const lngDiff = Math.abs(Number(model.bbox_east) - Number(model.bbox_west));
  const areaCoverage = (latDiff * 111 * lngDiff * 111 * Math.cos((Number(model.bbox_north) + Number(model.bbox_south)) / 2 * Math.PI / 180)).toFixed(2);

  return (
    <Card dir="rtl" className={embedded ? 'border-0 rounded-none shadow-none' : undefined}>
      <CardHeader className="pb-3 px-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{model.name}</CardTitle>
          <Badge
            variant={model.is_approved_for_coordinates ? 'default' : 'secondary'}
            className="text-xs shrink-0"
          >
            {model.is_approved_for_coordinates ? (
              <>
                <CheckCircle className="w-3 h-3 ml-1" />
                מאושר
              </>
            ) : (
              <>
                <XCircle className="w-3 h-3 ml-1" />
                {model.is_rejected ? 'לא מאושר' : 'לא נבדק'}
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-3">
        {model.description && (
          <p className="text-sm text-muted-foreground">{model.description}</p>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {model.resolution && (
            <div className="flex items-center gap-2 text-sm">
              <Ruler className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">רזולוציה:</span>
              <span>{model.resolution} מ'</span>
            </div>
          )}

          {model.accuracy && (
            <div className="flex items-center gap-2 text-sm">
              <Target className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">דיוק אופקי:</span>
              <span>{model.accuracy} מ'</span>
            </div>
          )}

          {model.vertical_accuracy && (
            <div className="flex items-center gap-2 text-sm">
              <ArrowDownUp className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">דיוק אנכי:</span>
              <span>{model.vertical_accuracy} מ'</span>
            </div>
          )}

          {model.capture_date && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">תאריך צילום:</span>
              <span>{format(new Date(model.capture_date), 'dd/MM/yyyy', { locale: he })}</span>
            </div>
          )}

          {model.source && (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">מקור:</span>
              <span className="truncate">{model.source}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-sm">
            <Layers className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">שטח כיסוי:</span>
            <span>{areaCoverage} קמ"ר</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">עדכון אחרון:</span>
            <span>{format(new Date(model.updated_at), 'dd/MM/yyyy', { locale: he })}</span>
          </div>
        </div>

        {model.approved_at && (
          <>
            <Separator />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <User className="w-3 h-3" />
              <span>אושר בתאריך: {format(new Date(model.approved_at), 'dd/MM/yyyy HH:mm', { locale: he })}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
