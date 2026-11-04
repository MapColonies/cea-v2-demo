import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { History, User, Calendar, FileText } from 'lucide-react';

interface ApprovalLog {
  id: string;
  approved_at: string;
  approved_by: string;
  notes: string | null;
  approver_name?: string;
}

interface ApprovalHistoryProps {
  modelId: string;
  embedded?: boolean;
}

export function ApprovalHistory({ modelId, embedded = false }: ApprovalHistoryProps) {
  const [logs, setLogs] = useState<ApprovalLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      
      // Fetch approval logs
      const { data: logsData, error: logsError } = await supabase
        .from('model_approval_logs')
        .select('*')
        .eq('model_id', modelId)
        .order('approved_at', { ascending: false });

      if (logsError) {
        console.error('Error fetching approval logs:', logsError);
        setLoading(false);
        return;
      }

      if (!logsData || logsData.length === 0) {
        setLogs([]);
        setLoading(false);
        return;
      }

      // Fetch profiles for approvers
      const approverIds = [...new Set(logsData.map(log => log.approved_by))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('user_id, display_name, username')
        .in('user_id', approverIds);

      const profilesMap = new Map(
        profilesData?.map(p => [p.user_id, p.display_name || p.username || 'משתמש לא ידוע']) || []
      );

      const logsWithNames = logsData.map(log => ({
        ...log,
        approver_name: profilesMap.get(log.approved_by) || 'משתמש לא ידוע'
      }));

      setLogs(logsWithNames);
      setLoading(false);
    };

    fetchLogs();
  }, [modelId]);

  const content = (
    <>
      {logs.length === 0 ? (
        <div className="text-center text-muted-foreground py-6 text-sm">
          <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
          אין היסטוריית אישורים למודל זה
        </div>
      ) : (
        <ScrollArea className="max-h-[200px]">
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="border border-border rounded-lg p-3 bg-muted/30"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-3.5 h-3.5 text-primary" />
                    <span className="font-medium">{log.approver_name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {new Date(log.approved_at).toLocaleDateString('he-IL', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
                {log.notes && (
                  <div className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                    <FileText className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>{log.notes}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </>
  );

  if (loading) {
    return embedded ? (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    ) : (
      <Card dir="rtl">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <History className="w-4 h-4" />
            היסטוריית אישורים
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="space-y-3">
            {[1, 2].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (embedded) {
    return <div dir="rtl">{content}</div>;
  }

  return (

    <Card dir="rtl">
      <CardHeader className="pb-3 px-3 sm:px-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <History className="w-4 h-4" />
            היסטוריית אישורים
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {logs.length} רשומות
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        {content}
      </CardContent>
    </Card>
  );
}
