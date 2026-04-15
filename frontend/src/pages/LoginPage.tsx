import { useState, useEffect } from 'react';
import {
  Box, Typography, Button,
  Select, MenuItem, FormControl, InputLabel, Alert,
  GlobalStyles,
} from '@mui/material';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

const globalStyles = (
  <GlobalStyles styles={`
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500&display=swap');

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(24px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes shimmer {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
    @keyframes pulse-ring {
      0%   { transform: scale(0.95); opacity: 0.6; }
      50%  { transform: scale(1.05); opacity: 0.2; }
      100% { transform: scale(0.95); opacity: 0.6; }
    }

    .login-root {
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background-color: #0d0d0d;
      background-image:
        radial-gradient(ellipse 80% 60% at 50% -10%, rgba(212,160,80,0.18) 0%, transparent 70%),
        linear-gradient(180deg, #0d0d0d 0%, #111008 100%);
      font-family: 'DM Sans', sans-serif;
      direction: rtl;
    }

    /* subtle dot grid */
    .login-root::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image: radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px);
      background-size: 28px 28px;
      pointer-events: none;
    }

    .login-card {
      position: relative;
      width: 100%;
      max-width: 400px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 20px;
      padding: 40px 32px 36px;
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      box-shadow:
        0 0 0 1px rgba(212,160,80,0.08),
        0 32px 64px rgba(0,0,0,0.6),
        inset 0 1px 0 rgba(255,255,255,0.08);
      animation: fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) both;
    }

    .logo-ring {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: linear-gradient(135deg, #D4A050, #8B5E1A);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 26px;
      position: relative;
      box-shadow: 0 8px 24px rgba(212,160,80,0.35);
    }
    .logo-ring::before {
      content: '';
      position: absolute;
      inset: -6px;
      border-radius: 50%;
      border: 1.5px solid rgba(212,160,80,0.3);
      animation: pulse-ring 3s ease-in-out infinite;
    }

    .brand-name {
      font-family: 'Playfair Display', serif !important;
      font-size: 2rem !important;
      font-weight: 900 !important;
      text-align: center;
      background: linear-gradient(90deg, #D4A050 0%, #F5D08A 40%, #D4A050 100%);
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: shimmer 4s linear infinite;
      letter-spacing: -0.5px;
      line-height: 1.1 !important;
      margin-bottom: 4px !important;
    }

    .brand-sub {
      font-family: 'DM Sans', sans-serif;
      font-size: 0.78rem;
      color: rgba(255,255,255,0.35);
      text-align: center;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 36px;
    }

    .field-label {
      font-family: 'DM Sans', sans-serif !important;
      font-size: 0.72rem !important;
      font-weight: 500 !important;
      color: rgba(255,255,255,0.45) !important;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 6px;
      display: block;
    }

    .custom-select .MuiOutlinedInput-root,
    .custom-input {
      background: rgba(255,255,255,0.05) !important;
      border-radius: 10px !important;
      color: rgba(255,255,255,0.9) !important;
      font-family: 'DM Sans', sans-serif !important;
      transition: all 0.2s ease;
    }
    .custom-select .MuiOutlinedInput-root:hover,
    .custom-input:hover {
      background: rgba(255,255,255,0.08) !important;
    }
    .custom-select .MuiOutlinedInput-root.Mui-focused,
    .custom-input:focus-within {
      background: rgba(212,160,80,0.07) !important;
      box-shadow: 0 0 0 2px rgba(212,160,80,0.3) !important;
    }
    .custom-select .MuiOutlinedInput-notchedOutline,
    .custom-input fieldset {
      border-color: rgba(255,255,255,0.1) !important;
    }
    .custom-select .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline,
    .custom-input:focus-within fieldset {
      border-color: rgba(212,160,80,0.5) !important;
    }
    .custom-select .MuiSelect-icon { color: rgba(255,255,255,0.4); }
    .custom-select .MuiInputLabel-root { color: rgba(255,255,255,0.35) !important; font-family: 'DM Sans', sans-serif !important; }
    .custom-select .MuiSelect-select { color: rgba(255,255,255,0.9) !important; }

    .login-btn {
      width: 100%;
      padding: 13px !important;
      border-radius: 10px !important;
      font-family: 'DM Sans', sans-serif !important;
      font-weight: 500 !important;
      font-size: 0.95rem !important;
      letter-spacing: 0.04em !important;
      background: linear-gradient(135deg, #D4A050, #B8832A) !important;
      color: #0d0d0d !important;
      box-shadow: 0 4px 20px rgba(212,160,80,0.35) !important;
      border: none !important;
      transition: all 0.2s ease !important;
      margin-top: 8px !important;
    }
    .login-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 8px 28px rgba(212,160,80,0.45) !important;
    }
    .login-btn:disabled {
      opacity: 0.5 !important;
      background: rgba(212,160,80,0.4) !important;
    }

    .divider-line {
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
      margin: 28px 0;
    }

    .MuiMenu-paper {
      background: #1a1a0f !important;
      border: 1px solid rgba(212,160,80,0.15) !important;
      border-radius: 10px !important;
    }
    .MuiMenuItem-root {
      color: rgba(255,255,255,0.8) !important;
      font-family: 'DM Sans', sans-serif !important;
    }
    .MuiMenuItem-root:hover {
      background: rgba(212,160,80,0.1) !important;
    }
    .MuiMenuItem-root.Mui-selected {
      background: rgba(212,160,80,0.15) !important;
      color: #D4A050 !important;
    }
  `} />
);

export default function LoginPage() {
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('profiles').select('id,name,role,email').eq('is_active', true)
      .then(({ data }) => setEmployees((data ?? []) as Profile[]));
  }, []);

  async function handleLogin() {
    setError('');
    setLoading(true);
    const selected = employees.find(e => e.name === selectedName);
    if (!selected) { setError('יש לבחור שם'); setLoading(false); return; }
    const email = selected.email ?? `${selected.name.replace(/\s+/g, '.')}@workshift.local`;
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError('סיסמה שגויה');
    setLoading(false);
  }

  return (
    <>
      {globalStyles}
      <div className="login-root">
        <div className="login-card">
          <div className="logo-ring">⏱</div>

          <Typography className="brand-name">WorkShift</Typography>
          <p className="brand-sub">ניהול משמרות</p>

          <span className="field-label">בחר שם</span>
          <FormControl fullWidth className="custom-select" sx={{ mb: 3 }}>
            <InputLabel shrink={false} sx={{ display: selectedName ? 'none' : 'block' }}>
              בחר מהרשימה...
            </InputLabel>
            <Select
              value={selectedName}
              onChange={e => setSelectedName(e.target.value)}
              displayEmpty
            >
              {employees.map(e => (
                <MenuItem key={e.id} value={e.name}>{e.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <span className="field-label">קוד כניסה</span>
          <Box
            component="input"
            type="password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleLogin()}
            placeholder="••••••••"
            sx={{
              width: '100%',
              padding: '13px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.9)',
              fontSize: '1rem',
              fontFamily: 'DM Sans, sans-serif',
              outline: 'none',
              boxSizing: 'border-box',
              mb: 1,
              transition: 'all 0.2s ease',
              '&:focus': {
                background: 'rgba(212,160,80,0.07)',
                borderColor: 'rgba(212,160,80,0.5)',
                boxShadow: '0 0 0 2px rgba(212,160,80,0.3)',
              },
              '&::placeholder': { color: 'rgba(255,255,255,0.2)' },
            }}
          />

          {error && (
            <Alert
              severity="error"
              sx={{
                mt: 1.5, mb: 0.5,
                background: 'rgba(211,47,47,0.15)',
                border: '1px solid rgba(211,47,47,0.3)',
                color: '#ff8a80',
                borderRadius: '10px',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '0.85rem',
                '& .MuiAlert-icon': { color: '#ff8a80' },
              }}
            >
              {error}
            </Alert>
          )}

          <div className="divider-line" />

          <Button className="login-btn" onClick={handleLogin} disabled={loading}>
            {loading ? 'מתחבר...' : 'כניסה למערכת'}
          </Button>
        </div>
      </div>
    </>
  );
}
