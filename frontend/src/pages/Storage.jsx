import { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Box,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Chip,
  IconButton,
  CircularProgress,
} from '@mui/material';
import {
  Storage as StorageIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Videocam as VideocamIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  DeleteForever as DeleteForeverIcon,
} from '@mui/icons-material';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import * as storageService from '../services/storage';
import { formatDateTime, formatDate as formatDateUtil } from '../utils/dateFormatter';

function Storage() {
  const [stats, setStats] = useState(null);
  const [cleanupPreview, setCleanupPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [integrityDialog, setIntegrityDialog] = useState(false);
  const [integrityResults, setIntegrityResults] = useState(null);
  const [checkingIntegrity, setCheckingIntegrity] = useState(false);
  const [importingOrphans, setImportingOrphans] = useState(false);
  const [removingOrphans, setRemovingOrphans] = useState(false);
  const [flushDialog, setFlushDialog] = useState(false);
  const [flushingAll, setFlushingAll] = useState(false);

  const { success, error: showError } = useToast();
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';
  const isAdminOrOperator = user?.role === 'admin' || user?.role === 'operator';

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Listen for date format changes to update displayed dates
    const handleFormatChange = () => {
      // Force re-render by reloading data
      loadData();
    };

    window.addEventListener('dateTimeFormatChanged', handleFormatChange);
    return () => {
      window.removeEventListener('dateTimeFormatChanged', handleFormatChange);
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const statsData = await storageService.getStorageStats();

      setStats(statsData);

      // Load cleanup preview if admin/operator
      if (user?.role === 'admin' || user?.role === 'operator') {
        const preview = await storageService.previewCleanup();
        setCleanupPreview(preview);
      }
    } catch (err) {
      showError('Failed to load storage statistics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIntegrity = async () => {
    try {
      setCheckingIntegrity(true);
      const results = await storageService.checkIntegrity();
      setIntegrityResults(results);
      setIntegrityDialog(true);

      if (results.summary.healthy) {
        success('Storage integrity check passed - no issues found');
      } else {
        showError(`Found ${results.summary.totalIssues} integrity issues`);
      }
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to check integrity');
      console.error(err);
    } finally {
      setCheckingIntegrity(false);
    }
  };

  const handleImportOrphans = async () => {
    try {
      setImportingOrphans(true);
      const result = await storageService.importOrphanedFiles();
      success(result.message);

      // Re-run integrity check to update the dialog
      const updatedResults = await storageService.checkIntegrity();
      setIntegrityResults(updatedResults);

      // Reload storage data
      await loadData();
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to import orphaned files');
      console.error(err);
    } finally {
      setImportingOrphans(false);
    }
  };

  const handleRemoveOrphans = async () => {
    if (!window.confirm('Are you sure you want to permanently delete all orphaned files? This action cannot be undone.')) {
      return;
    }

    try {
      setRemovingOrphans(true);
      const result = await storageService.removeOrphanedFiles();
      success(result.message);

      // Re-run integrity check to update the dialog
      const updatedResults = await storageService.checkIntegrity();
      setIntegrityResults(updatedResults);

      // Reload storage data
      await loadData();
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to remove orphaned files');
      console.error(err);
    } finally {
      setRemovingOrphans(false);
    }
  };

  const handleFlushAll = async () => {
    try {
      setFlushingAll(true);
      const result = await storageService.flushAllRecordings();
      success(result.message);
      setFlushDialog(false);

      // Reload storage data
      await loadData();
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to flush all recordings');
      console.error(err);
    } finally {
      setFlushingAll(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return formatDateUtil(dateString);
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <Container sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (!stats) {
    return (
      <Container>
        <Alert severity="error">Failed to load storage statistics</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Storage Management</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {isAdminOrOperator && (
            <Button
              variant="outlined"
              startIcon={checkingIntegrity ? <CircularProgress size={20} /> : <CheckCircleIcon />}
              onClick={handleCheckIntegrity}
              disabled={checkingIntegrity || flushingAll}
            >
              Check Integrity
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteForeverIcon />}
              onClick={() => setFlushDialog(true)}
              disabled={flushingAll || checkingIntegrity}
            >
              Flush All Recordings
            </Button>
          )}
          <IconButton onClick={loadData} disabled={flushingAll || checkingIntegrity}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Per-Camera Breakdown */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Storage by Camera
              </Typography>
              {stats.perCamera.length === 0 ? (
                <Alert severity="info">No cameras with recordings</Alert>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Camera</TableCell>
                        <TableCell align="right">Continuous Segments</TableCell>
                        <TableCell align="right">Size (GB)</TableCell>
                        <TableCell align="right">Retention (Days)</TableCell>
                        <TableCell>Oldest</TableCell>
                        <TableCell>Newest</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {stats.perCamera.map((camera) => (
                        <TableRow key={camera.cameraId}>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <VideocamIcon fontSize="small" color="action" />
                              {camera.cameraName}
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            <Chip
                              label={camera.continuousSegments || 0}
                              size="small"
                              color={camera.continuousSegments <= 5 ? 'success' : camera.continuousSegments <= 20 ? 'warning' : 'default'}
                            />
                          </TableCell>
                          <TableCell align="right">
                            {camera.sizeGB.toFixed(2)}
                          </TableCell>
                          <TableCell align="right">
                            <Chip label={camera.retentionDays} size="small" />
                          </TableCell>
                          <TableCell>{formatDate(camera.oldestRecording)}</TableCell>
                          <TableCell>{formatDate(camera.newestRecording)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Cleanup Preview */}
        {cleanupPreview && cleanupPreview.count > 0 && (
          <Grid item xs={12}>
            <Alert severity="warning" icon={<WarningIcon />}>
              <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
                Retention Cleanup Preview
              </Typography>
              <Typography variant="body2">
                {cleanupPreview.count} recordings ({cleanupPreview.totalSizeGB} GB) are scheduled for automatic deletion based on retention policies.
              </Typography>
            </Alert>
          </Grid>
        )}

        {/* Disk Usage */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <StorageIcon color="primary" />
                <Typography variant="h6">Disk Usage</Typography>
              </Box>
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Used: {stats.disk.usedGB} GB
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Available: {stats.disk.availableGB} GB
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={stats.disk.usagePercent}
                  sx={{
                    height: 10,
                    borderRadius: 5,
                    bgcolor: 'grey.200',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: stats.disk.usagePercent > 90 ? 'error.main' : stats.disk.usagePercent > 75 ? 'warning.main' : 'primary.main',
                    },
                  }}
                />
                <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
                  {stats.disk.usagePercent}% of {stats.disk.totalGB} GB
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Recordings Statistics */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <InfoIcon color="primary" />
                <Typography variant="h6">Recordings Statistics</Typography>
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Total Count (1 minute segments)</Typography>
                  <Typography variant="h5">{stats.recordings.totalCount.toLocaleString()}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Total Size</Typography>
                  <Typography variant="h5">{stats.recordings.totalSizeGB} GB</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Average Size (1 minute segments)</Typography>
                  <Typography variant="body1">{stats.recordings.avgSizeMB} MB</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">Date Range</Typography>
                  <Typography variant="body2">
                    {stats.recordings.oldestRecording ? (
                      <>
                        {formatDate(stats.recordings.oldestRecording)} - {formatDate(stats.recordings.newestRecording)}
                      </>
                    ) : (
                      'No recordings'
                    )}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

      </Grid>

      {/* Integrity Check Results Dialog */}
      <Dialog open={integrityDialog} onClose={() => setIntegrityDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Storage Integrity Check Results</DialogTitle>
        <DialogContent>
          {integrityResults && (
            <>
              {/* Summary */}
              <Alert severity={integrityResults.summary.healthy ? 'success' : 'error'} icon={integrityResults.summary.healthy ? <CheckCircleIcon /> : <ErrorIcon />} sx={{ mb: 2 }}>
                <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                  {integrityResults.summary.healthy ? 'Storage is Healthy' : `Found ${integrityResults.summary.totalIssues} Issue(s)`}
                </Typography>
                <Typography variant="body2">
                  Checked {integrityResults.summary.dbRecordingsChecked} database recordings
                </Typography>
                {!integrityResults.summary.healthy && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      • Missing Files: {integrityResults.summary.missingFiles}
                    </Typography>
                    <Typography variant="body2">
                      • Orphaned Files: {integrityResults.summary.orphanedFiles}
                    </Typography>
                    <Typography variant="body2">
                      • Stuck Recordings: {integrityResults.summary.stuckRecordings}
                    </Typography>
                  </Box>
                )}
              </Alert>

              {/* Issues List */}
              {integrityResults.issues.length > 0 && (
                <Box>
                  <Typography variant="h6" sx={{ mb: 2 }}>Issues Found</Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Type</TableCell>
                          <TableCell>Severity</TableCell>
                          <TableCell>Message</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {integrityResults.issues.map((issue, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Chip
                                label={issue.type.replace(/_/g, ' ')}
                                size="small"
                                color={issue.type === 'MISSING_FILE' ? 'error' : 'warning'}
                              />
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={issue.severity}
                                size="small"
                                color={issue.severity === 'error' ? 'error' : 'warning'}
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                {issue.message}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          {integrityResults && integrityResults.summary.orphanedFiles > 0 && isAdmin && (
            <>
              <Button
                onClick={handleImportOrphans}
                variant="contained"
                color="primary"
                disabled={importingOrphans || removingOrphans}
                startIcon={importingOrphans ? <CircularProgress size={20} /> : null}
              >
                {importingOrphans ? 'Importing...' : 'Add Orphan Files to DB'}
              </Button>
              <Button
                onClick={handleRemoveOrphans}
                variant="outlined"
                color="error"
                disabled={importingOrphans || removingOrphans}
                startIcon={removingOrphans ? <CircularProgress size={20} /> : null}
              >
                {removingOrphans ? 'Removing...' : 'Remove Orphaned Files'}
              </Button>
            </>
          )}
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={() => setIntegrityDialog(false)} disabled={importingOrphans || removingOrphans}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Flush All Recordings Confirmation Dialog */}
      <Dialog open={flushDialog} onClose={() => !flushingAll && setFlushDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: 'error.main', display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon />
          Flush All Recordings
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
              WARNING: This action is IRREVERSIBLE!
            </Typography>
            <Typography variant="body2">
              This will permanently delete:
            </Typography>
            <Box component="ul" sx={{ mt: 1, mb: 0 }}>
              <li>All recording metadata from the database</li>
              <li>All video files from the storage directory</li>
            </Box>
          </Alert>
          <Typography variant="body2" color="text.secondary">
            This operation will remove all recordings for all cameras. Ongoing recordings will continue, but all historical data will be lost.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Are you absolutely sure you want to continue?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFlushDialog(false)} disabled={flushingAll}>
            Cancel
          </Button>
          <Button
            onClick={handleFlushAll}
            variant="contained"
            color="error"
            disabled={flushingAll}
            startIcon={flushingAll ? <CircularProgress size={20} /> : <DeleteForeverIcon />}
          >
            {flushingAll ? 'Flushing...' : 'Yes, Delete Everything'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default Storage;
