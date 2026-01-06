import { useState } from 'react';
import {
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Box,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import ApiKeysManager from '../components/settings/ApiKeysManager';

function Settings() {
  const [dateTimeFormat, setDateTimeFormat] = useState(
    localStorage.getItem('dateTimeFormat') || 'us'
  );

  const { success } = useToast();
  const { isAdmin } = useAuth();

  const handleDateTimeFormatChange = (format) => {
    setDateTimeFormat(format);
    localStorage.setItem('dateTimeFormat', format);
    success(`Date/Time format updated to ${format === 'us' ? 'US' : 'ISO'}`);
    // Trigger a page reload or event to update all displayed dates
    window.dispatchEvent(new Event('dateTimeFormatChanged'));
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4">Settings</Typography>
      </Box>

      <Grid container spacing={3}>
        {/* User Preferences Section */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <Typography variant="h6">User Preferences</Typography>
              </Box>

              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <FormControl fullWidth>
                    <InputLabel>Date/Time Format</InputLabel>
                    <Select
                      value={dateTimeFormat}
                      label="Date/Time Format"
                      onChange={(e) => handleDateTimeFormatChange(e.target.value)}
                    >
                      <MenuItem value="us">
                        US Format (MM/DD/YYYY, 12-hour)
                      </MenuItem>
                      <MenuItem value="iso">
                        ISO Format (YYYY-MM-DD, 24-hour)
                      </MenuItem>
                    </Select>
                  </FormControl>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Example: {dateTimeFormat === 'us'
                      ? new Date().toLocaleString('en-US', {
                          month: '2-digit',
                          day: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })
                      : new Date().toISOString().replace('T', ' ').substring(0, 19)}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* API Keys Management Section - Admin Only */}
        {isAdmin && (
          <Grid item xs={12}>
            <ApiKeysManager />
          </Grid>
        )}
      </Grid>
    </Container>
  );
}

export default Settings;
