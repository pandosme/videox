import { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  VpnKey as KeyIcon,
  PowerSettingsNew as PowerIcon,
} from '@mui/icons-material';
import { useToast } from '../context/ToastContext';
import * as apiTokenService from '../services/apiTokens';

function Settings() {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialog, setCreateDialog] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState(null);
  const [showTokenDialog, setShowTokenDialog] = useState(false);

  const { success, error: showError } = useToast();

  useEffect(() => {
    loadTokens();
  }, []);

  const loadTokens = async () => {
    try {
      setLoading(true);
      const data = await apiTokenService.getApiTokens();
      setTokens(data);
    } catch (err) {
      showError('Failed to load API tokens');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateToken = async () => {
    if (!newTokenName.trim()) {
      showError('Token name is required');
      return;
    }

    try {
      setCreating(true);
      const result = await apiTokenService.createApiToken(newTokenName, expiresInDays);
      setCreatedToken(result);
      setShowTokenDialog(true);
      setCreateDialog(false);
      setNewTokenName('');
      setExpiresInDays(0);
      await loadTokens();
      success('API token created successfully');
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to create API token');
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteToken = async (tokenId, tokenName) => {
    if (!window.confirm(`Are you sure you want to delete token "${tokenName}"?`)) {
      return;
    }

    try {
      await apiTokenService.deleteApiToken(tokenId);
      success('API token deleted');
      await loadTokens();
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to delete API token');
      console.error(err);
    }
  };

  const handleToggleToken = async (tokenId) => {
    try {
      await apiTokenService.toggleApiToken(tokenId);
      success('API token status updated');
      await loadTokens();
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to update API token');
      console.error(err);
    }
  };

  const handleCopyToken = (token) => {
    navigator.clipboard.writeText(token);
    success('Token copied to clipboard');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const isExpired = (expiresAt) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Settings</Typography>
        <IconButton onClick={loadTokens}>
          <RefreshIcon />
        </IconButton>
      </Box>

      <Grid container spacing={3}>
        {/* API Tokens Section */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <KeyIcon color="primary" />
                  <Typography variant="h6">API Tokens</Typography>
                </Box>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setCreateDialog(true)}
                >
                  Create Token
                </Button>
              </Box>

              <Alert severity="info" sx={{ mb: 2 }}>
                API tokens allow external applications to access the export API. Use them for integrations and automation.
              </Alert>

              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                  <CircularProgress />
                </Box>
              ) : tokens.length === 0 ? (
                <Alert severity="info">
                  No API tokens created yet. Create one to enable API access.
                </Alert>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Created</TableCell>
                        <TableCell>Last Used</TableCell>
                        <TableCell>Expires</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tokens.map((token) => (
                        <TableRow key={token._id}>
                          <TableCell>{token.name}</TableCell>
                          <TableCell>
                            {isExpired(token.expiresAt) ? (
                              <Chip label="Expired" size="small" color="error" />
                            ) : token.active ? (
                              <Chip label="Active" size="small" color="success" />
                            ) : (
                              <Chip label="Inactive" size="small" color="default" />
                            )}
                          </TableCell>
                          <TableCell>{formatDate(token.createdAt)}</TableCell>
                          <TableCell>{formatDate(token.lastUsed)}</TableCell>
                          <TableCell>{formatDate(token.expiresAt)}</TableCell>
                          <TableCell align="right">
                            <Tooltip title={token.active ? 'Deactivate' : 'Activate'}>
                              <IconButton
                                size="small"
                                onClick={() => handleToggleToken(token._id)}
                                disabled={isExpired(token.expiresAt)}
                              >
                                <PowerIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteToken(token._id, token.name)}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {/* API Documentation */}
              <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Export API Usage
                </Typography>
                <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
{`GET /api/export
Query Parameters:
  - cameraId: Camera serial number (required)
  - startTime: Start time in epoch seconds (required)
  - duration: Duration in seconds (required)
  - type: 'stream' or 'file' (default: 'stream')

Headers:
  Authorization: Bearer <your_api_token>

Example:
curl -H "Authorization: Bearer <token>" \\
  "/api/export?cameraId=B8A44F3024BB&startTime=1735146000&duration=60&type=file" \\
  -o recording.mp4`}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Create Token Dialog */}
      <Dialog open={createDialog} onClose={() => setCreateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create API Token</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Token Name"
            value={newTokenName}
            onChange={(e) => setNewTokenName(e.target.value)}
            placeholder="e.g., Mobile App Integration"
            sx={{ mt: 2, mb: 2 }}
            helperText="Descriptive name to identify this token"
          />
          <FormControl fullWidth>
            <InputLabel>Expires In</InputLabel>
            <Select
              value={expiresInDays}
              label="Expires In"
              onChange={(e) => setExpiresInDays(e.target.value)}
            >
              <MenuItem value={0}>Never</MenuItem>
              <MenuItem value={7}>7 days</MenuItem>
              <MenuItem value={30}>30 days</MenuItem>
              <MenuItem value={90}>90 days</MenuItem>
              <MenuItem value={365}>365 days</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog(false)} disabled={creating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateToken}
            variant="contained"
            disabled={creating || !newTokenName.trim()}
          >
            {creating ? <CircularProgress size={24} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Show Created Token Dialog */}
      <Dialog
        open={showTokenDialog}
        onClose={() => setShowTokenDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>API Token Created</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            <strong>Save this token now!</strong> You won't be able to see it again.
          </Alert>
          <TextField
            fullWidth
            label="API Token"
            value={createdToken?.token || ''}
            InputProps={{
              readOnly: true,
              endAdornment: (
                <IconButton onClick={() => handleCopyToken(createdToken?.token)}>
                  <CopyIcon />
                </IconButton>
              ),
            }}
            sx={{ fontFamily: 'monospace' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowTokenDialog(false)} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default Settings;
