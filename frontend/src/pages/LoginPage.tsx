import { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button,
  Select, MenuItem, FormControl, InputLabel, Alert
} from '@mui/material';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

export default function LoginPage() {
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('profiles').select('id,name,role').eq('is_active', true)
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  async function handleLogin() {
    setError('');
    setLoading(true);
    const selected = employees.find(e => e.name === selectedName);
    if (!selected) { setError('יש לבחור שם'); setLoading(false); return; }

    const email = `${selected.name.replace(/\s+/g, '.')}@workshift.local`;
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) setError('סיסמה שגויה');
    setLoading(false);
  }

  return (
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" bgcolor="#f5f5f5">
      <Card sx={{ width: 360, p: 2 }}>
        <CardContent>
          <Typography variant="h5" fontWeight={700} textAlign="center" mb={3}>WorkShift</Typography>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>בחר שם</InputLabel>
            <Select value={selectedName} onChange={e => setSelectedName(e.target.value)} label="בחר שם">
              {employees.map(e => (
                <MenuItem key={e.id} value={e.name}>{e.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth label="סיסמה" type="password" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            sx={{ mb: 2 }}
          />

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Button fullWidth variant="contained" onClick={handleLogin} disabled={loading}>
            כניסה
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
