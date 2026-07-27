import { extname } from "node:path";

const MEDIA_TYPES = new Map([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".css", "text/css;charset=utf-8"],
  [".csv", "text/csv;charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html;charset=utf-8"],
  [".htm", "text/html;charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript;charset=utf-8"],
  [".json", "application/json;charset=utf-8"],
  [".mjs", "text/javascript;charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".mp4", "video/mp4"],
  [".ndjson", "application/x-ndjson;charset=utf-8"],
  [".ogg", "audio/ogg"],
  [".otf", "font/otf"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".tsv", "text/tab-separated-values;charset=utf-8"],
  [".ttf", "font/ttf"],
  [".txt", "text/plain;charset=utf-8"],
  [".wav", "audio/wav"],
  [".webm", "video/webm"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml;charset=utf-8"],
]);

export function mediaTypeForPath(path) {
  return (
    MEDIA_TYPES.get(extname(path).toLowerCase()) ??
    "application/octet-stream"
  );
}

export function toDataUri(buffer, mediaType) {
  return `data:${mediaType};base64,${Buffer.from(buffer).toString("base64")}`;
}
