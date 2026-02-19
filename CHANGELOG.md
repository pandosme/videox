# Changelog

All notable changes to the VideoX VMS project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-02-19

### Added
- **Low-Latency HLS (LL-HLS)**: Live streams now use fMP4 segments with 500 ms parts
  - Latency reduced from 5–10 seconds to ~1–2 seconds
  - Implements LL-HLS blocking-reload protocol (HLS spec §6.2.5.2) — clients are held until the requested part is written by FFmpeg, then responded to immediately
  - `EventEmitter` + `fs.watch` per stream for zero-polling part notification
  - Dedicated `/hls/:cameraId/playlist.m3u8` route handles blocking requests; segment files (`.m4s`, `init.mp4`) served statically as before
  - Video.js frontend updated with VHS `llhls: true` and `overrideNative: true` for full browser support including Safari

- **Automatic Camera GOP Configuration**: When a camera is added, VideoX now sets the H.264 GOV length on the camera via VAPIX
  - Tries modern `videoencoder.cgi` API first (AXIS OS 6.x+), falls back to legacy `param.cgi`
  - Default GOV = `fps × 2` (e.g. 25 fps → GOV 50 = keyframe every 2 seconds)
  - Non-fatal: if VAPIX call fails, recording continues with camera's existing GOP

### Changed
- **Recording: H.264 Passthrough** (`-c:v copy`, `-c:a copy`)
  - Replaced `libx264` re-encoding with direct passthrough of the camera's H.264/Zipstream output
  - Eliminates per-camera CPU decode+encode cycle
  - Fully preserves Axis Zipstream compression (30–80 % smaller files, original quality)
  - Frame-accurate seeking unchanged — two-pass FFmpeg seek in playback/export reads the MP4 moov index
- **Live Streaming: `-c:a copy`** — audio is also passed through directly (Axis cameras output AAC natively)
- **Storage View**: Replaced Continuous Segments, Retention (Days), Oldest and Newest columns with Model, Serial and Age (days since oldest recording)

## [1.1.0] - 2026-01-04

### Added
- **Keyframe Management**: Recordings now use forced keyframes every 2 seconds for precise timestamp seeking
  - Configured with `-force_key_frames expr:gte(t,n_forced*2)` in FFmpeg
  - GOP size set to 60 frames (2 seconds at 30fps)
  - Scene change detection disabled for consistent keyframe intervals

- **Two-Pass Seeking in Export-Clip API**: Optimized clip export with fast and accurate seeking
  - Input seek: Fast jump to nearest keyframe (2 seconds before target)
  - Output seek: Precise trim to exact timestamp
  - Significantly improved export performance while maintaining frame accuracy

- **Timestamp-Based Seeking in Stream-by-Time API**: New FFmpeg-based seeking mode
  - Added `seekMode` parameter: 'timestamp' (default) or 'bytes'
  - Timestamp mode uses two-pass seeking for precise playback start times
  - Backward compatible with byte-range requests for legacy clients
  - Improved accuracy for event-based playback

- **Test Suite**: Added comprehensive export-clip API test scripts
  - `test/export-test.js`: Automated clip export testing
  - `test/verify-timestamps.sh`: Frame extraction for timestamp verification
  - `test/README.md`: Test documentation

### Changed
- **Recording FFmpeg Parameters**: Switched from `-c:v copy` to `-c:v libx264` with keyframe control
  - Trade-off: Slightly higher CPU usage for significantly better seeking accuracy
  - Using `ultrafast` preset and `zerolatency` tune for minimal latency

- **Export-Clip FFmpeg Parameters**: Optimized for frame accuracy
  - Removed conflicting `-copyts` and `-start_at_zero` flags
  - Re-encodes video for exact timestamp precision

### Improved
- Export-clip API now starts playback at exact requested timestamps
- Stream-by-time API provides frame-accurate playback positioning
- Both APIs now produce consistent results starting at nearly identical timestamps
- Better handling of timestamp boundaries across segment files

### Fixed
- Export clips now start at correct timestamps (previously could be off by several seconds)
- Eliminated timestamp drift when seeking within recordings

### Documentation
- Updated API.md with new seeking modes and keyframe management details
- Added examples for timestamp-based streaming
- Documented two-pass seeking approach and performance characteristics

## [1.0.5] - Previous Release

### Added
- Complete VideoX VMS implementation with documentation
- Camera Management with VAPIX API integration
- Continuous Recording with 60-second MP4 segments
- Live Streaming with HLS
- Recording Playback with browser support
- Retention Management with automated cleanup
- User Management with JWT authentication
- API token support for external integrations

[1.1.0]: https://github.com/yourusername/videox/compare/v1.0.5...v1.1.0
[1.0.5]: https://github.com/yourusername/videox/releases/tag/v1.0.5
