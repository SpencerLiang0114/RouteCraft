export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_ROUTE_POINTS = 50_000;
export const MAX_XML_CHARS = 5 * 1024 * 1024;
export const MAX_XML_DEPTH = 64;

export function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function assertUploadSize(bytesOrStringLength: number): void {
  if (!Number.isFinite(bytesOrStringLength) || bytesOrStringLength < 0) {
    throw new Error("Invalid upload size.");
  }
  if (bytesOrStringLength > MAX_UPLOAD_BYTES || bytesOrStringLength > MAX_XML_CHARS) {
    throw new Error(`File is too large. Maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`);
  }
}

export function sanitizeCoordinate(lat: number, lng: number): { lat: number; lng: number } {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Invalid coordinates.");
  }
  if (lat < -90 || lat > 90) {
    throw new Error("Latitude must be between -90 and 90.");
  }
  if (lng < -180 || lng > 180) {
    throw new Error("Longitude must be between -180 and 180.");
  }
  return { lat, lng };
}

export function normalizeElevation(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  const value = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(value)) {
    return null;
  }
  return value;
}

/** Scan tags and return max nesting depth (comments/CDATA/declarations ignored). */
export function countXmlDepth(xml: string): number {
  let depth = 0;
  let maxDepth = 0;
  let i = 0;

  while (i < xml.length) {
    if (xml[i] !== "<") {
      i += 1;
      continue;
    }

    if (xml.startsWith("<!--", i)) {
      const end = xml.indexOf("-->", i + 4);
      i = end === -1 ? xml.length : end + 3;
      continue;
    }

    if (xml.startsWith("<![CDATA[", i)) {
      const end = xml.indexOf("]]>", i + 9);
      i = end === -1 ? xml.length : end + 3;
      continue;
    }

    const next = xml[i + 1];
    if (next === "?" || next === "!") {
      const end = xml.indexOf(">", i + 2);
      i = end === -1 ? xml.length : end + 1;
      continue;
    }

    const end = xml.indexOf(">", i + 1);
    if (end === -1) {
      break;
    }

    const isClosing = next === "/";
    const isSelfClosing = xml[end - 1] === "/";

    if (isClosing) {
      depth = Math.max(0, depth - 1);
    } else if (!isSelfClosing) {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
    }

    i = end + 1;
  }

  return maxDepth;
}

export function rejectDeepXml(xml: string, maxDepth: number = MAX_XML_DEPTH): void {
  if (countXmlDepth(xml) > maxDepth) {
    throw new Error("XML nesting is too deep.");
  }
}

export function assertPointCount(n: number): void {
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Invalid point count.");
  }
  if (n > MAX_ROUTE_POINTS) {
    throw new Error(`Route has too many points. Maximum is ${MAX_ROUTE_POINTS.toLocaleString()}.`);
  }
}

export function assertParsableXml(xml: string, invalidMessage: string): Document {
  assertUploadSize(xml.length);
  rejectDeepXml(xml);

  const document = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) {
    throw new Error(invalidMessage);
  }
  return document;
}

export function computeElevationGainM(elevations: Array<number | null>): number {
  let gain = 0;
  for (let index = 1; index < elevations.length; index += 1) {
    const prev = elevations[index - 1];
    const current = elevations[index];
    if (prev === null || current === null) continue;
    const delta = current - prev;
    if (delta > 0) gain += delta;
  }
  return gain;
}
