import type { LatLng } from "@/types/route";

export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    const latitudeResult = decodeValue(encoded, index);
    index = latitudeResult.index;
    lat += latitudeResult.value;

    const longitudeResult = decodeValue(encoded, index);
    index = longitudeResult.index;
    lng += longitudeResult.value;

    points.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }

  return points;
}

function decodeValue(encoded: string, startIndex: number) {
  let result = 0;
  let shift = 0;
  let index = startIndex;
  let byte = 0;

  do {
    byte = encoded.charCodeAt(index) - 63;
    index += 1;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20 && index < encoded.length);

  return {
    index,
    value: result & 1 ? ~(result >> 1) : result >> 1,
  };
}
