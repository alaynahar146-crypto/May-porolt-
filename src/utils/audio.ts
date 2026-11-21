import type { MediaImage } from "../types";

export function compressImageFile(file: File): Promise<MediaImage> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Image load timeout"));
    }, 15000);

    img.onload = () => {
      if (settled) return;
      settled = true;
      const canvas = document.createElement("canvas");
      try {
        const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          reject(new Error("Canvas unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        canvas.width = 0;
        canvas.height = 0;
        cleanup();
        resolve({
          mime: "image/jpeg",
          data: dataUrl.split(",")[1] || "",
          previewUrl: dataUrl,
        });
      } catch (err) {
        canvas.width = 0;
        canvas.height = 0;
        cleanup();
        reject(err);
      }
    };

    img.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Failed to read image"));
    };

    img.src = objectUrl;
  });
}

export async function encodeBlobToWav16k(blob: Blob): Promise<Blob> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const ratio = audioBuffer.sampleRate / 16000;
    const length = Math.floor(channelData.length / ratio);
    const pcm = new Int16Array(length);

    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[Math.floor(i * ratio)] || 0));
      pcm[i] = sample * 32767;
    }

    const header = new DataView(new ArrayBuffer(44));
    const writeStr = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i++) {
        header.setUint8(offset + i, text.charCodeAt(i));
      }
    };

    writeStr(0, "RIFF");
    header.setUint32(4, 36 + length * 2, true);
    writeStr(8, "WAVEfmt ");
    header.setUint32(16, 16, true);
    header.setUint16(20, 1, true);
    header.setUint16(22, 1, true);
    header.setUint32(24, 16000, true);
    header.setUint32(28, 32000, true);
    header.setUint16(32, 2, true);
    header.setUint16(34, 16, true);
    writeStr(36, "data");
    header.setUint32(40, length * 2, true);

    return new Blob([header, pcm], { type: "audio/wav" });
  } finally {
    await ctx.close().catch(() => {});
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read audio"));
    reader.readAsDataURL(blob);
  });
}
