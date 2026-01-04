# Changelog

All notable changes to the VideoX VMS project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
