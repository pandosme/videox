import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  TextField,
  Button,
  Grid,
  InputAdornment,
  CircularProgress,
  Alert,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import StorageIcon from '@mui/icons-material/Storage';
import ScheduleIcon from '@mui/icons-material/Schedule';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import { useToast } from '../../context/ToastContext';
import { getSystemConfig, updateSystemConfig, triggerCleanup } from '../../services/system';

function SystemSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [maxStorageGB, setMaxStorageGB] = useState('');
  const [maxStoragePercent, setMaxStoragePercent] = useState(90);
  const [originalValues, setOriginalValues] = useState({});
  const [hasChanges, setHasChanges] = useState(false);

  const { success, error: showError } = useToast();

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    // Check if there are unsaved changes
    if (originalValues.retentionDays !== undefined) {
      const changed =
        retentionDays !== originalValues.retentionDays ||
        maxStorageGB !== originalValues.maxStorageGB ||
        maxStoragePercent !== originalValues.maxStoragePercent;
      setHasChanges(changed);
    }
  }, [retentionDays, maxStorageGB, maxStoragePercent, originalValues]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const config = await getSystemConfig();

      const days = config.retention?.days || 30;
      const storageGB = config.storage?.maxGB || '';
      const percent = config.storage?.maxPercent || 90;

      setRetentionDays(days);
      setMaxStorageGB(storageGB);
      setMaxStoragePercent(percent);
      setOriginalValues({
        retentionDays: days,
        maxStorageGB: storageGB,
        maxStoragePercent: percent,
      });
    } catch (err) {
      console.error('Error loading system config:', err);
      showError('Failed to load system configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      // Validate inputs
      if (retentionDays < 1 || retentionDays > 3650) {
        showError('Retention days must be between 1 and 3650');
        return;
      }

      if (maxStorageGB && (maxStorageGB < 1 || maxStorageGB > 50000)) {
        showError('Max storage GB must be between 1 and 50000 (or leave empty for no limit)');
        return;
      }

      if (maxStoragePercent < 50 || maxStoragePercent > 99) {
        showError('Disk safety threshold must be between 50 and 99');
        return;
      }

      setSaving(true);

      const config = {
        retentionDays: parseInt(retentionDays),
        maxStoragePercent: parseInt(maxStoragePercent),
      };

      if (maxStorageGB) {
        config.maxStorageGB = parseInt(maxStorageGB);
      }

      await updateSystemConfig(config);

      // Update original values after successful save
      setOriginalValues({
        retentionDays: parseInt(retentionDays),
        maxStorageGB: maxStorageGB ? parseInt(maxStorageGB) : '',
        maxStoragePercent: parseInt(maxStoragePercent),
      });

      success('System configuration updated successfully');
    } catch (err) {
      console.error('Error saving system config:', err);
      showError(err.response?.data?.error?.message || 'Failed to save system configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setRetentionDays(originalValues.retentionDays);
    setMaxStorageGB(originalValues.maxStorageGB);
    setMaxStoragePercent(originalValues.maxStoragePercent);
  };

  const handleCleanup = async () => {
    try {
      setCleaning(true);
      await triggerCleanup();
      success('Retention cleanup initiated. Check logs for results.');
    } catch (err) {
      console.error('Error triggering cleanup:', err);
      showError(err.response?.data?.error?.message || 'Failed to trigger cleanup');
    } finally {
      setCleaning(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
          <StorageIcon />
          <Typography variant="h6">Retention & Storage Settings</Typography>
        </Box>

        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>Three-Tier Retention Policy:</Typography>
          <Typography variant="body2" component="div">
            • <strong>Time-based:</strong> Delete recordings older than retention days<br/>
            • <strong>Storage limit:</strong> Delete oldest recordings when total recording size exceeds GB limit (optional)<br/>
            • <strong>Disk safety:</strong> Emergency cleanup when disk usage exceeds safety threshold (90-95% recommended)
          </Typography>
        </Alert>

        <Grid container spacing={3}>
          {/* Retention Days */}
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              label="Retention Period"
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <ScheduleIcon />
                  </InputAdornment>
                ),
                endAdornment: <InputAdornment position="end">days</InputAdornment>,
              }}
              helperText="How many days to keep recordings (1-3650)"
              inputProps={{
                min: 1,
                max: 3650,
                step: 1,
              }}
            />
          </Grid>

          {/* Max Storage GB */}
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              label="Max Recording Storage (Optional)"
              type="number"
              value={maxStorageGB}
              onChange={(e) => setMaxStorageGB(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <StorageIcon />
                  </InputAdornment>
                ),
                endAdornment: <InputAdornment position="end">GB</InputAdornment>,
              }}
              helperText="Max GB for all recordings (leave empty for no limit)"
              inputProps={{
                min: 1,
                max: 50000,
                step: 1,
              }}
            />
          </Grid>

          {/* Max Storage Percent */}
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              label="Disk Safety Threshold"
              type="number"
              value={maxStoragePercent}
              onChange={(e) => setMaxStoragePercent(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <StorageIcon />
                  </InputAdornment>
                ),
                endAdornment: <InputAdornment position="end">%</InputAdornment>,
              }}
              helperText="Emergency cleanup threshold (90-95% recommended)"
              inputProps={{
                min: 50,
                max: 99,
                step: 1,
              }}
            />
          </Grid>
        </Grid>

        {/* Calculated info */}
        <Box sx={{ mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            How Retention Works:
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • <strong>Time-based:</strong> Recordings older than {retentionDays} days are automatically
            deleted
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • <strong>Storage-based:</strong> When disk usage exceeds {maxStoragePercent}%, the oldest
            recordings are deleted until usage drops below the limit
          </Typography>
          <Typography variant="body2" color="text.secondary">
            • <strong>Protected recordings:</strong> Never automatically deleted regardless of age or
            storage
          </Typography>
        </Box>

        {/* Action Buttons */}
        <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'space-between' }}>
          <Button
            variant="outlined"
            color="warning"
            startIcon={cleaning ? <CircularProgress size={20} /> : <DeleteSweepIcon />}
            onClick={handleCleanup}
            disabled={cleaning}
          >
            {cleaning ? 'Running...' : 'Run Cleanup Now'}
          </Button>
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="outlined" onClick={handleReset} disabled={!hasChanges || saving}>
              Reset
            </Button>
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
              onClick={handleSave}
              disabled={!hasChanges || saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default SystemSettings;
