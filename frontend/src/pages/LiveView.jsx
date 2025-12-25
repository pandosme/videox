import { useState, useEffect, useRef } from 'react';
import {
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  CircularProgress,
  Alert,
} from '@mui/material';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { useToast } from '../context/ToastContext';
import * as cameraService from '../services/cameras';
import * as liveService from '../services/live';

function VideoPlayer({ camera, onError }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!camera) return;

    let player;
    let streamStarted = false;

    const initPlayer = async () => {
      try {
        setLoading(true);
        setError(null);

        // Start HLS stream
        const streamInfo = await liveService.startLiveStream(camera._id);
        streamStarted = true;

        // Wait a bit for HLS segments to be generated
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Initialize Video.js player
        if (videoRef.current) {
          player = videojs(videoRef.current, {
            controls: true,
            autoplay: true,
            preload: 'auto',
            fluid: true,
            liveui: true,
            sources: [
              {
                src: streamInfo.playlistUrl,
                type: 'application/x-mpegURL',
              },
            ],
          });

          playerRef.current = player;

          player.on('error', (e) => {
            const playerError = player.error();
            console.error('Player error:', playerError);
            setError(playerError?.message || 'Playback error');
            if (onError) onError(camera._id, playerError);
          });

          player.on('loadeddata', () => {
            setLoading(false);
          });
        }
      } catch (err) {
        console.error('Error starting stream:', err);
        setError(err.response?.data?.error?.message || 'Failed to start stream');
        setLoading(false);
        if (onError) onError(camera._id, err);
      }
    };

    initPlayer();

    // Cleanup
    return () => {
      if (player) {
        player.dispose();
        playerRef.current = null;
      }
      if (streamStarted && camera) {
        liveService.stopLiveStream(camera._id).catch(console.error);
      }
    };
  }, [camera?._id]);

  if (!camera) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 300 }}>
        <Typography variant="body2" color="text.secondary">
          Select a camera to view
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      {loading && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            bgcolor: 'rgba(0,0,0,0.5)',
            zIndex: 10,
          }}
        >
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

      <Typography variant="subtitle2" sx={{ mt: 1 }}>
        {camera.name}
      </Typography>
    </Box>
  );
}

function LiveView() {
  const [cameras, setCameras] = useState([]);
  const [selectedCameras, setSelectedCameras] = useState([null, null, null, null]);
  const [loading, setLoading] = useState(true);
  const { error: showError } = useToast();

  useEffect(() => {
    loadCameras();
  }, []);

  const loadCameras = async () => {
    try {
      setLoading(true);
      const data = await cameraService.getCameras();
      setCameras(data.filter((cam) => cam.active));

      // Auto-select first camera if available
      if (data.length > 0 && !selectedCameras[0]) {
        setSelectedCameras([data[0], null, null, null]);
      }
    } catch (err) {
      showError('Failed to load cameras');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCameraSelect = (index, cameraId) => {
    const camera = cameras.find((c) => c._id === cameraId);
    const newSelected = [...selectedCameras];
    newSelected[index] = camera || null;
    setSelectedCameras(newSelected);
  };

  const handlePlayerError = (cameraId, error) => {
    showError(`Stream error for camera ${cameraId}`);
    console.error('Player error:', cameraId, error);
  };

  if (loading) {
    return (
      <Container sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (cameras.length === 0) {
    return (
      <Container>
        <Typography variant="h4" gutterBottom>
          Live View
        </Typography>
        <Alert severity="info">
          No cameras available. Add cameras in the Cameras page to start viewing live streams.
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl">
      <Typography variant="h4" gutterBottom>
        Live View
      </Typography>

      <Grid container spacing={3}>
        {/* 2x2 grid */}
        {[0, 1, 2, 3].map((index) => (
          <Grid item xs={12} md={6} key={index}>
            <Card>
              <CardContent>
                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel>Camera {index + 1}</InputLabel>
                  <Select
                    value={selectedCameras[index]?._id || ''}
                    label={`Camera ${index + 1}`}
                    onChange={(e) => handleCameraSelect(index, e.target.value)}
                  >
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                    {cameras.map((camera) => (
                      <MenuItem key={camera._id} value={camera._id}>
                        {camera.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <VideoPlayer camera={selectedCameras[index]} onError={handlePlayerError} />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}

export default LiveView;
