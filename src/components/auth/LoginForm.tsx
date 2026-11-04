import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { lovable } from '@/integrations/lovable/index';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, MapPin, Zap } from 'lucide-react';

export function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signInWithUsername, signUp, quickSignIn } = useAuth();

  const handleGoogleLogin = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: window.location.origin,
        extraParams: { prompt: 'select_account' },
      });
      if (result.error) setError('הכניסה עם Google נכשלה. נסה שוב.');
    } catch {
      setError('הכניסה עם Google נכשלה. נסה שוב.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleQuickLogin = async () => {
    setError(null);
    setQuickLoading(true);
    try {
      const { error } = await quickSignIn();
      if (error) setError('לא ניתן להיכנס כרגע. נסה שנית.');
    } catch {
      setError('לא ניתן להיכנס כרגע. נסה שנית.');
    } finally {
      setQuickLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let result;
      if (isSignUp) {
        // Generate automatic email from username
        const autoEmail = `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@app.local`;
        result = await signUp(username, autoEmail, password);
      } else {
        result = await signInWithUsername(username, password);
      }
      
      if (result.error) {
        setError(result.error.message);
      }
    } catch (err) {
      setError('שגיאה בהתחברות. נסה שנית.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
      <Card className="w-full max-w-md shadow-lg border-border">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-14 h-14 sm:w-16 sm:h-16 bg-primary rounded-full flex items-center justify-center">
            <MapPin className="w-7 h-7 sm:w-8 sm:h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl sm:text-2xl font-bold">מערכת ניהול מודלים</CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {isSignUp ? 'צור חשבון חדש' : 'התחבר למערכת לניהול ואישור מודלים תלת-מימדיים'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Button type="button" variant="outline" className="w-full h-11 gap-2" onClick={handleGoogleLogin} disabled={googleLoading || loading || quickLoading}>
              {googleLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              כניסה עם Google
            </Button>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="username">שם משתמש</Label>
              <Input
                id="username"
                type="text"
                placeholder="הזן שם משתמש"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                dir="ltr"
                className="h-11"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">סיסמה</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                dir="ltr"
                className="h-11"
              />
            </div>
            
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  מתחבר...
                </>
              ) : (
                isSignUp ? 'הרשמה' : 'התחברות'
              )}
            </Button>
            
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-2 text-xs text-muted-foreground">או</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full h-11 gap-2"
              disabled={quickLoading || loading}
              onClick={handleQuickLogin}
            >
              {quickLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              כניסה מהירה (ללא סיסמה)
            </Button>

            <div className="text-center text-sm text-muted-foreground">
              {isSignUp ? 'כבר יש לך חשבון?' : 'אין לך חשבון?'}{' '}
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-primary hover:underline font-medium"
              >
                {isSignUp ? 'התחבר' : 'הירשם'}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
