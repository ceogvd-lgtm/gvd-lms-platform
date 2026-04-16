'use client';

/* eslint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/media-has-caption --
   Custom video player: the container needs tabIndex=0 to focus for
   keyboard shortcuts, and the <video> onClick is a standard
   click-to-play pattern. Keyboard nav already works via the window
   keydown listener, so the a11y rules are false positives here. */

import { cn } from '@lms/ui';
import { Maximize2, Minimize2, Pause, Play, Settings, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useAuthStore } from '@/lib/auth-store';
import { videoApi, type VideoProgressRow } from '@/lib/theory-engine';

interface VideoPlayerProps {
  lessonId: string;
  src: string;
  poster?: string;
  /** Callback when the video crosses the completion threshold. */
  onComplete?: () => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const HEARTBEAT_MS = 10_000;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Custom HTML5 video player with:
 *   - play/pause + volume + speed + fullscreen + time display
 *   - resume from VideoProgress.lastPosition (via /video/:id/progress GET)
 *   - 10-second heartbeat POST to /video/:id/progress
 *   - Keyboard: Space / ← → / ↑ ↓ / F / M
 *   - Fires `onComplete` exactly once, when the server flips isCompleted.
 *
 * The player deliberately does NOT call `/lessons/:id/complete` itself —
 * that endpoint also checks the quiz. It just emits `onComplete` and the
 * parent orchestrator decides what to do next.
 */
export function VideoPlayer({ lessonId, src, poster, onComplete }: VideoPlayerProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const heartbeatRef = useRef<number | null>(null);
  const completeFiredRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  // =====================================================
  // Initial resume — fetch last position on mount
  // =====================================================
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    videoApi.get(lessonId, accessToken).then((row: VideoProgressRow | null) => {
      if (cancelled || !row || !videoRef.current) return;
      if (row.lastPosition > 5 && row.lastPosition < row.duration - 5) {
        toast('Tiếp tục từ ' + formatTime(row.lastPosition) + '?', {
          duration: 8000,
          action: {
            label: 'Tiếp tục',
            onClick: () => {
              if (videoRef.current) videoRef.current.currentTime = row.lastPosition;
            },
          },
          cancel: {
            label: 'Xem lại từ đầu',
            onClick: () => {
              if (videoRef.current) videoRef.current.currentTime = 0;
            },
          },
        });
      }
      if (row.isCompleted) completeFiredRef.current = true;
    });
    return () => {
      cancelled = true;
    };
    // We deliberately only resume once when the video mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, lessonId]);

  // =====================================================
  // Heartbeat — every 10 s while playing
  // =====================================================
  const heartbeat = useCallback(async () => {
    const el = videoRef.current;
    if (!el || !accessToken) return;
    if (!isFinite(el.duration) || el.duration <= 0) return;

    try {
      const res = await videoApi.track(
        lessonId,
        {
          watchedSeconds: Math.floor(el.currentTime),
          duration: Math.floor(el.duration),
          lastPosition: Math.floor(el.currentTime),
        },
        accessToken,
      );
      if (res.isCompleted && !completeFiredRef.current) {
        completeFiredRef.current = true;
        onComplete?.();
      }
    } catch {
      // Swallow — heartbeat errors are not fatal to playback.
    }
  }, [accessToken, lessonId, onComplete]);

  useEffect(() => {
    if (!playing) {
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }
    heartbeatRef.current = window.setInterval(heartbeat, HEARTBEAT_MS);
    // Immediately send one so the user sees "pick up where you left off"
    // the next time even without waiting the full 10 s.
    heartbeat();
    return () => {
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [playing, heartbeat]);

  // =====================================================
  // Fullscreen sync
  // =====================================================
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // =====================================================
  // Keyboard shortcuts — scoped to the container so they don't conflict
  // with the rest of the page.
  // =====================================================
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = videoRef.current;
      if (!el) return;
      // Ignore when focus is in an input / textarea / contenteditable.
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      const container = containerRef.current;
      if (!container) return;
      // Only fire when the container (or its descendant) has focus or is
      // visible in viewport. Using "document.activeElement is inside" is
      // the cheap check.
      if (!container.contains(document.activeElement) && !container.matches(':hover')) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          el.paused ? el.play() : el.pause();
          break;
        case 'ArrowRight':
          el.currentTime = Math.min(el.duration, el.currentTime + 5);
          break;
        case 'ArrowLeft':
          el.currentTime = Math.max(0, el.currentTime - 5);
          break;
        case 'ArrowUp':
          el.volume = Math.min(1, el.volume + 0.1);
          setVolume(el.volume);
          break;
        case 'ArrowDown':
          el.volume = Math.max(0, el.volume - 0.1);
          setVolume(el.volume);
          break;
        case 'f':
        case 'F':
          if (!document.fullscreenElement) container.requestFullscreen();
          else document.exitFullscreen();
          break;
        case 'm':
        case 'M':
          el.muted = !el.muted;
          setMuted(el.muted);
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // =====================================================
  // Event wiring
  // =====================================================
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      // Force a final heartbeat so server sees watchedSeconds = duration.
      heartbeat();
    };
    const onTime = () => setCurrent(el.currentTime);
    const onLoaded = () => setDuration(el.duration || 0);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onLoaded);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onLoaded);
    };
  }, [heartbeat]);

  // =====================================================
  // Auto-hide controls while playing
  // =====================================================
  useEffect(() => {
    if (!playing) {
      setControlsVisible(true);
      return;
    }
    const t = window.setTimeout(() => setControlsVisible(false), 2500);
    return () => window.clearTimeout(t);
  }, [playing, current]);

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) el.play();
    else el.pause();
  }

  function toggleMute() {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }

  function setSeek(pct: number) {
    const el = videoRef.current;
    if (!el || !isFinite(el.duration)) return;
    el.currentTime = el.duration * pct;
  }

  function changeSpeed(rate: number) {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = rate;
    setSpeed(rate);
    setShowSpeed(false);
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="Trình phát video"
      onMouseMove={() => setControlsVisible(true)}
      className={cn(
        'group relative overflow-hidden rounded-card bg-black outline-none',
        fullscreen ? 'w-screen h-screen' : 'aspect-video w-full',
      )}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload="metadata"
        className="h-full w-full bg-black"
        onClick={togglePlay}
      />

      {/* Controls */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10 text-white transition-opacity',
          controlsVisible ? 'opacity-100' : 'opacity-0',
        )}
      >
        {/* Seekbar */}
        <div
          className="relative h-1.5 cursor-pointer rounded-full bg-white/20"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            setSeek(Math.max(0, Math.min(1, pct)));
          }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: duration > 0 ? `${(current / duration) * 100}%` : '0%' }}
          />
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={togglePlay}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            aria-label={playing ? 'Tạm dừng' : 'Phát'}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-white/10"
              aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'}
            >
              {muted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              aria-label="Âm lượng"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                setMuted(false);
                if (videoRef.current) {
                  videoRef.current.volume = v;
                  videoRef.current.muted = false;
                }
              }}
              className="h-1 w-20 accent-primary"
            />
          </div>

          <span className="tabular-nums">
            {formatTime(current)} / {formatTime(duration)}
          </span>

          <div className="ml-auto flex items-center gap-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSpeed((s) => !s)}
                className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs hover:bg-white/10"
              >
                <Settings className="h-3.5 w-3.5" />
                {speed}x
              </button>
              {showSpeed && (
                <div className="absolute bottom-9 right-0 flex flex-col rounded-card border border-white/20 bg-black/90 p-1 text-xs">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => changeSpeed(s)}
                      className={cn(
                        'px-3 py-1 text-left hover:bg-white/10',
                        s === speed && 'font-semibold text-primary',
                      )}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
                else document.exitFullscreen();
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-white/10"
              aria-label="Toàn màn hình"
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
