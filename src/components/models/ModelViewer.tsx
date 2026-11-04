import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ModelMetadata } from './ModelMetadata';
import { ModelMap } from '@/components/map/ModelMap';
import { ApprovalHistory } from './ApprovalHistory';
import { 
  CheckCircle, 
  XCircle, 
  MapPin, 
  Info, 
  History,
  Search,
  FileText,
  Shield,
  User,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Loader2
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type Model = Database['public']['Tables']['models']['Row'];

interface ModelViewerProps {
  model: Model | null;
  onModelUpdated: () => void;
  onBackToSearch?: () => void;
}

type WizardStep = 'details' | 'confirm' | 'auth';

// Unified step indicator for the entire flow
const allSteps = [
  { key: 'search', label: 'חיפוש מודל', icon: <Search className="w-4 h-4" /> },
  { key: 'details', label: 'פרטי מודל', icon: <FileText className="w-4 h-4" /> },
  { key: 'confirm', label: 'פרטי מבצע', icon: <Shield className="w-4 h-4" /> },
  { key: 'auth', label: 'אימות זהות', icon: <User className="w-4 h-4" /> },
];

export function ModelViewer({ model, onModelUpdated, onBackToSearch }: ModelViewerProps) {
  const [wizardStep, setWizardStep] = useState<WizardStep>('details');
  const [password, setPassword] = useState('');
  const [approverName, setApproverName] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const { user, verifyPassword, isAdmin } = useAuth();

  const isApproval = model ? !model.is_approved_for_coordinates : true;

  const handleWizardComplete = () => {
    setWizardStep('details');
    setPassword('');
    setApproverName('');
    setNotes('');
    setError('');
    setHistoryKey(prev => prev + 1);
    onModelUpdated();
    // Return to model selection screen after completion
    if (onBackToSearch) {
      onBackToSearch();
    }
  };

  const getCurrentStepIndex = () => {
    const stepMap: Record<WizardStep, number> = { details: 1, confirm: 2, auth: 3 };
    return stepMap[wizardStep];
  };

  const handlePasswordSubmit = async () => {
    if (!model) return;
    setError('');
    setLoading(true);
    
    const currentUserId = user?.id;
    
    if (!currentUserId) {
      setError('משתמש לא מחובר');
      setLoading(false);
      return;
    }
    
    try {
      const isValid = await verifyPassword(password);
      if (!isValid) {
        setError('סיסמה שגויה');
        setLoading(false);
        return;
      }
      
      await performAction(currentUserId);
    } catch (err) {
      console.error('Password verification error:', err);
      setError('שגיאה באימות הסיסמה');
      setLoading(false);
    }
  };

  const performAction = async (userId: string) => {
    if (!model) return;
    try {
      if (isApproval) {
        const { error: updateError } = await supabase
          .from('models')
          .update({
            is_approved_for_coordinates: true,
            approved_by: userId,
            approved_at: new Date().toISOString(),
          })
          .eq('id', model.id);

        if (updateError) throw updateError;

        const { error: logError } = await supabase
          .from('model_approval_logs')
          .insert({
            model_id: model.id,
            approved_by: userId,
            notes: `[אושר ע״י ${approverName}] ${notes}`.trim(),
          });

        if (logError) console.error('Error logging approval:', logError);

        toast.success('המודל אושר בהצלחה לחילוץ נ.צ');
      } else {
        const { error: updateError } = await supabase
          .from('models')
          .update({
            is_approved_for_coordinates: false,
            approved_by: null,
            approved_at: null,
          })
          .eq('id', model.id);

        if (updateError) throw updateError;

        const { error: logError } = await supabase
          .from('model_approval_logs')
          .insert({
            model_id: model.id,
            approved_by: userId,
            notes: `[ביטול אישור ע״י ${approverName}] ${notes}`.trim(),
          });

        if (logError) console.error('Error logging revocation:', logError);

        toast.success('אישור המודל בוטל');
      }

      handleWizardComplete();
    } catch (err) {
      console.error('Error performing action:', err);
      toast.error('שגיאה בביצוע הפעולה');
      setLoading(false);
    }
  };

  const renderStepIndicator = () => {
    const currentIndex = getCurrentStepIndex();
    return (
      <div className="flex items-center justify-center gap-2 mb-4">
        {allSteps.map((step, index) => (
          <div key={step.key} className="flex items-center">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${
                index < currentIndex
                  ? 'bg-primary border-primary text-primary-foreground'
                  : index === currentIndex
                  ? 'border-primary text-primary bg-primary/10'
                  : 'border-muted-foreground/30 text-muted-foreground'
              }`}
            >
              {index < currentIndex ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                step.icon
              )}
            </div>
            {index < allSteps.length - 1 && (
              <div
                className={`w-6 h-0.5 mx-1 ${
                  index < currentIndex ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  };

  // Show placeholder when no model is selected
  if (!model) {
    return (
      <div className="h-full flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md text-center">
          <CardContent className="pt-6">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Info className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">בחר מודל לצפייה</h3>
            <p className="text-muted-foreground text-sm">
              בחר מודל מהרשימה בצד ימין כדי לצפות בפרטיו ולבצע פעולות אישור
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canProceed = () => {
    switch (wizardStep) {
      case 'details':
        return true;
      case 'confirm':
        return approverName.trim().length > 0;
      case 'auth':
        return password.length > 0;
      default:
        return false;
    }
  };

  // Render content for each wizard step (right side panel content)
  const renderRightPanelContent = () => {
    if (wizardStep === 'details') {
      return (
        <div className="h-full flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-primary" />
            <h3 className="font-medium text-sm">היסטוריית אישורים</h3>
          </div>
          <div className="flex-1 overflow-auto">
            <ApprovalHistory key={historyKey} modelId={model.id} embedded />
          </div>
        </div>
      );
    }

    if (wizardStep === 'confirm') {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="font-medium text-sm">פרטי מבצע</h3>
          </div>
          
          <Alert className={isApproval 
            ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800' 
            : 'border-destructive bg-destructive/10 text-destructive'
          }>
            <AlertTriangle className={`h-4 w-4 ${isApproval ? 'text-emerald-600 dark:text-emerald-400' : ''}`} />
            <AlertDescription className={isApproval ? 'text-emerald-800 dark:text-emerald-200' : ''}>
              {isApproval
                ? 'אישור המודל יחשוף אותו לגורמים מבצעיים לחילוץ קואורדינטות.'
                : 'ביטול האישור יסיר את המודל מחשיפה לגורמים מבצעיים.'}
            </AlertDescription>
          </Alert>
          
          <div className="space-y-2">
            <Label htmlFor="approverName">שם מלא של המבצע *</Label>
            <Input
              id="approverName"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              placeholder="הזן את שמך המלא"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="notes">הערות (אופציונלי)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="הוסף הערות לתיעוד..."
              rows={3}
            />
          </div>
        </div>
      );
    }

    if (wizardStep === 'auth') {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-primary" />
            <h3 className="font-medium text-sm">אימות זהות</h3>
          </div>
          
          <p className="text-sm text-muted-foreground">
            לאבטחת המערכת, יש להזין את הסיסמה שנית לאימות זהותך
          </p>
          
          <div className="space-y-2">
            <Label htmlFor="password">סיסמה</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="הזן סיסמה"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && password) {
                  handlePasswordSubmit();
                }
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          
          <div className="bg-muted/50 rounded-lg p-3 text-sm">
            <p className="font-medium mb-1">סיכום הפעולה:</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• מודל: {model.name}</li>
              <li>• פעולה: {isApproval ? 'אישור לחילוץ נ.צ' : 'ביטול אישור'}</li>
              <li>• מבצע: {approverName}</li>
            </ul>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="h-full flex flex-col p-4" dir="rtl">
      {/* Step Indicator - Above everything */}
      <div className="flex-shrink-0 mb-4">
        {renderStepIndicator()}
      </div>

      {/* Model Name Header */}
      <div className="flex-shrink-0 mb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{model.name}</h2>
          <Badge 
            variant={model.is_approved_for_coordinates ? 'default' : 'secondary'}
            className="gap-1"
          >
            {model.is_approved_for_coordinates ? (
              <>
                <CheckCircle className="w-3 h-3" />
                מאושר לחילוץ נ.צ
              </>
            ) : (
              <>
                <XCircle className="w-3 h-3" />
                {model.is_rejected ? 'לא מאושר' : 'לא נבדק'}
              </>
            )}
          </Badge>
        </div>
      </div>

      {/* Top Half - Full Width Metadata */}
      <div className="flex-shrink-0 mb-4">
        <ModelMetadata model={model} />
      </div>

      {/* Bottom Half - Right Panel (right) and Map (left) */}
      <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
        {/* Right Side - Dynamic Content */}
        <Card className="flex flex-col min-h-0">
          <CardContent className="flex-1 p-4 overflow-auto">
            {renderRightPanelContent()}
          </CardContent>
        </Card>

        {/* Left Side - Map */}
        <Card className="flex flex-col min-h-0">
          <CardHeader className="py-2 px-4 flex-shrink-0">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              תיחום גאוגרפי
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-3 pt-0 min-h-0">
            <div className="h-full rounded-lg overflow-hidden border">
              <ModelMap model={model} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fixed Footer with Navigation/Action Buttons */}
      <div className="flex-shrink-0 flex justify-between items-center pt-4 border-t mt-4">
        <Button
          variant="outline"
          onClick={() => {
            if (wizardStep === 'confirm') {
              setWizardStep('details');
            } else if (wizardStep === 'auth') {
              setWizardStep('confirm');
            }
          }}
          disabled={loading || wizardStep === 'details'}
          className="gap-2"
        >
          <ArrowRight className="w-4 h-4" />
          חזור
        </Button>
        
        {wizardStep === 'details' && isAdmin && (
          <Button
            onClick={() => setWizardStep('confirm')}
            className={isApproval 
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 gap-2' 
              : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2'
            }
          >
            {isApproval ? (
              <>
                <CheckCircle className="w-4 h-4" />
                אשר מודל לחילוץ נ.צ
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4" />
                בטל אישור מודל
              </>
            )}
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        
        {wizardStep === 'confirm' && (
          <Button 
            onClick={() => setWizardStep('auth')} 
            disabled={!canProceed()}
            className={isApproval 
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 gap-2' 
              : 'gap-2'
            }
          >
            המשך
            <ArrowLeft className="w-4 h-4" />
          </Button>
        )}
        
        {wizardStep === 'auth' && (
          <Button
            onClick={handlePasswordSubmit}
            disabled={!canProceed() || loading}
            className={isApproval 
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 gap-2' 
              : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2'
            }
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isApproval ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            {loading ? 'מבצע...' : isApproval ? 'אשר מודל' : 'בטל אישור'}
          </Button>
        )}
      </div>
    </div>
  );
}
