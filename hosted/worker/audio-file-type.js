// The upload API accepts only these five audio containers. Keep its parser's
// fallback detection self-contained; general file detection includes Node-only
// runtime imports that cannot be loaded by the hosted Worker.
export async function fileTypeFromBuffer(bytes) {
  const text = new TextDecoder('ascii').decode(bytes.subarray(0, 12));
  if (text.startsWith('ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224)) return { ext: 'mp3', mime: 'audio/mpeg' };
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WAVE') return { ext: 'wav', mime: 'audio/wav' };
  if (text.startsWith('fLaC')) return { ext: 'flac', mime: 'audio/flac' };
  if (text.startsWith('OggS')) return { ext: 'ogg', mime: 'audio/ogg' };
  if (text.slice(4, 8) === 'ftyp') return { ext: 'm4a', mime: 'audio/mp4' };
  return undefined;
}
