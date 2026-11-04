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
import { Loader2, ShieldAlert, AlertTriangle } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type Model = Database['public']['Tables']['models']['Row'];

interface RevokeApprovalDialogProps {
  model: Model;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRevoke: (notes: string) => Promise<void>;
}

export function RevokeApprovalDialog({ model, open, onOpenChange, onRevoke }: RevokeApprovalDialogProps) {
  const [password, setPassword] = useState('');
  const [revokerName, setRevokerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'password' | 'warning' | 'confirm'>('password');
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

  const handleRevoke = async () => {
    if (!revokerName.trim()) {
      setError('נא להזין שם מלא');
      return;
    }
    setLoading(true);
    try {
      await onRevoke(revokerName.trim());
      handleClose();
    } catch (err) {
      setError('שגיאה בביטול האישור');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('password');
    setPassword('');
    setRevokerName('');
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
                <ShieldAlert className="w-5 h-5" />
                אימות זהות
              </AlertDialogTitle>
              <AlertDialogDescription>
                לצורך ביטול אישור המודל, נא להזין את הסיסמה שלך לאימות
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="space-y-4 py-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="revoke-password">סיסמה</Label>
                <Input
                  id="revoke-password"
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
                  המודל לא יהיה מאושר לחילוץ נ.צ ולא יהיה חשוף לגורמים המבצעיים
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
                <ShieldAlert className="w-5 h-5" />
                ביטול אישור מודל
              </AlertDialogTitle>
              <AlertDialogDescription className="text-right space-y-3">
                <p className="font-semibold text-foreground">
                  אתה עומד לבטל את האישור של המודל "{model.name}".
                </p>
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm">
                  <p className="font-medium text-destructive">שים לב:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                    <li>לאחר הביטול, המודל לא יהיה זמין לחילוץ קואורדינטות</li>
                    <li>יש לאשר את המודל מחדש כדי להשתמש בו</li>
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
                <Label htmlFor="revoker-name">שם מלא של המבטל *</Label>
                <Input
                  id="revoker-name"
                  placeholder="הזן שם מלא..."
                  value={revokerName}
                  onChange={(e) => setRevokerName(e.target.value)}
                  maxLength={100}
                  autoFocus
                />
              </div>
            </div>
            
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <Button onClick={handleRevoke} disabled={loading} variant="destructive">
                {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
                בטל אישור
              </Button>
              <AlertDialogCancel>ביטול</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
