import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { loginFn, getSessionFn } from '../lib/auth-rpc';

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    try {
      const session = await getSessionFn();
      if (session) {
        throw redirect({ to: '/' });
      }
    } catch (err) {
      // If it's a redirect, re-throw it
      if (err && typeof err === 'object' && 'to' in err) throw err;
      // Otherwise (DB error), just show the login page
    }
  },
  component: LoginScreen,
});

function LoginScreen() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const doLogin = async (pinValue: string) => {
    setError('');
    setLoading(true);
    try {
      const result = await loginFn({ data: { pin: pinValue } });
      if (result.success) {
        await router.invalidate();
        router.navigate({ to: '/' });
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('ECONNREFUSED') || msg.includes('Failed query') || msg.includes('connection')) {
        setError('Cannot connect to database. Please ensure PostgreSQL is running.');
      } else if (msg.includes('Invalid PIN') || msg.includes('invalid')) {
        setError('Invalid PIN. Please try again.');
      } else {
        setError(msg || 'Login failed. Please try again.');
      }
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const addNumber = (num: string) => {
    setPin(prev => (prev.length >= 4 ? prev : prev + num));
  };

  useEffect(() => {
    if (pin.length === 4) {
      const timer = setTimeout(() => doLogin(pin), 80);
      return () => clearTimeout(timer);
    }
  }, [pin]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length === 4) await doLogin(pin);
  };

  // Keyboard support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        setPin(prev => (prev.length >= 4 ? prev : prev + e.key));
      } else if (e.key === 'Backspace') {
        setPin(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        setPin(prev => {
          if (prev.length === 4) {
             // Let the other useEffect handle the auto-login, or do it manually here.
             // It's already handled by the pin.length === 4 effect.
          }
          return prev;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100 dark:bg-gray-900">
      <Card className="w-[350px]">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">POS Login</CardTitle>
          <CardDescription>Enter your 4-digit PIN</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="text-center mb-4">
              <Input
                type="password"
                value={pin}
                readOnly
                className="text-center text-2xl tracking-widest"
                placeholder="****"
              />
            </div>
            
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <Button key={num} type="button" variant="outline" className="h-14 text-xl" onClick={() => addNumber(num.toString())}>
                  {num}
                </Button>
              ))}
              <Button type="button" variant="outline" className="h-14 text-xl text-red-500" onClick={() => setPin('')}>
                C
              </Button>
              <Button type="button" variant="outline" className="h-14 text-xl" onClick={() => addNumber('0')}>
                0
              </Button>
              <Button type="submit" variant="default" className="h-14 text-xl bg-blue-600 hover:bg-blue-700" disabled={loading || pin.length === 0}>
                {loading ? '…' : '↵'}
              </Button>
            </div>
            
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
