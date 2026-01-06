import { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Box,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import * as cameraService from '../services/cameras';

function Cameras() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    port: 80,
    credentials: { username: '', password: '' },
    streamSettings: { resolution: '1920x1080', fps: 25 },
  });
  const [testingConnection, setTestingConnection] = useState(false);
  const [supportedResolutions, setSupportedResolutions] = useState(['1920x1080', '1280x720', '640x480']);
  const [thumbnails, setThumbnails] = useState({}); // Map of cameraId -> thumbnail URL
  const [loadingThumbnails, setLoadingThumbnails] = useState({}); // Map of cameraId -> loading state

  const { success, error } = useToast();
  const { user } = useAuth();

  const canModify = user?.role === 'admin' || user?.role === 'operator';

  useEffect(() => {
    loadCameras();
  }, []);

  useEffect(() => {
    // Load thumbnails for all cameras when cameras list changes
    cameras.forEach((camera) => {
      if (!thumbnails[camera._id] && !loadingThumbnails[camera._id]) {
        loadThumbnail(camera._id);
      }
    });
  }, [cameras]);

  const loadCameras = async () => {
    try {
      setLoading(true);
      const data = await cameraService.getCameras();
      setCameras(data);
    } catch (err) {
      error('Failed to load cameras');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (camera = null) => {
    if (camera) {
      setEditingCamera(camera);
      setFormData({
        name: camera.name,
        address: camera.address,
        port: camera.port,
        credentials: { username: camera.credentials.username, password: '' },
        streamSettings: {
          resolution: camera.streamSettings?.resolution || '1920x1080',
          fps: camera.streamSettings?.fps || 25,
        },
      });
    } else {
      setEditingCamera(null);
      setFormData({
        name: '',
        address: '',
        port: 80,
        credentials: { username: '', password: '' },
        streamSettings: { resolution: '1920x1080', fps: 25 },
      });
      setSupportedResolutions(['1920x1080', '1280x720', '640x480']);
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingCamera(null);
    setFormData({
      name: '',
      address: '',
      port: 80,
      credentials: { username: '', password: '' },
      streamSettings: { resolution: '1920x1080', fps: 25 },
    });
    setSupportedResolutions(['1920x1080', '1280x720', '640x480']);
  };

  const handleTestConnection = async () => {
    try {
      setTestingConnection(true);
      const result = await cameraService.testCameraConnection({
        address: formData.address,
        port: formData.port,
        credentials: formData.credentials,
      });

      if (result.connected) {
        success(`Connected! Model: ${result.model}, Serial: ${result.serial}`);

        // Fetch supported resolutions
        try {
          const resData = await cameraService.getSupportedResolutions({
            address: formData.address,
            port: formData.port,
            credentials: formData.credentials,
          });
          if (resData.resolutions && resData.resolutions.length > 0) {
            setSupportedResolutions(resData.resolutions);
            // Set the first (highest) resolution as default
            setFormData({
              ...formData,
              streamSettings: {
                ...formData.streamSettings,
                resolution: resData.resolutions[0],
              },
            });
          }
        } catch (resErr) {
          console.warn('Failed to fetch supported resolutions:', resErr);
          // Continue with default resolutions
        }
      } else {
        error(`Connection failed: ${result.error}`);
      }
    } catch (err) {
      error('Connection test failed');
      console.error(err);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSubmit = async () => {
    try {
      if (editingCamera) {
        await cameraService.updateCamera(editingCamera._id, formData);
        success('Camera updated successfully');
      } else {
        await cameraService.addCamera(formData);
        success('Camera added successfully');
      }
      handleCloseDialog();
      loadCameras();
    } catch (err) {
      error(err.response?.data?.error?.message || 'Operation failed');
      console.error(err);
    }
  };

  const handleDelete = async (serial, name) => {
    if (!window.confirm(`Are you sure you want to delete camera "${name}"?`)) {
      return;
    }

    try {
      await cameraService.deleteCamera(serial);
      success('Camera deleted successfully');
      loadCameras();
    } catch (err) {
      error('Failed to delete camera');
      console.error(err);
    }
  };

  const handleToggleRecording = async (camera, event) => {
    event.stopPropagation(); // Prevent event bubbling
    const enabled = event.target.checked;

    try {
      await cameraService.updateCamera(camera._id, {
        recordingSettings: {
          mode: enabled ? 'continuous' : 'disabled',
        },
      });
      success(`Recording ${enabled ? 'enabled' : 'disabled'} for ${camera.name}`);
      loadCameras();
    } catch (err) {
      error('Failed to update recording settings');
      console.error(err);
    }
  };

  const loadThumbnail = async (cameraId) => {
    try {
      setLoadingThumbnails((prev) => ({ ...prev, [cameraId]: true }));

      const blob = await cameraService.captureSnapshot(cameraId);
      const url = URL.createObjectURL(blob);

      // Revoke old URL to prevent memory leaks
      if (thumbnails[cameraId]) {
        URL.revokeObjectURL(thumbnails[cameraId]);
      }

      setThumbnails((prev) => ({ ...prev, [cameraId]: url }));
    } catch (err) {
      console.error(`Failed to load thumbnail for camera ${cameraId}:`, err);
      error('Failed to load camera thumbnail');
    } finally {
      setLoadingThumbnails((prev) => ({ ...prev, [cameraId]: false }));
    }
  };

  const handleRefreshThumbnail = (cameraId, event) => {
    event.stopPropagation();
    loadThumbnail(cameraId);
  };

  const getStatusColor = (state) => {
    switch (state) {
      case 'online':
        return 'success';
      case 'offline':
        return 'error';
      case 'connecting':
        return 'warning';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <Container sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="xl">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Cameras</Typography>
        <Box>
          <IconButton onClick={loadCameras} sx={{ mr: 1 }}>
            <RefreshIcon />
          </IconButton>
          {canModify && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
              Add Camera
            </Button>
          )}
        </Box>
      </Box>

      {cameras.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No cameras configured
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Add your first Axis camera to start recording
            </Typography>
            {canModify && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
                Add Camera
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {cameras.map((camera) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={camera._id}>
              <Card>
                <CardContent sx={{ position: 'relative', pb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="h6" component="div" noWrap>
                      {camera.name}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexDirection: 'column', alignItems: 'flex-end' }}>
                      <Chip
                        label={camera.status.connectionState}
                        color={getStatusColor(camera.status.connectionState)}
                        size="small"
                      />
                      {camera.status.recordingState === 'recording' && (
                        <Chip
                          label="Recording"
                          color="error"
                          size="small"
                        />
                      )}
                    </Box>
                  </Box>

                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {camera.metadata.model || 'Unknown Model'}
                  </Typography>

                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {camera.address}
                  </Typography>

                  {camera.metadata.location && (
                    <Typography variant="body2" color="text.secondary">
                      📍 {camera.metadata.location}
                    </Typography>
                  )}

                  {canModify && (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={camera.recordingSettings?.mode === 'continuous'}
                          onChange={(e) => handleToggleRecording(camera, e)}
                          size="small"
                        />
                      }
                      label="Enable Recording"
                      sx={{ mt: 1 }}
                    />
                  )}

                  <Box sx={{ mt: 2, mb: 8 }}>
                    {camera.metadata.tags?.map((tag) => (
                      <Chip key={tag} label={tag} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                    ))}
                  </Box>

                  {/* Thumbnail in bottom right corner */}
                  <Box
                    sx={{
                      position: 'absolute',
                      bottom: 8,
                      right: 8,
                      width: 120,
                      height: 68,
                      border: '1px solid #ddd',
                      borderRadius: 1,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      '&:hover': {
                        opacity: 0.8,
                      },
                    }}
                    onClick={(e) => handleRefreshThumbnail(camera._id, e)}
                  >
                    {loadingThumbnails[camera._id] ? (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '100%',
                          bgcolor: '#f5f5f5',
                        }}
                      >
                        <CircularProgress size={20} />
                      </Box>
                    ) : thumbnails[camera._id] ? (
                      <img
                        src={thumbnails[camera._id]}
                        alt={`${camera.name} thumbnail`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '100%',
                          bgcolor: '#f5f5f5',
                          fontSize: '0.75rem',
                          color: '#999',
                        }}
                      >
                        Click to load
                      </Box>
                    )}
                  </Box>
                </CardContent>

                <CardActions>
                  {canModify && (
                    <>
                      <IconButton size="small" onClick={() => handleOpenDialog(camera)}>
                        <EditIcon />
                      </IconButton>
                      {user.role === 'admin' && (
                        <IconButton size="small" onClick={() => handleDelete(camera._id, camera.name)}>
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </>
                  )}
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Add/Edit Camera Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingCamera ? 'Edit Camera' : 'Add Camera'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Camera Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="IP Address or Hostname"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            margin="normal"
            required
            disabled={!!editingCamera}
          />
          <TextField
            fullWidth
            label="HTTP Port"
            type="number"
            value={formData.port}
            onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
            margin="normal"
            disabled={!!editingCamera}
          />
          <TextField
            fullWidth
            label="Username"
            value={formData.credentials.username}
            onChange={(e) =>
              setFormData({ ...formData, credentials: { ...formData.credentials, username: e.target.value } })
            }
            margin="normal"
            required
            disabled={!!editingCamera}
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            value={formData.credentials.password}
            onChange={(e) =>
              setFormData({ ...formData, credentials: { ...formData.credentials, password: e.target.value } })
            }
            margin="normal"
            required={!editingCamera}
            disabled={!!editingCamera}
          />

          <FormControl fullWidth margin="normal">
            <InputLabel>Resolution</InputLabel>
            <Select
              value={formData.streamSettings.resolution}
              label="Resolution"
              onChange={(e) =>
                setFormData({
                  ...formData,
                  streamSettings: { ...formData.streamSettings, resolution: e.target.value },
                })
              }
            >
              {supportedResolutions.map((res) => (
                <MenuItem key={res} value={res}>
                  {res}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth margin="normal">
            <InputLabel>Frame Rate (FPS)</InputLabel>
            <Select
              value={formData.streamSettings.fps}
              label="Frame Rate (FPS)"
              onChange={(e) =>
                setFormData({
                  ...formData,
                  streamSettings: { ...formData.streamSettings, fps: e.target.value },
                })
              }
            >
              {[5, 10, 15, 20, 25, 30].map((fps) => (
                <MenuItem key={fps} value={fps}>
                  {fps} fps
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {!editingCamera && (
            <Button
              fullWidth
              variant="outlined"
              onClick={handleTestConnection}
              disabled={testingConnection || !formData.address || !formData.credentials.username || !formData.credentials.password}
              sx={{ mt: 2 }}
            >
              {testingConnection ? 'Testing...' : 'Test Connection'}
            </Button>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={!formData.name || !formData.address || !formData.credentials.username}
          >
            {editingCamera ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default Cameras;
