import { useEffect, useRef } from "react";

const FIELD_WIDTH = 240;
const FIELD_HEIGHT = 226;
const DRIFT_SECONDS = 5.4;
const BREATH_SECONDS = 7.2;
const TAU = Math.PI * 2;

const baseColor = [248, 108, 157];

const initialPeaks = [
  { x: 0.08, y: 0.12, strength: 0.78, sx: 0.27, sy: 0.25, phase: 0.2, color: [215, 221, 255], drift: 1.02 },
  { x: 0.60, y: 0.08, strength: 0.42, sx: 0.30, sy: 0.19, phase: 2.0, color: [244, 77, 184], drift: 0.88 },
  { x: 0.51, y: 0.72, strength: 0.88, sx: 0.16, sy: 0.43, phase: 3.1, color: [76, 26, 190], drift: 1.12 },
  { x: 0.87, y: 0.66, strength: 0.86, sx: 0.20, sy: 0.37, phase: 4.4, color: [255, 101, 32], drift: 1.15 },
  { x: 0.06, y: 0.93, strength: 0.86, sx: 0.29, sy: 0.16, phase: 5.2, color: [231, 87, 23], drift: 1.32 },
  { x: 0.55, y: 0.90, strength: 0.28, sx: 0.35, sy: 0.18, phase: 1.1, color: [244, 106, 255], drift: 0.95 },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fract(value) {
  return value - Math.floor(value);
}

function seededRandom(seed, segment, channel) {
  return fract(Math.sin(seed * 19.19 + segment * 73.73 + channel * 37.37) * 43758.5453);
}

function smoothStep(value) {
  return value * value * (3 - 2 * value);
}

function mix(start, end, amount) {
  return start + (end - start) * amount;
}

function motionTarget(peak, index, segment) {
  const drift = peak.drift ?? 1;
  return {
    x: (seededRandom(index + 1, segment, 1) * 2 - 1) * 0.055 * drift,
    y: (seededRandom(index + 1, segment, 2) * 2 - 1) * 0.045 * drift,
    sx: 1 + (seededRandom(index + 1, segment, 3) * 2 - 1) * 0.22 * drift,
    sy: 1 + (seededRandom(index + 1, segment, 4) * 2 - 1) * 0.24 * drift,
    strength: 1 + (seededRandom(index + 1, segment, 5) * 2 - 1) * 0.22 * drift,
  };
}

function animatedPeak(peak, index, elapsedSeconds) {
  const driftPosition = elapsedSeconds / DRIFT_SECONDS + peak.phase * 0.19;
  const segment = Math.floor(driftPosition);
  const amount = smoothStep(driftPosition - segment);
  const current = motionTarget(peak, index, segment);
  const next = motionTarget(peak, index, segment + 1);
  const breathPhase = (elapsedSeconds / BREATH_SECONDS) * TAU + peak.phase;
  const orbitPhase = elapsedSeconds * 0.22 + peak.phase;

  const drift = peak.drift ?? 1;
  const orbitX = Math.cos(orbitPhase) * 0.018 * drift;
  const orbitY = Math.sin(orbitPhase * 0.86) * 0.014 * drift;
  const breath = Math.sin(breathPhase) * 0.10;
  const counterBreath = Math.cos(breathPhase * 0.9) * 0.08;

  return {
    ...peak,
    x: clamp(peak.x + mix(current.x, next.x, amount) + orbitX, -0.08, 1.08),
    y: clamp(peak.y + mix(current.y, next.y, amount) + orbitY, -0.08, 1.08),
    sx: clamp(peak.sx * mix(current.sx, next.sx, amount) * (1 + breath), 0.04, 0.82),
    sy: clamp(peak.sy * mix(current.sy, next.sy, amount) * (1 + counterBreath), 0.04, 0.90),
    strength: clamp(peak.strength * mix(current.strength, next.strength, amount) * (1 + breath * 0.65), 0, 1.24),
  };
}

function peakInfluence(peak, x, y) {
  const dx = (x - peak.x) / peak.sx;
  const dy = (y - peak.y) / peak.sy;
  return peak.strength * Math.exp(-0.5 * (dx * dx + dy * dy));
}

function rgbToHsl([red, green, blue]) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;

  if (max === min) return [0, 0, lightness];

  const difference = max - min;
  const saturation = lightness > 0.5
    ? difference / (2 - max - min)
    : difference / (max + min);
  let hue;

  if (max === r) hue = (g - b) / difference + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / difference + 2;
  else hue = (r - g) / difference + 4;

  return [hue / 6, saturation, lightness];
}

function hslToRgb([hue, saturation, lightness]) {
  if (saturation === 0) {
    const channel = Math.round(lightness * 255);
    return [channel, channel, channel];
  }

  const hueToRgb = (p, q, t) => {
    let next = t;
    if (next < 0) next += 1;
    if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };

  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return [
    Math.round(hueToRgb(p, q, hue + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, hue) * 255),
    Math.round(hueToRgb(p, q, hue - 1 / 3) * 255),
  ];
}

function colorAt(x, y, peaks) {
  const baseHsl = rgbToHsl(baseColor);
  const baseWeight = 0.36;
  let totalWeight = baseWeight;
  let hueVectorX = Math.cos(baseHsl[0] * TAU) * baseHsl[1] * baseWeight;
  let hueVectorY = Math.sin(baseHsl[0] * TAU) * baseHsl[1] * baseWeight;
  let lightnessTotal = baseHsl[2] * baseWeight;

  peaks.forEach((peak) => {
    const influence = peakInfluence(peak, x, y);
    if (influence === 0) return;

    const weight = Math.min(1.25, Math.pow(influence, 1.45) * 2);
    const [hue, saturation, lightness] = rgbToHsl(peak.color);
    totalWeight += weight;
    hueVectorX += Math.cos(hue * TAU) * saturation * weight;
    hueVectorY += Math.sin(hue * TAU) * saturation * weight;
    lightnessTotal += lightness * weight;
  });

  const hue = (Math.atan2(hueVectorY, hueVectorX) / TAU + 1) % 1;
  const saturation = Math.min(0.98, Math.max(0.18, Math.hypot(hueVectorX, hueVectorY) / totalWeight * 1.45));
  const lightness = Math.min(0.70, Math.max(0.40, lightnessTotal / totalWeight));
  return hslToRgb([hue, saturation, lightness]);
}

export function FluidGradientBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const workCanvas = document.createElement("canvas");
    const workContext = workCanvas.getContext("2d");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frameId;
    let canvasWidth = 0;
    let canvasHeight = 0;

    workCanvas.width = FIELD_WIDTH;
    workCanvas.height = FIELD_HEIGHT;
    workContext.imageSmoothingEnabled = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvasWidth = Math.max(1, Math.round(rect.width * devicePixelRatio));
      canvasHeight = Math.max(1, Math.round(rect.height * devicePixelRatio));
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
    };

    const render = (timestamp) => {
      const elapsedSeconds = reducedMotion ? 0 : timestamp / 1000;
      const image = workContext.createImageData(FIELD_WIDTH, FIELD_HEIGHT);
      const currentPeaks = initialPeaks.map((peak, index) => animatedPeak(peak, index, elapsedSeconds));

      for (let y = 0; y < FIELD_HEIGHT; y += 1) {
        for (let x = 0; x < FIELD_WIDTH; x += 1) {
          const color = colorAt((x + 0.5) / FIELD_WIDTH, (y + 0.5) / FIELD_HEIGHT, currentPeaks);
          const pixelIndex = (y * FIELD_WIDTH + x) * 4;
          image.data[pixelIndex] = color[0];
          image.data[pixelIndex + 1] = color[1];
          image.data[pixelIndex + 2] = color[2];
          image.data[pixelIndex + 3] = 255;
        }
      }

      workContext.putImageData(image, 0, 0);
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      context.imageSmoothingEnabled = true;
      context.drawImage(workCanvas, 0, 0, canvasWidth, canvasHeight);

      if (!reducedMotion) frameId = window.requestAnimationFrame(render);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    frameId = window.requestAnimationFrame(render);

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return <canvas className="window-gradient-bg" ref={canvasRef} aria-hidden="true" />;
}
