import { useState, useEffect, useRef } from 'react';
import {
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  IconButton,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  CircularProgress,
  Alert,
  Paper,
  Divider,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Videocam as VideocamIcon,
  Delete as DeleteIcon,
  Lock as LockIcon,
  LockOpen as LockOpenIcon,
  Refresh as RefreshIcon,
  FiberManualRecord as RecordingIcon,
} from '@mui/icons-material';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import * as cameraService from '../services/cameras';
import * as recordingService from '../services/recordings';

function VideoPlayer({ recordingId, onClose }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!recordingId) return;

    const initPlayer = () => {
      try {
        setLoading(true);
        setError(null);

        const videoUrl = recordingService.getRecordingStreamUrl(recordingId);

        if (videoRef.current) {
          const player = videojs(videoRef.current, {
            controls: true,
            autoplay: true,
            preload: 'auto',
            fluid: true,
            sources: [
              {
                src: videoUrl,
                type: 'video/mp4',
              },
            ],
          });

          playerRef.current = player;

          player.on('error', () => {
            const playerError = player.error();
            console.error('Player error:', playerError);
            setError(playerError?.message || 'Playback error');
          });

          player.on('loadeddata', () => {
            setLoading(false);
          });
        }
      } catch (err) {
        console.error('Error initializing player:', err);
        setError('Failed to load video');
        setLoading(false);
      }
    };

    initPlayer();

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [recordingId]);

  return (
    <Dialog open={!!recordingId} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Recording Playback
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          ✕
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <div data-vjs-player>
          <video
            ref={videoRef}
            className="video-js vjs-big-play-centered"
            playsInline
            style={{ width: '100%', height: 'auto' }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Recordings() {
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState({});
  const [playingRecording, setPlayingRecording] = useState(null);
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 1); // Default to yesterday
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const { success, error: showError } = useToast();
  const { user } = useAuth();

  const canModify = user?.role === 'admin' || user?.role === 'operator';

  useEffect(() => {
    loadCameras();
  }, []);

  useEffect(() => {
    if (selectedCamera) {
      loadRecordings();
      loadRecordingStatus();
    }
  }, [selectedCamera, startDate, endDate]);

  const loadCameras = async () => {
    try {
      const data = await cameraService.getCameras();
      setCameras(data);
      if (data.length > 0 && !selectedCamera) {
        setSelectedCamera(data[0]._id);
      }
    } catch (err) {
      showError('Failed to load cameras');
      console.error(err);
    }
  };

  const loadRecordings = async () => {
    if (!selectedCamera) return;

    try {
      setLoading(true);
      const data = await recordingService.getRecordings({
        cameraId: selectedCamera,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate + 'T23:59:59').toISOString(),
        limit: 200,
      });
      setRecordings(data.recordings || []);
    } catch (err) {
      showError('Failed to load recordings');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadRecordingStatus = async () => {
    if (!selectedCamera) return;

    try {
      const status = await recordingService.getRecordingStatus(selectedCamera);
      setRecordingStatus({ [selectedCamera]: status });
    } catch (err) {
      console.error('Failed to load recording status:', err);
    }
  };

  const handleStartRecording = async () => {
    if (!selectedCamera) return;

    try {
      await recordingService.startRecording(selectedCamera);
      success('Recording started');
      loadRecordingStatus();
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to start recording');
      console.error(err);
    }
  };

  const handleStopRecording = async () => {
    if (!selectedCamera) return;

    try {
      await recordingService.stopRecording(selectedCamera);
      success('Recording stopped');
      loadRecordingStatus();
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to stop recording');
      console.error(err);
    }
  };

  const handleProtectRecording = async (recordingId, currentlyProtected) => {
    try {
      if (currentlyProtected) {
        await recordingService.unprotectRecording(recordingId);
        success('Recording protection removed');
      } else {
        await recordingService.protectRecording(recordingId);
        success('Recording protected');
      }
      loadRecordings();
    } catch (err) {
      showError('Failed to update recording protection');
      console.error(err);
    }
  };

  const handleDeleteRecording = async (recordingId, filename) => {
    if (!window.confirm(`Are you sure you want to delete recording "${filename}"?`)) {
      return;
    }

    try {
      await recordingService.deleteRecording(recordingId);
      success('Recording deleted');
      loadRecordings();
    } catch (err) {
      showError(err.response?.data?.error?.message || 'Failed to delete recording');
      console.error(err);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const isRecording = recordingStatus[selectedCamera]?.recording;

  return (
    <Container maxWidth="xl">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Recordings</Typography>
        <IconButton onClick={loadRecordings}>
          <RefreshIcon />
        </IconButton>
      </Box>

      <Grid container spacing={3}>
        {/* Filters and Controls */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Camera</InputLabel>
                    <Select
                      value={selectedCamera}
                      label="Camera"
                      onChange={(e) => setSelectedCamera(e.target.value)}
                    >
                      {cameras.map((camera) => (
                        <MenuItem key={camera._id} value={camera._id}>
                          {camera.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label="Start Date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>

                <Grid item xs={12} md={3}>
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label="End Date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>

                <Grid item xs={12} md={3}>
                  {canModify && selectedCamera && (
                    <>
                      {isRecording ? (
                        <Button
                          fullWidth
                          variant="contained"
                          color="error"
                          startIcon={<StopIcon />}
                          onClick={handleStopRecording}
                        >
                          Stop Recording
                        </Button>
                      ) : (
                        <Button
                          fullWidth
                          variant="contained"
                          color="primary"
                          startIcon={<RecordingIcon />}
                          onClick={handleStartRecording}
                        >
                          Start Recording
                        </Button>
                      )}
                    </>
                  )}
                </Grid>
              </Grid>

              {isRecording && (
                <Box sx={{ mt: 2 }}>
                  <Chip
                    icon={<RecordingIcon />}
                    label="Recording Active"
                    color="error"
                    size="small"
                  />
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Recordings List */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Recorded Segments ({recordings.length})
              </Typography>

              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                  <CircularProgress />
                </Box>
              ) : recordings.length === 0 ? (
                <Alert severity="info">
                  No recordings found for the selected date range. {!isRecording && canModify && 'Start recording to create segments.'}
                </Alert>
              ) : (
                <Paper variant="outlined" sx={{ maxHeight: 600, overflow: 'auto' }}>
                  <List>
                    {recordings.map((recording, index) => (
                      <Box key={recording._id}>
                        {index > 0 && <Divider />}
                        <ListItem>
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body1">
                                  {formatDate(recording.startTime)}
                                </Typography>
                                {recording.protected && (
                                  <Chip
                                    icon={<LockIcon />}
                                    label="Protected"
                                    size="small"
                                    color="warning"
                                  />
                                )}
                                {recording.status === 'recording' && (
                                  <Chip
                                    icon={<RecordingIcon />}
                                    label="Recording"
                                    size="small"
                                    color="error"
                                  />
                                )}
                              </Box>
                            }
                            secondary={
                              <Typography variant="body2" color="text.secondary">
                                Duration: {formatDuration(recording.duration)} • Size: {formatSize(recording.size)} • {recording.filename}
                              </Typography>
                            }
                          />
                          <ListItemSecondaryAction>
                            <IconButton
                              edge="end"
                              onClick={() => setPlayingRecording(recording._id)}
                              title="Play"
                            >
                              <PlayIcon />
                            </IconButton>
                            {canModify && (
                              <>
                                <IconButton
                                  edge="end"
                                  onClick={() => handleProtectRecording(recording._id, recording.protected)}
                                  title={recording.protected ? 'Unprotect' : 'Protect'}
                                >
                                  {recording.protected ? <LockIcon /> : <LockOpenIcon />}
                                </IconButton>
                                {user.role === 'admin' && !recording.protected && (
                                  <IconButton
                                    edge="end"
                                    onClick={() => handleDeleteRecording(recording._id, recording.filename)}
                                    title="Delete"
                                  >
                                    <DeleteIcon />
                                  </IconButton>
                                )}
                              </>
                            )}
                          </ListItemSecondaryAction>
                        </ListItem>
                      </Box>
                    ))}
                  </List>
                </Paper>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Video Player Dialog */}
      {playingRecording && (
        <VideoPlayer
          recordingId={playingRecording}
          onClose={() => setPlayingRecording(null)}
        />
      )}
    </Container>
  );
}

export default Recordings;
