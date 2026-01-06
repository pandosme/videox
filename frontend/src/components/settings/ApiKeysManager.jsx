import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  ToggleOff as ToggleOffIcon,
  ToggleOn as ToggleOnIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useToast } from '../../context/ToastContext';
import * as apiTokensService from '../../services/apiTokens';

function ApiKeysManager() {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState(null);
  const [newTokenData, setNewTokenData] = useState({ name: '', expiresInDays: 0 });
  const [createdToken, setCreatedToken] = useState(null);
  const [showTokenDialog, setShowTokenDialog] = useState(false);

  const { success, error } = useToast();

  useEffect(() => {
    loadTokens();
  }, []);

  const loadTokens = async () => {
    try {
      setLoading(true);
      const data = await apiTokensService.getApiTokens();
      setTokens(data);
    } catch (err) {
      error('Failed to load API tokens');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateToken = async () => {
    if (!newTokenData.name.trim()) {
      error('Token name is required');
      return;
    }

    try {
      const result = await apiTokensService.createApiToken(
        newTokenData.name,
        newTokenData.expiresInDays
      );
      setCreatedToken(result);
      setShowTokenDialog(true);
      setCreateDialogOpen(false);
      setNewTokenData({ name: '', expiresInDays: 0 });
      await loadTokens();
      success('API token created successfully');
    } catch (err) {
      error(err.response?.data?.error?.message || 'Failed to create API token');
      console.error(err);
    }
  };

  const handleDeleteToken = async () => {
    if (!tokenToDelete) return;

    try {
      await apiTokensService.deleteApiToken(tokenToDelete._id);
      await loadTokens();
      success('API token deleted successfully');
      setDeleteDialogOpen(false);
      setTokenToDelete(null);
    } catch (err) {
      error(err.response?.data?.error?.message || 'Failed to delete API token');
      console.error(err);
    }
  };

  const handleToggleToken = async (token) => {
    try {
      await apiTokensService.toggleApiToken(token._id);
      await loadTokens();
      success(`API token ${token.active ? 'disabled' : 'enabled'} successfully`);
    } catch (err) {
      error(err.response?.data?.error?.message || 'Failed to toggle API token');
      console.error(err);
    }
  };

  const handleCopyToken = (tokenValue) => {
    navigator.clipboard.writeText(tokenValue);
    success('Token copied to clipboard');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const format = localStorage.getItem('dateTimeFormat') || 'us';

    if (format === 'us') {
      return date.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } else {
      return date.toISOString().replace('T', ' ').substring(0, 19);
    }
  };

  const isExpired = (expiresAt) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h6">API Keys Management</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Refresh">
              <IconButton onClick={loadTokens} size="small">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateDialogOpen(true)}
            >
              Create API Key
            </Button>
          </Box>
        </Box>

        <Alert severity="info" sx={{ mb: 3 }}>
          API keys allow external applications to access the VideoX API. Keep your keys secure and never share them publicly.
        </Alert>

        {tokens.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary">
              No API keys found. Create one to get started.
            </Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Expires</TableCell>
                  <TableCell>Last Used</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token._id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {token.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {isExpired(token.expiresAt) ? (
                        <Chip label="Expired" color="error" size="small" />
                      ) : token.active ? (
                        <Chip label="Active" color="success" size="small" />
                      ) : (
                        <Chip label="Inactive" color="default" size="small" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(token.createdAt)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(token.expiresAt)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(token.lastUsedAt)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={token.active ? 'Disable' : 'Enable'}>
                        <IconButton
                          size="small"
                          onClick={() => handleToggleToken(token)}
                          disabled={isExpired(token.expiresAt)}
                        >
                          {token.active ? <ToggleOnIcon color="success" /> : <ToggleOffIcon />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setTokenToDelete(token);
                            setDeleteDialogOpen(true);
                          }}
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
      </CardContent>

      {/* Create Token Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create API Key</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Token Name"
              fullWidth
              value={newTokenData.name}
              onChange={(e) => setNewTokenData({ ...newTokenData, name: e.target.value })}
              placeholder="e.g., Mobile App, External Service"
              autoFocus
            />
            <FormControl fullWidth>
              <InputLabel>Expiration</InputLabel>
              <Select
                value={newTokenData.expiresInDays}
                label="Expiration"
                onChange={(e) => setNewTokenData({ ...newTokenData, expiresInDays: e.target.value })}
              >
                <MenuItem value={0}>Never</MenuItem>
                <MenuItem value={7}>7 days</MenuItem>
                <MenuItem value={30}>30 days</MenuItem>
                <MenuItem value={90}>90 days</MenuItem>
                <MenuItem value={365}>1 year</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateToken} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Show Created Token Dialog */}
      <Dialog
        open={showTokenDialog}
        onClose={() => {
          setShowTokenDialog(false);
          setCreatedToken(null);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>API Key Created</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Make sure to copy your API key now. You won't be able to see it again!
          </Alert>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              fullWidth
              value={createdToken?.token || ''}
              InputProps={{
                readOnly: true,
                sx: { fontFamily: 'monospace', fontSize: '0.9rem' },
              }}
            />
            <Tooltip title="Copy to clipboard">
              <IconButton onClick={() => handleCopyToken(createdToken?.token)}>
                <CopyIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setShowTokenDialog(false);
              setCreatedToken(null);
            }}
            variant="contained"
          >
            I've Saved My Key
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete API Key</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the API key "{tokenToDelete?.name}"? This action cannot be undone and any applications using this key will lose access.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteToken} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

export default ApiKeysManager;
