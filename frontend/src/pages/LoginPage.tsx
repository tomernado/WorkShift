import { useState, useEffect } from 'react';
import { Box, Button, Select, MenuItem, FormControl, InputLabel, Alert } from '@mui/material';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import './LoginPage.css';

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
    <div className="login-root">
      <div className="login-card">
        <div className="logo-ring">⏱</div>

        <h1 className="brand-name">WorkShift</h1>
        <p className="brand-sub">ניהול משמרות</p>

        <span className="field-label">בחר שם</span>
        <FormControl fullWidth className="login-select" sx={{ mb: 3 }}>
          <InputLabel sx={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'DM Sans, sans-serif' }}>
            בחר מהרשימה...
          </InputLabel>
          <Select
            value={selectedName}
            label="בחר מהרשימה..."
            onChange={e => setSelectedName(e.target.value)}
            MenuProps={{
              PaperProps: {
                sx: {
                  background: '#1a1a0f',
                  border: '1px solid rgba(212,160,80,0.15)',
                  borderRadius: '10px',
                  '& .MuiMenuItem-root': {
                    color: 'rgba(255,255,255,0.8)',
                    fontFamily: 'DM Sans, sans-serif',
                    '&:hover': { background: 'rgba(212,160,80,0.1)' },
                    '&.Mui-selected': { background: 'rgba(212,160,80,0.15)', color: '#D4A050' },
                  },
                },
              },
            }}
          >
            {employees.map(e => (
              <MenuItem key={e.id} value={e.name}>{e.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <span className="field-label">קוד כניסה</span>
        <input
          className="login-password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          placeholder="••••••••"
        />

        {error && (
          <Box sx={{ mt: 1.5 }}>
            <Alert
              severity="error"
              sx={{
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
          </Box>
        )}

        <div className="divider-line" />

        <Button className="login-btn" onClick={handleLogin} disabled={loading}>
          {loading ? 'מתחבר...' : 'כניסה למערכת'}
        </Button>
      </div>
    </div>
  );
}
