import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Package, Mail, Lock, User, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signupSchema = loginSchema.extend({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
});

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const { signIn, signUp, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const validateForm = () => {
    setErrors({});
    try {
      if (isLogin) {
        loginSchema.parse({ email, password });
      } else {
        signupSchema.parse({ email, password, fullName });
      }
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        err.errors.forEach((e) => {
          if (e.path[0]) {
            newErrors[e.path[0].toString()] = e.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast({
              title: 'Login Failed',
              description: 'Invalid email or password. Please try again.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Error',
              description: error.message,
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: 'Welcome back!',
            description: 'Successfully signed in.',
          });
          navigate('/dashboard');
        }
      } else {
        const { error } = await signUp(email, password, fullName);
        if (error) {
          if (error.message.includes('already registered')) {
            toast({
              title: 'Account Exists',
              description: 'This email is already registered. Please sign in instead.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Error',
              description: error.message,
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: 'Account Created!',
            description: 'Welcome to StockFlow. The first user becomes admin.',
          });
          navigate('/dashboard');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar text-sidebar-foreground flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary">
              <Package className="h-6 w-6 text-sidebar-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">StockFlow</h1>
          </div>
        </div>
        
        <div className="space-y-6">
          <h2 className="text-4xl font-bold leading-tight">
            Manage your inventory<br />
            with confidence
          </h2>
          <p className="text-lg text-sidebar-foreground/70 max-w-md">
            Streamline your stock management, track deliveries in real-time, 
            and import data effortlessly from Excel files.
          </p>
          <div className="flex gap-8 pt-6">
            <div>
              <p className="text-3xl font-bold">10k+</p>
              <p className="text-sm text-sidebar-foreground/60">Items tracked</p>
            </div>
            <div>
              <p className="text-3xl font-bold">99.9%</p>
              <p className="text-sm text-sidebar-foreground/60">Uptime</p>
            </div>
            <div>
              <p className="text-3xl font-bold">24/7</p>
              <p className="text-sm text-sidebar-foreground/60">Support</p>
            </div>
          </div>
        </div>
        
        <p className="text-sm text-sidebar-foreground/50">
          © 2024 StockFlow. All rights reserved.
        </p>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <Package className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">StockFlow</h1>
          </div>

          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-bold text-foreground">
              {isLogin ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {isLogin 
                ? 'Enter your credentials to access your account' 
                : 'Start managing your inventory today'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {errors.fullName && (
                  <p className="text-sm text-destructive">{errors.fullName}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                />
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full h-11 gap-2"
              disabled={loading}
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <>
                  {isLogin ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {isLogin ? "Don't have an account?" : 'Already have an account?'}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setErrors({});
                }}
                className="ml-1 font-medium text-primary hover:underline"
              >
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Note: The first user to sign up automatically becomes an Admin.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
