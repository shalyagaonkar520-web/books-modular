/** Take a photo with the device camera, right inside the app (works on phones and laptops). */
import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';

import { cameraProblem } from './media';

interface Props {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

export function CameraCapture({ open, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let active = true;
    setProblem(null);
    setReady(false);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 } }, audio: false })
      .then((s) => {
        if (!active) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().then(() => active && setReady(true));
        }
      })
      .catch((err) => active && setProblem(cameraProblem(err)));
    return () => {
      active = false;
      stream?.getTracks().forEach((t) => t.stop()); // the camera light goes off when the dialog closes
    };
  }, [open]);

  if (!open) return null;

  const snap = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        onClose();
      },
      'image/jpeg',
      0.9,
    );
  };

  return (
    <div className="cam-overlay" role="dialog" aria-modal="true" aria-label="Take a photo">
      <div className="cam-card">
        <button type="button" className="ws-tool cam-close" aria-label="Close camera" onClick={onClose}>
          <X size={18} />
        </button>
        {problem ? (
          <p className="cam-problem">{problem}</p>
        ) : (
          <video ref={videoRef} className="cam-video" playsInline muted aria-label="Camera preview" />
        )}
        <div className="cam-actions">
          <Button onClick={onClose}>Cancel</Button>
          {problem ? null : (
            <Button variant="primary" icon={<Camera size={16} />} disabled={!ready} onClick={snap}>
              Take photo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
