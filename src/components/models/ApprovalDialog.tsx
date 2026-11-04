import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type Model = Database['public']['Tables']['models']['Row'];

interface ApprovalDialogProps {
  model: Model;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (notes: string) => Promise<void>;
}

export function ApprovalDialog({ model, open, onOpenChange, onApprove }: ApprovalDialogProps) {
  const [step, setStep] = useState<'password' | 'warning' | 'confirm'>('password');
  const [password, setPassword] = useState('');
  const [approverName, setApproverName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { verifyPassword } = useAuth();

  const handlePasswordSubmit = async () => {
    if (!password) {
      setError('נא להזין סיסמה');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const isValid = await verifyPassword(password);
      if (isValid) {
        setStep('warning');
      } else {
        setError('סיסמה שגויה');
      }
    } catch (err) {
      setError('שגיאה באימות הסיסמה');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!approverName.trim()) {
      setError('נא להזין שם מלא');
      return;
    }
    setLoading(true);
    try {
      await onApprove(approverName.trim());
      handleClose();
    } catch (err) {
      setError('שגיאה באישור המודל');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('password');
    setPassword('');
    setApproverName('');
    setError(null);
    setLoading(false);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) handleClose();
    }}>
      <AlertDialogContent dir="rtl">
        {step === 'password' ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                אימות זהות
              </AlertDialogTitle>
              <AlertDialogDescription>
                לצורך אישור המודל לחילוץ נ.צ, נא להזין את הסיסמה שלך לאימות
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="space-y-4 py-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="verify-password">סיסמה</Label>
                <Input
                  id="verify-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                  dir="ltr"
                  autoFocus
                />
              </div>
            </div>
            
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <Button onClick={handlePasswordSubmit} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
                המשך
              </Button>
              <AlertDialogCancel>ביטול</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : step === 'warning' ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-warning">
                <AlertTriangle className="w-6 h-6" />
                שים לב!
              </AlertDialogTitle>
              <AlertDialogDescription className="text-center py-6">
                <p className="text-lg sm:text-xl font-bold text-warning bg-warning/10 border-2 border-warning/40 rounded-lg p-4">
                  המודל יאושר לחילוץ נ.צ ויהיה חשוף לגורמים המבצעיים
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter className="flex-row-reverse gap-2">
              <Button
                onClick={() => setStep('confirm')}
                className="bg-warning text-warning-foreground hover:bg-warning/90"
              >
                מאשר והמשך
              </Button>
              <AlertDialogCancel>ביטול</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                אזהרה - אישור סופי
              </AlertDialogTitle>
              <AlertDialogDescription className="text-right space-y-3">
                <p className="font-semibold text-foreground">
                  אתה עומד לאשר את המודל "{model.name}" לחילוץ נקודות ציון.
                </p>
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm">
                  <p className="font-medium text-destructive">שים לב:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                    <li>לאחר האישור, המודל יהיה זמין לחילוץ קואורדינטות</li>
                    <li>פעולה זו תתועד במערכת</li>
                    <li>האחריות על נכונות המודל היא על המאשר</li>
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-2 py-2">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="approver-name">שם מלא של המאשר *</Label>
                <Input
                  id="approver-name"
                  placeholder="הזן שם מלא..."
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                  maxLength={100}
                  autoFocus
                />
              </div>
            </div>
            
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <Button onClick={handleApprove} disabled={loading} variant="destructive">
                {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
                אני מאשר
              </Button>
              <AlertDialogCancel>ביטול</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
