import { useState, useEffect, useRef } from 'react';
import {
  Container,
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Paper,
  Slider,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import * as cameraService from '../services/cameras';
import * as recordingService from '../services/recordings';

function Playback() {
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [timelineValue, setTimelineValue] = useState(0); // Position in seconds from midnight
  const [timeMarks, setTimeMarks] = useState([]);
  const [currentRecording, setCurrentRecording] = useState(null);
  
  // Selection box state (in seconds from midnight)
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(3 * 3600); // Default 3 hours
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState(null); // 'left', 'right', 'move'
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartSelection, setDragStartSelection] = useState({ start: 0, end: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackStartTime, setPlaybackStartTime] = useState(null);
  const [playbackStartPosition, setPlaybackStartPosition] = useState(0);
  
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const overviewRef = useRef(null);
  const playbackIntervalRef = useRef(null);
  
  const { error: showError } = useToast();
  const { user, isAuthenticated } = useAuth();

  // Load cameras on mount
  useEffect(() => {
    if (isAuthenticated) {
      loadCameras();
    }
  }, [isAuthenticated]);

  // Load periods when camera or date changes
  useEffect(() => {
    if (isAuthenticated && selectedCamera && selectedDate) {
      loadRecordingPeriods();
    }
  }, [isAuthenticated, selectedCamera, selectedDate]);

  // Generate timeline marks and adjust selection when periods change
  useEffect(() => {
    if (periods.length > 0) {
      const marks = generateTimeMarks();
      setTimeMarks(marks);
      
      // Set initial selection to first recording
      const firstPeriod = periods[0];
      const firstPeriodStart = new Date(firstPeriod.startTime);
      const dayStart = new Date(selectedDate);
      dayStart.setHours(0, 0, 0, 0);
      const firstRecordingSeconds = Math.floor((firstPeriodStart - dayStart) / 1000);
      
      // Set selection around first recording (3 hours centered if possible)
      const selStart = Math.max(0, firstRecordingSeconds - 1800); // 30 min before
      const selEnd = Math.min(86400, selStart + 3 * 3600); // 3 hours
      setSelectionStart(selStart);
      setSelectionEnd(selEnd);
      setTimelineValue(firstRecordingSeconds);
    }
  }, [periods]);

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

  const loadRecordingPeriods = async () => {
    if (!selectedCamera || !selectedDate) return;

    try {
      setLoading(true);
      
      // Get start and end of the selected day
      const startOfDay = new Date(selectedDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(selectedDate);
      endOfDay.setHours(23, 59, 59, 999);

      const data = await recordingService.getRecordingPeriods({
        cameraId: selectedCamera,
        startDate: Math.floor(startOfDay.getTime() / 1000),
        endDate: Math.floor(endOfDay.getTime() / 1000),
        gapThreshold: 120, // 2 minutes
      });

      setPeriods(data.periods || []);
    } catch (err) {
      showError('Failed to load recording periods');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generateTimeMarks = () => {
    const marks = [];
    const selectionDuration = selectionEnd - selectionStart;
    
    // Generate marks based on selection duration
    let interval;
    if (selectionDuration <= 3600) {
      interval = 600; // Every 10 minutes for 1 hour or less
    } else if (selectionDuration <= 3 * 3600) {
      interval = 1800; // Every 30 minutes for up to 3 hours
    } else if (selectionDuration <= 6 * 3600) {
      interval = 3600; // Every hour for up to 6 hours
    } else {
      interval = 3600 * 2; // Every 2 hours for longer
    }
    
    for (let seconds = selectionStart; seconds <= selectionEnd; seconds += interval) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      marks.push({
        value: seconds,
        label: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
      });
    }

    return marks;
  };

  // Selection box drag handlers
  const handleOverviewMouseDown = (e, mode) => {
    if (!overviewRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const rect = overviewRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startSelection = { start: selectionStart, end: selectionEnd };
    
    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaSeconds = (deltaX / rect.width) * 86400; // 24 hours in seconds
      
      let newStart = startSelection.start;
      let newEnd = startSelection.end;
      
      if (mode === 'left') {
        // Drag left edge
        newStart = Math.max(0, Math.min(startSelection.start + deltaSeconds, startSelection.end - 600)); // Min 10 min selection
      } else if (mode === 'right') {
        // Drag right edge
        newEnd = Math.min(86400, Math.max(startSelection.end + deltaSeconds, startSelection.start + 600)); // Min 10 min selection
      } else if (mode === 'move') {
        // Move entire selection
        const duration = startSelection.end - startSelection.start;
        newStart = startSelection.start + deltaSeconds;
        newEnd = startSelection.end + deltaSeconds;
        
        // Keep within bounds
        if (newStart < 0) {
          newStart = 0;
          newEnd = duration;
        }
        if (newEnd > 86400) {
          newEnd = 86400;
          newStart = 86400 - duration;
        }
      }
      
      setSelectionStart(Math.round(newStart));
      setSelectionEnd(Math.round(newEnd));
      
      // Update timeline value to stay within selection
      setTimelineValue((prev) => {
        if (prev < newStart) return Math.round(newStart);
        if (prev > newEnd) return Math.round(newEnd);
        return prev;
      });
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Regenerate marks for new selection
      const marks = generateTimeMarks();
      setTimeMarks(marks);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const secondsToTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isTimeInRecording = (timeSeconds) => {
    const selectedDateTime = new Date(selectedDate);
    selectedDateTime.setHours(0, 0, 0, 0);
    const targetTime = new Date(selectedDateTime.getTime() + (timeSeconds * 1000));

    return periods.some(period => {
      const periodStart = new Date(period.startTime);
      const periodEnd = new Date(period.endTime);
      return targetTime >= periodStart && targetTime <= periodEnd;
    });
  };

  const handleTimelineChange = (event, newValue) => {
    setTimelineValue(newValue);
  };

  const handleTimelineChangeCommitted = async (event, newValue) => {
    // Check if camera is selected
    if (!selectedCamera) {
      showError('Please select a camera first');
      return;
    }

    // Find if this time has a recording
    if (!isTimeInRecording(newValue)) {
      showError('No recording available at this time');
      return;
    }

    // Calculate the timestamp
    const selectedDateTime = new Date(selectedDate);
    selectedDateTime.setHours(0, 0, 0, 0);
    const playbackTime = new Date(selectedDateTime.getTime() + (newValue * 1000));

    // Start playback
    await startPlayback(playbackTime);
  };

  const startPlayback = async (startTime) => {
    try {
      // Check if camera is selected
      if (!selectedCamera) {
        showError('Please select a camera first');
        return;
      }

      // Clear any existing playback interval
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }

      const startTimeEpoch = Math.floor(startTime.getTime() / 1000);
      // selectedCamera is already the camera's serial number (_id)
      const streamUrl = `/api/recordings/stream-by-time?cameraId=${selectedCamera}&startTime=${startTimeEpoch}`;

      setCurrentRecording(streamUrl);
      setIsPlaying(false);

      // If player exists, change source instead of recreating
      if (playerRef.current) {
        try {
          // Remove event listeners to prevent loops when changing source
          playerRef.current.off('ended');
          playerRef.current.off('play');
          playerRef.current.off('pause');
          playerRef.current.off('error');
          
          playerRef.current.pause();
          playerRef.current.src({
            src: streamUrl,
            type: 'video/mp4',
          });
          playerRef.current.load();
          
          // Update playback tracking
          const dayStart = new Date(selectedDate);
          dayStart.setHours(0, 0, 0, 0);
          const startSeconds = Math.floor((startTime - dayStart) / 1000);
          setPlaybackStartTime(Date.now());
          setPlaybackStartPosition(startSeconds);
          
          // Re-add event listeners
          playerRef.current.on('play', () => setIsPlaying(true));
          playerRef.current.on('pause', () => setIsPlaying(false));
          playerRef.current.on('error', (e) => {
            console.error('Video.js error:', e);
            const error = playerRef.current?.error();
            if (error) {
              showError(`Playback error: ${error.message || 'Unknown error'}`);
            }
          });
          playerRef.current.on('ended', () => {
            console.log('Video segment ended');
            handleSegmentEnded();
          });
          
          // Auto-play the new source
          playerRef.current.play().catch(err => {
            console.error('Autoplay failed:', err);
          });
          
          return;
        } catch (err) {
          console.error('Error changing source, will recreate player:', err);
          // If changing source fails, dispose and recreate
          playerRef.current.dispose();
          playerRef.current = null;
        }
      }

      // Wait for video element to be ready
      await new Promise(resolve => setTimeout(resolve, 100));

      if (videoRef.current) {
        const player = videojs(videoRef.current, {
          controls: true,
          autoplay: true,
          preload: 'auto',
          fluid: false,
          responsive: false,
          width: 640,
          height: 360,
          sources: [
            {
              src: streamUrl,
              type: 'video/mp4',
            },
          ],
        });

        playerRef.current = player;

        // Track playback start
        player.on('play', () => {
          setIsPlaying(true);
          const dayStart = new Date(selectedDate);
          dayStart.setHours(0, 0, 0, 0);
          const startSeconds = Math.floor((startTime - dayStart) / 1000);
          setPlaybackStartTime(Date.now());
          setPlaybackStartPosition(startSeconds);
        });

        player.on('pause', () => {
          setIsPlaying(false);
        });

        player.on('error', () => {
          const playerError = player.error();
          console.error('Player error:', playerError);
          setIsPlaying(false);
          if (playbackIntervalRef.current) {
            clearInterval(playbackIntervalRef.current);
            playbackIntervalRef.current = null;
          }
          showError(playerError?.message || 'Playback error occurred');
        });

        player.on('ended', () => {
          console.log('Segment ended, attempting continuous playback');
          setIsPlaying(false);
          handleSegmentEnded();
        });
      }
    } catch (err) {
      console.error('Error starting playback:', err);
      setIsPlaying(false);
      showError('Failed to start playback');
    }
  };

  // Handle segment end - continue to next or stop
  const handleSegmentEnded = async () => {
    // Calculate next position (current + 1 second)
    const nextPosition = timelineValue + 1;

    // Check if we're at the end of selection or day
    if (nextPosition >= selectionEnd || nextPosition >= 86400) {
      console.log('Reached end of timeline');
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
      return;
    }

    // Check if next position has recording
    if (!isTimeInRecording(nextPosition)) {
      console.log('Gap in recordings, stopping playback');
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
      showError('No more continuous recordings available');
      return;
    }

    // Continue playback at next position
    setTimelineValue(nextPosition);
    const selectedDateTime = new Date(selectedDate);
    selectedDateTime.setHours(0, 0, 0, 0);
    const nextPlaybackTime = new Date(selectedDateTime.getTime() + (nextPosition * 1000));
    await startPlayback(nextPlaybackTime);
  };

  // Update timeline position during playback
  useEffect(() => {
    if (isPlaying && playbackStartTime && playerRef.current) {
      // Update timeline every 500ms
      playbackIntervalRef.current = setInterval(() => {
        if (playerRef.current && !playerRef.current.paused()) {
          const elapsed = (Date.now() - playbackStartTime) / 1000;
          const newPosition = playbackStartPosition + elapsed;
          
          // Check if we've reached end of selection or day
          if (newPosition >= selectionEnd || newPosition >= 86400) {
            setIsPlaying(false);
            clearInterval(playbackIntervalRef.current);
            playbackIntervalRef.current = null;
            if (playerRef.current) {
              playerRef.current.pause();
            }
            return;
          }
          
          setTimelineValue(Math.floor(newPosition));
        }
      }, 500);

      return () => {
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
          playbackIntervalRef.current = null;
        }
      };
    }
  }, [isPlaying, playbackStartTime, playbackStartPosition, selectionEnd]);

  // Cleanup player on unmount
  useEffect(() => {
    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  // Custom slider styling to show recording availability
  const getSliderStyles = (startTime, endTime) => {
    // Create a gradient that shows recordings as solid color and gaps as transparent
    if (periods.length === 0) {
      return {};
    }

    const gradientStops = [];
    const duration = endTime - startTime;

    // Sort periods by start time
    const sortedPeriods = [...periods].sort((a, b) => 
      new Date(a.startTime) - new Date(b.startTime)
    );

    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);

    let lastPosition = 0;

    sortedPeriods.forEach(period => {
      const periodStart = new Date(period.startTime);
      const periodEnd = new Date(period.endTime);
      
      const startSeconds = (periodStart - dayStart) / 1000;
      const endSeconds = (periodEnd - dayStart) / 1000;
      
      // Skip periods outside time range
      if (endSeconds < startTime || startSeconds > endTime) {
        return;
      }
      
      // Clip to time range
      const clippedStart = Math.max(startSeconds, startTime);
      const clippedEnd = Math.min(endSeconds, endTime);
      
      // Calculate position relative to time range (0-100%)
      const startPercent = ((clippedStart - startTime) / duration) * 100;
      const endPercent = ((clippedEnd - startTime) / duration) * 100;

      // Gap before this recording
      if (lastPosition < startPercent) {
        gradientStops.push(`rgba(128, 128, 128, 0.3) ${lastPosition}%`);
        gradientStops.push(`rgba(128, 128, 128, 0.3) ${startPercent}%`);
      }

      // Recording period
      gradientStops.push(`#1976d2 ${startPercent}%`);
      gradientStops.push(`#1976d2 ${endPercent}%`);

      lastPosition = endPercent;
    });

    // Gap after last recording
    if (lastPosition < 100) {
      gradientStops.push(`rgba(128, 128, 128, 0.3) ${lastPosition}%`);
      gradientStops.push(`rgba(128, 128, 128, 0.3) 100%`);
    }

    return {
      '& .MuiSlider-rail': {
        background: gradientStops.length > 0 
          ? `linear-gradient(to right, ${gradientStops.join(', ')})`
          : 'rgba(128, 128, 128, 0.3)',
        height: 8,
        opacity: 1,
      },
      '& .MuiSlider-track': {
        display: 'none',
      },
    };
  };

  return (
    <Container maxWidth="xl">
      {/* Camera and Date Selection */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl sx={{ minWidth: 250 }}>
            <InputLabel>Camera</InputLabel>
            <Select
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              label="Camera"
            >
              {cameras.map((camera) => (
                <MenuItem key={camera._id} value={camera._id}>
                  {camera.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            InputLabelProps={{
              shrink: true,
            }}
            sx={{ minWidth: 180 }}
          />

          {loading && <CircularProgress size={24} />}
        </Box>
      </Paper>

      {periods.length === 0 && !loading && selectedCamera && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No recordings found for this date. Select a different date or camera.
        </Alert>
      )}

      {/* Time Selection */}
      {periods.length > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Box>
            {/* Overview timeline - simple line with recordings */}
            <Box
              ref={overviewRef}
              sx={{
                position: 'relative',
                height: '50px',
                width: '100%',
                mb: 1,
                pt: '30px',
              }}
            >
              {/* Recording line - green where there are recordings, red where there aren't */}
              <Box sx={{ position: 'relative', height: '6px', width: '100%' }}>
                {(() => {
                  const dayStart = new Date(selectedDate);
                  dayStart.setHours(0, 0, 0, 0);
                  
                  // Sort periods
                  const sortedPeriods = [...periods].sort((a, b) => 
                    new Date(a.startTime) - new Date(b.startTime)
                  );
                  
                  const segments = [];
                  let currentPos = 0;
                  
                  sortedPeriods.forEach((period, idx) => {
                    const periodStart = new Date(period.startTime);
                    const periodEnd = new Date(period.endTime);
                    const startSeconds = (periodStart - dayStart) / 1000;
                    const endSeconds = (periodEnd - dayStart) / 1000;
                    
                    // Red gap before this recording
                    if (startSeconds > currentPos) {
                      segments.push(
                        <Box
                          key={`gap-${idx}`}
                          sx={{
                            position: 'absolute',
                            left: `${(currentPos / 86400) * 100}%`,
                            width: `${((startSeconds - currentPos) / 86400) * 100}%`,
                            height: '100%',
                            background: '#d32f2f',
                          }}
                        />
                      );
                    }
                    
                    // Green recording
                    segments.push(
                      <Box
                        key={`rec-${idx}`}
                        sx={{
                          position: 'absolute',
                          left: `${(startSeconds / 86400) * 100}%`,
                          width: `${((endSeconds - startSeconds) / 86400) * 100}%`,
                          height: '100%',
                          background: '#4caf50',
                        }}
                      />
                    );
                    
                    currentPos = endSeconds;
                  });
                  
                  // Red gap at the end
                  if (currentPos < 86400) {
                    segments.push(
                      <Box
                        key="gap-end"
                        sx={{
                          position: 'absolute',
                          left: `${(currentPos / 86400) * 100}%`,
                          width: `${((86400 - currentPos) / 86400) * 100}%`,
                          height: '100%',
                          background: '#d32f2f',
                        }}
                      />
                    );
                  }
                  
                  return segments;
                })()}
              </Box>
              
              {/* Selection box */}
              <Box
                sx={{
                  position: 'absolute',
                  left: `${(selectionStart / 86400) * 100}%`,
                  width: `${((selectionEnd - selectionStart) / 86400) * 100}%`,
                  top: '30px',
                  height: '6px',
                  border: '2px solid #1976d2',
                  cursor: 'move',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                  background: 'transparent',
                }}
                onMouseDown={(e) => handleOverviewMouseDown(e, 'move')}
              >
                {/* Start time label */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: 0,
                    top: -26,
                    transform: 'translateX(-50%)',
                    background: '#1976d2',
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                  }}
                >
                  {secondsToTime(selectionStart)}
                </Box>
                
                {/* End time label */}
                <Box
                  sx={{
                    position: 'absolute',
                    right: 0,
                    top: -26,
                    transform: 'translateX(50%)',
                    background: '#1976d2',
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                  }}
                >
                  {secondsToTime(selectionEnd)}
                </Box>
                
                {/* Left resize handle */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: -6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '12px',
                    height: '20px',
                    background: '#1976d2',
                    borderRadius: '3px',
                    cursor: 'ew-resize',
                    '&:hover': {
                      background: '#1565c0',
                    },
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleOverviewMouseDown(e, 'left');
                  }}
                />
                
                {/* Right resize handle */}
                <Box
                  sx={{
                    position: 'absolute',
                    right: -6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '12px',
                    height: '20px',
                    background: '#1976d2',
                    borderRadius: '3px',
                    cursor: 'ew-resize',
                    '&:hover': {
                      background: '#1565c0',
                    },
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleOverviewMouseDown(e, 'right');
                  }}
                />
              </Box>
            </Box>
            
            {/* Hour labels */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 0.5 }}>
              {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((hour) => (
                <Typography key={hour} variant="caption" color="text.secondary">
                  {hour.toString().padStart(2, '0')}:00
                </Typography>
              ))}
            </Box>
          </Box>
        </Paper>
      )}

      {/* Video Player */}
      {currentRecording && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Box sx={{ maxWidth: '640px', margin: '0 auto' }}>
            <Box sx={{ position: 'relative', width: '640px', height: '360px' }}>
              <div 
                data-vjs-player 
                style={{ 
                  width: '100%', 
                  height: '100%' 
                }}
              >
                <video
                  ref={videoRef}
                  className="video-js vjs-big-play-centered"
                  playsInline
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            </Box>
          </Box>
        </Paper>
      )}

      {/* Playback Slider */}
      {periods.length > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Box sx={{ px: 1 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Detailed View: {secondsToTime(timelineValue)}
              {isTimeInRecording(timelineValue) && (
                <Chip 
                  label="Recording Available" 
                  size="small" 
                  color="success" 
                  sx={{ ml: 2 }} 
                />
              )}
            </Typography>
            
            {/* Slider container with playback indicator */}
            <Box sx={{ position: 'relative' }}>
              <Slider
                value={timelineValue}
                onChange={handleTimelineChange}
                onChangeCommitted={handleTimelineChangeCommitted}
                min={selectionStart}
                max={selectionEnd}
                step={1}
                marks={timeMarks}
                valueLabelDisplay="auto"
                valueLabelFormat={secondsToTime}
                sx={getSliderStyles(selectionStart, selectionEnd)}
              />
              
              {/* Vertical playback position indicator */}
              <Box
                sx={{
                  position: 'absolute',
                  left: `${((timelineValue - selectionStart) / (selectionEnd - selectionStart)) * 100}%`,
                  top: 0,
                  bottom: 0,
                  width: '2px',
                  background: '#d32f2f',
                  pointerEvents: 'none',
                  zIndex: 10,
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: -4,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 0,
                    height: 0,
                    borderLeft: '4px solid transparent',
                    borderRight: '4px solid transparent',
                    borderTop: '6px solid #d32f2f',
                  },
                }}
              />
            </Box>
            
            <Typography variant="caption" color="text.secondary">
              Blue sections indicate available recordings. Red line shows current position. Drag to precise time and release to start playback.
            </Typography>
          </Box>
        </Paper>
      )}

      {!currentRecording && selectedCamera && periods.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Use the timeline slider above to select a time to start playback.
        </Alert>
      )}
    </Container>
  );
}

export default Playback;
