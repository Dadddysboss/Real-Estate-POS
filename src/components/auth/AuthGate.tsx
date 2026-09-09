import React, { useState } from 'react';
import { Lock, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { verifyCredentials } from '../../services/auth.service';

interface AuthGateProps {
  onSuccess: (userData: { token: string; user: any }) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const result = await verifyCredentials(username, password);
      if (result.success && result.data) {
        onSuccess(result.data);
      } else {
        const msg = result.error || '';
        if (msg.includes('Empty response') || msg.includes('Turso') || msg.includes('network') || msg.includes('fetch')) {
          setError('Unable to connect to server. Please try again.');
        } else {
          setError(msg || 'Invalid username or password');
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('Empty response') || msg.includes('Turso') || msg.includes('network') || msg.includes('fetch')) {
        setError('Unable to connect to server. Please try again.');
      } else {
        setError(msg || 'Authentication failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="modal-overlay animate-in fade-in-0 duration-200">
        <div className="bg-white/10 dark:bg-slate-900/40 backdrop-blur-2xl border border-white/20 dark:border-slate-800/60 shadow-[0_8px_32px_0_rgba(0,0,0,0.12)] rounded-2xl p-8 max-w-md w-full mx-4">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-emerald-500/20 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShieldCheck size={32} className="text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Real Estate POS & DigiKhata ERP</h1>
            <p className="text-slate-400">Enter access credentials to unlock enterprise system</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-2">
                Username
              </label>
              <div className="relative">
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-400/60"
                  placeholder="Enter username"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  aria-autocomplete="none"
                  data-lpignore="true"
                />
                <Lock size={16} className="absolute right-3 top-3.5 text-slate-500" />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-400/60"
                  placeholder="Enter password"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  aria-autocomplete="none"
                  data-lpignore="true"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-slate-500 hover:text-slate-400"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                  Unlocking...
                </div>
              ) : (
                'Unlock System'
              )}
            </button>
          </form>


        </div>
      </div>
    </div>
  );
};