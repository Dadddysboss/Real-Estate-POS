# 6. Phase 1 Implementation Blueprint & Core Code Scaffolding
**Project Name:** Real Estate POS & DigiKhata ERP (Master Security & Enterprise Edition)
**Scope:** Phase 1 Scaffolding, Core SQLite/Turso Setup, Preload IPC Bridge, & Auth Gate Protocol
**Enforcement:** Production Readiness, Zero Implicit Any, 100% Parameterized Statements

---

## 1. Complete Project Directory Structure

Below is the required folder tree for the application. AI agents must initialize this structure before creating components.

```text
dripp-realestate-erp/
├── docs/
│   ├── 1_Master_Requirement_Specification.md
│   ├── 2_Technical_Stack_Specification.md
│   ├── 3_UI_UX_Design_System.md
│   ├── 4_Database_Schema.md
│   ├── 5_AI_Execution_Protocol.md
│   └── 6_Phase1_Scaffolding.md
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   └── ipc/
│       ├── auth.ipc.ts
│       ├── db.ipc.ts
│       └── print.ipc.ts
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── auth/
│   │   │   ├── AuthGate.tsx
│   │   │   └── PinPad.tsx
│   │   ├── common/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── SyncBadge.tsx
│   │   │   └── Modal.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       └── DataTable.tsx
│   ├── db/
│   │   ├── client.ts
│   │   ├── migrations.ts
│   │   └── seed.ts
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useDatabase.ts
│   │   └── useSync.ts
│   ├── layouts/
│   │   └── RootLayout.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Inventory.tsx
│   │   ├── Sales.tsx
│   │   ├── DigiKhata.tsx
│   │   └── Settings.tsx
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── sync.service.ts
│   │   └── thermal.service.ts
│   ├── types/
│   │   ├── electron.d.ts
│   │   ├── schema.ts
│   │   └── index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── .env.example
├── electron-builder.json
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
Core Project Configuration Files
package.json
{
  "name": "dripp-realestate-erp",
  "version": "1.0.0",
  "description": "Enterprise Real Estate POS & DigiKhata Dual-Sync ERP System",
  "main": "dist-electron/main.js",
  "author": "System Administrator",
  "license": "PROPRIETARY",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build && electron-builder",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@libsql/client": "^0.6.0",
    "bcryptjs": "^2.4.3",
    "clsx": "^2.1.0",
    "lucide-react": "^0.344.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "tailwind-merge": "^2.2.1"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^20.11.24",
    "@types/react": "^18.2.61",
    "@types/react-dom": "^18.2.19",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.18",
    "electron": "^29.1.0",
    "electron-builder": "^24.13.3",
    "postcss": "^8.4.35",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3",
    "vite": "^5.1.4",
    "vite-plugin-electron": "^0.28.2",
    "vite-plugin-electron-renderer": "^0.14.5"
  }
}
tsconfig.json
JSON
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noImplicitAny": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "electron"]
}
vite.config.ts
TypeScript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: 'electron/preload.ts',
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
tailwind.config.js
JavaScript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4',
          500: '#16a34a',
          900: '#064e3b',
        },
        dark: {
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
        },
      },
    },
  },
  plugins: [],
};
3. Electron Main Process & Preload Bridge
electron/preload.ts
TypeScript
import { contextBridge, ipcRenderer } from 'electron';

export interface DatabaseResponse<T unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

contextBridge.exposeInMainWorld('api', {
  // DB IPC Wrapper
  dbExecute: (sql: string, args: unknown[] = []): Promise<DatabaseResponse> => {
    return ipcRenderer.invoke('db:execute', { sql, args });
  },
  dbQuery: <T unknown>(sql: string, args: unknown[] = []): Promise<DatabaseResponse<T[]>> => {
    return ipcRenderer.invoke('db:query', { sql, args });
  },
  // Auth IPC Wrapper
  authenticate: (username: string, pin: string): Promise<DatabaseResponse<{ string; token: unknown user: }>> => {
    return ipcRenderer.invoke('auth:login', { username, pin });
  },
  // System Sync Listener
  onSyncStatusUpdate: (callback: (status: string) => void) => {
    ipcRenderer.on('sync:status-change', (_event, status) => callback(status));
  },
});
electron/main.ts
TypeScript
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { initializeLocalDatabase, executeQuery, selectQuery } from '../src/db/client';
import { verifyCredentials } from '../src/services/auth.service';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: 'Dripp Real Estate & DigiKhata ERP',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  await initializeLocalDatabase();

  // Register Database IPC Handlers
  ipcMain.handle('db:execute', async (_event, { sql, args }) => {
    try {
      const result = await executeQuery(sql, args);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('db:query', async (_event, { sql, args }) => {
    try {
      const rows = await selectQuery(sql, args);
      return { success: true, data: rows };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Register Auth IPC Handler (Enforces dripp / 5821 Gate)
  ipcMain.handle('auth:login', async (_event, { username, pin }) => {
    try {
      const authResult = await verifyCredentials(username, pin);
      return authResult;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
4. Database Layer & Migration Setup
src/db/client.ts
TypeScript
import { createClient, Client } from '@libsql/client';
import { runMigrations } from './migrations';
import { seedInitialData } from './seed';

let dbClient: Client | null = null;

export function getDbClient(): Client {
  if (!dbClient) {
    dbClient = createClient({
      url: process.env.TURSO_DATABASE_URL || 'file:dripp_erp_local.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return dbClient;
}

export async function executeQuery(sql: string, args: unknown[] = []) {
  const client = getDbClient();
  return await client.execute({ sql, args });
}

export async function selectQuery<T unknown>(sql: string, args: unknown[] = []): Promise<T[]> {
  const client = getDbClient();
  const res = await client.execute({ sql, args });
  return res.rows as unknown as T[];
}

export async function initializeLocalDatabase() {
  const client = getDbClient();
  console.log('[Database] Initializing local database tables...');
  await runMigrations(client);
  await seedInitialData(client);
  console.log('[Database] Local database initialized successfully.');
}
5. Security Auth Gate (dripp / 5821) Implementation
src/services/auth.service.ts
TypeScript
import bcrypt from 'bcryptjs';
import { selectQuery } from '../db/client';

export async function verifyCredentials(username: string, pin: string) {
  // Always sanitize inputs
  const cleanUsername = username.trim();

  // Query User record securely using parameterized statement
  const rows = await selectQuery<{ id: string; username: string; password_hash: string; full_name: string; role: string; status: string }>(
    'SELECT * FROM users WHERE username = ? AND status = "ACTIVE"',
    [cleanUsername]
  );

  if (!rows || rows.length === 0) {
    return { success: false, error: 'Invalid credentials or inactive account.' };
  }

  const user = rows[0];
  const isMatch = await bcrypt.compare(pin, user.password_hash);

  if (!isMatch) {
    return { success: false, error: 'Invalid PIN provided.' };
  }

  const sessionToken = `SESSION_${Date.now()}_${Math.random().toString(36).substring(2)}`;

  return {
    success: true,
    data: {
      token: sessionToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
      },
    },
  };
}
src/components/auth/AuthGate.tsx
TypeScript
import React, { useState } from 'react';
import { Lock, ShieldCheck, KeyRound } from 'lucide-react';

interface AuthGateProps {
  onSuccess: (userData: { token: string; user: any }) => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('dripp');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Direct call to Electron IPC Preload Bridge
      const response = await window.api.authenticate(username, pin);
      if (response.success && response.data) {
        onSuccess(response.data);
      } else {
        setError(response.error || 'Authentication failed');
      }
    } catch (err: any) {
      setError('Communication error with Security Gate service.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
        
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl mb-4 text-emerald-400">
            <ShieldCheck size="{40}"/>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Security Access Gate</h1>
          <p className="text-xs text-slate-400 mt-1">Dripp Real Estate & DigiKhata Enterprise ERP</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Security Identity
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="Username"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Master Access PIN
            </label>
            <div className="relative">
              <input
                type="password"
                value={pin}
                maxLength={10}
                onChange={(e) => setPin(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors tracking-widest"
                placeholder="••••"
              />
              <KeyRound className="absolute right-4 top-3.5 text-slate-500" size="{18}"/>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {loading ? (
              <span>Decrypting Key...</span>
            ) : (
              <>
                <Lock size="{16}"/>
                <span>Unlock Terminal</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-slate-800/80 pt-4">
          <p className="text-[10px] text-slate-500 font-mono">
            AUTHORIZED PERSONNEL ONLY • DUAL-SYNC SECURED
          </p>
        </div>
      </div>
    </div>
  );
};