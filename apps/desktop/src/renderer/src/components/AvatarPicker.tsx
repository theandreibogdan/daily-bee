import { Avatar, Button, Dialog } from '@dailybee/ui';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from '../store';

/** Saved picture: a square JPEG this many pixels wide (about 6–12 KB), kept in the profile's settings. */
const OUT = 160;
/** The crop viewport, in CSS pixels. */
const VIEW = 240;
const MAX_ZOOM = 3;
const MAX_BYTES = 12 * 1024 * 1024;

interface Crop { zoom: number; x: number; y: number }

/** Decode a picked file as a data URL (the renderer's CSP allows data: images, not blob:); formats Chromium cannot read (HEIC, some TIFFs) reject here. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error('Could not read that image. Use a JPG, PNG, WebP or GIF.'));
    const reader = new FileReader();
    reader.onerror = fail;
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = fail;
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/** Where the image sits in the viewport for a crop: covers the square at zoom 1, panned by (x, y). */
function place(img: HTMLImageElement, crop: Crop, view: number) {
  const s = (view / Math.min(img.naturalWidth, img.naturalHeight)) * crop.zoom;
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  return { left: view / 2 - w / 2 + crop.x, top: view / 2 - h / 2 + crop.y, w, h };
}

/** Keep the picture covering the whole circle: the pan can never show the edge. */
function clamp(img: HTMLImageElement, crop: Crop, view: number): Crop {
  const { w, h } = place(img, { ...crop, x: 0, y: 0 }, view);
  const mx = Math.max(0, (w - view) / 2), my = Math.max(0, (h - view) / 2);
  return { zoom: crop.zoom, x: Math.min(mx, Math.max(-mx, crop.x)), y: Math.min(my, Math.max(-my, crop.y)) };
}

function render(img: HTMLImageElement, crop: Crop): string {
  const canvas = document.createElement('canvas');
  canvas.width = OUT; canvas.height = OUT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not draw the picture');
  const k = OUT / VIEW;
  const p = place(img, crop, VIEW);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, OUT, OUT);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, p.left * k, p.top * k, p.w * k, p.h * k);
  return canvas.toDataURL('image/jpeg', 0.86);
}

/**
 * Settings › Profile › picture: the current avatar with Choose and Remove. A chosen file opens the
 * crop dialog; the result is saved straight into settings.profile.avatar (no Save changes needed),
 * and `onSaved` lets the settings form keep its draft in step.
 */
export function ProfilePictureRow({ avatar, initials, onSaved }: { avatar: string; initials: string; onSaved: (avatar: string) => void }) {
  const showToast = useStore((s) => s.showToast);
  const updateSettings = useStore((s) => s.updateSettings);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { showToast('That is not an image file', 'danger'); return; }
    if (f.size > MAX_BYTES) { showToast('That picture is larger than 12 MB; pick a smaller one', 'danger'); return; }
    setFile(f);
  };
  const save = async (dataUrl: string) => {
    setBusy(true);
    try { await updateSettings({ profile: { avatar: dataUrl } }); onSaved(dataUrl); showToast(dataUrl ? 'Profile picture saved' : 'Profile picture removed'); }
    finally { setBusy(false); setFile(null); }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <Avatar initials={initials || '··'} src={avatar} size={56} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ font: 'var(--type-label)' }}>Profile picture</div>
        <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', marginTop: 2 }}>{avatar ? 'Shown in the sidebar, on the lock screen and in the profile list. Stays on this device.' : 'Your initials until you choose one. Stays on this device; never sent to a workspace.'}</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button size="sm" variant="secondary" icon="image" disabled={busy} onClick={() => input.current?.click()}>{avatar ? 'Change picture…' : 'Choose picture…'}</Button>
        {avatar && <Button size="sm" variant="ghost" icon="x" disabled={busy} onClick={() => void save('')}>Remove</Button>}
      </div>
      <input ref={input} type="file" accept="image/*" aria-label="Profile picture file" style={{ display: 'none' }} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {file && <CropDialog file={file} onCancel={() => setFile(null)} onSave={(d) => void save(d)} onChangeFile={() => input.current?.click()} />}
    </div>
  );
}

/** Frame the picture: drag to move it, zoom with the slider; what is inside the circle is saved. */
function CropDialog({ file, onCancel, onSave, onChangeFile }: { file: File; onCancel: () => void; onSave: (dataUrl: string) => void; onChangeFile: () => void }) {
  const showToast = useStore((s) => s.showToast);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  useEffect(() => {
    let alive = true;
    setImg(null);
    setCrop({ zoom: 1, x: 0, y: 0 });
    loadImage(file).then((i) => { if (alive) setImg(i); }).catch((e: Error) => { showToast(e.message, 'danger'); onCancel(); });
    return () => { alive = false; };
  }, [file, onCancel, showToast]);
  const down = (e: ReactPointerEvent) => { drag.current = { px: e.clientX, py: e.clientY, x: crop.x, y: crop.y }; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ } };
  const move = (e: ReactPointerEvent) => { const d = drag.current; if (!d || !img) return; setCrop(clamp(img, { ...crop, x: d.x + (e.clientX - d.px), y: d.y + (e.clientY - d.py) }, VIEW)); };
  const up = () => { drag.current = null; };
  const zoom = (z: number) => { if (img) setCrop(clamp(img, { ...crop, zoom: z }, VIEW)); };
  const p = img ? place(img, crop, VIEW) : null;
  const save = () => { if (!img) return; try { onSave(render(img, crop)); } catch (e) { showToast(e instanceof Error ? e.message : String(e), 'danger'); } };
  return (
    <Dialog open onClose={onCancel} width={420} title="Frame your picture" description="Drag to move it, zoom with the slider. What is inside the circle is saved."
      footer={<><Button variant="ghost" onClick={onChangeFile}>Different file…</Button><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button icon="check" disabled={!img} onClick={save}>Save picture</Button></>}>
      <div style={{ display: 'grid', gap: 16, justifyItems: 'center' }}>
        <div role="img" aria-label="Picture preview" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          style={{ position: 'relative', width: VIEW, height: VIEW, borderRadius: '50%', overflow: 'hidden', background: 'var(--hive-100)', boxShadow: '0 0 0 1px var(--border-default), 0 0 0 6px var(--honey-50)', cursor: img ? 'grab' : 'default', touchAction: 'none', userSelect: 'none' }}>
          {img && p && <img src={img.src} alt="" draggable={false} style={{ position: 'absolute', left: p.left, top: p.top, width: p.w, height: p.h, maxWidth: 'none', pointerEvents: 'none' }} />}
          {!img && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>Reading the picture…</span>}
        </div>
        <label style={{ display: 'grid', gap: 6, width: VIEW, font: 'var(--type-caption)', color: 'var(--text-secondary)' }}>
          <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>Zoom</span><span style={{ font: 'var(--type-mono)', fontSize: 'var(--text-xs)' }}>{crop.zoom.toFixed(2)}×</span></span>
          <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={crop.zoom} disabled={!img} onChange={(e) => zoom(Number(e.target.value))} aria-label="Zoom" style={{ width: '100%', accentColor: 'var(--honey-500)' }} />
        </label>
        <div style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)', textAlign: 'center' }}>{file.name}{img ? ` · ${img.naturalWidth}×${img.naturalHeight}` : ''} · saved as a {OUT}px square</div>
      </div>
    </Dialog>
  );
}
