import { useState } from 'react';
import { AlertTriangle, ShieldCheck, Lock, ShieldAlert } from 'lucide-react';

const BYPASS_CODE = '2468';

const Maintenance = () => {
  const [showInput, setShowInput] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code === BYPASS_CODE) {
      localStorage.setItem('maintenance_bypass', 'true');
      window.location.reload();
    } else {
      setError(true);
      setCode('');
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#060b16] text-white flex flex-col items-center justify-center px-4 py-10">
      {/* Subtle grid / glow background */}
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.15),transparent_60%)]" />
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-[linear-gradient(rgba(59,130,246,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.06)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:linear-gradient(to_top,black,transparent)]" />
      </div>

      {/* Top corner badges */}
      <div className="absolute top-6 left-4 right-4 flex justify-between text-xs sm:text-sm">
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2">
          <ShieldAlert className="h-4 w-4 text-blue-400" />
          <div className="leading-tight">
            <p className="font-semibold text-blue-300">SYSTEM STATUS</p>
            <p className="font-semibold text-amber-400">MAINTENANCE MODE</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2">
          <Lock className="h-4 w-4 text-blue-300" />
          <div className="leading-tight text-right">
            <p className="font-semibold text-blue-300">SECURE CONNECTION</p>
            <p className="font-semibold text-emerald-400">ENCRYPTED</p>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-amber-400/70 bg-amber-400/5">
          <AlertTriangle className="h-12 w-12 text-amber-400" strokeWidth={2.5} />
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">SYSTEM</h1>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-amber-400 sm:text-5xl">
          TEMPORARILY UNAVAILABLE
        </h1>

        <div className="my-6 flex items-center gap-3 text-blue-400">
          <span className="h-px w-24 bg-blue-500/40" />
          <ShieldCheck className="h-5 w-5" />
          <span className="h-px w-24 bg-blue-500/40" />
        </div>

        <p className="max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
          This system is currently undergoing scheduled maintenance and security updates.
          Access is temporarily unavailable. Please check back later.
        </p>

        <div className="mt-8 w-full max-w-lg rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
          <p className="mb-4 text-sm font-semibold tracking-wide text-blue-300">MAINTENANCE IN PROGRESS</p>
          <div className="flex items-center gap-3">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-700/50">
              <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-blue-600 to-blue-400" />
            </div>
            <span className="text-lg font-bold text-blue-300">72%</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span>System check</span>
            <span className="text-blue-500">•</span>
            <span>Security updates</span>
            <span className="text-blue-500">•</span>
            <span>Performance optimization</span>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-2 text-slate-300">
          <ShieldCheck className="h-4 w-4 text-blue-400" />
          <span>Thank you for your patience and understanding.</span>
        </div>
        <p className="mt-1 text-sm text-blue-400">We're working to serve you better.</p>

        {/* Secret admin bypass */}
        {showInput ? (
          <form onSubmit={handleSubmit} className="mt-6 flex items-center gap-2">
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(false); }}
              placeholder="Access code"
              className={`rounded-lg border bg-slate-800/60 px-3 py-2 text-center text-white outline-none ${error ? 'border-red-500' : 'border-blue-500/30'}`}
            />
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Enter
            </button>
          </form>
        ) : (
          <button
            onClick={() => setShowInput(true)}
            aria-label="admin access"
            className="mt-6 h-6 w-6 rounded-full opacity-20 hover:opacity-40"
          >
            <Lock className="h-4 w-4 text-blue-400" />
          </button>
        )}
      </div>
    </div>
  );
};

export default Maintenance;