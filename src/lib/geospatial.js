function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizePoint(point) {
  if (!point || typeof point !== "object") {
    return null;
  }

  const x = asNumber(point.x !== undefined ? point.x : point.longitude);
  const y = asNumber(point.y !== undefined ? point.y : point.latitude);

  if (x === null || y === null) {
    return null;
  }

  return { minX: x, minY: y, maxX: x, maxY: y };
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== "object") {
    return null;
  }

  const minX = asNumber(bounds.minX !== undefined ? bounds.minX : bounds.xmin);
  const minY = asNumber(bounds.minY !== undefined ? bounds.minY : bounds.ymin);
  const maxX = asNumber(bounds.maxX !== undefined ? bounds.maxX : bounds.xmax);
  const maxY = asNumber(bounds.maxY !== undefined ? bounds.maxY : bounds.ymax);

  if ([minX, minY, maxX, maxY].some((value) => value === null)) {
    return null;
  }

  return {
    minX: Math.min(minX, maxX),
    minY: Math.min(minY, maxY),
    maxX: Math.max(minX, maxX),
    maxY: Math.max(minY, maxY)
  };
}

function expandBounds(base, point) {
  if (!base) {
    return point;
  }

  return {
    minX: Math.min(base.minX, point.minX),
    minY: Math.min(base.minY, point.minY),
    maxX: Math.max(base.maxX, point.maxX),
    maxY: Math.max(base.maxY, point.maxY)
  };
}

function boundsFromCoordinates(coordinates) {
  if (!Array.isArray(coordinates)) {
    return null;
  }

  let resolved = null;

  for (const item of coordinates) {
    if (Array.isArray(item) && item.length >= 2 && !Array.isArray(item[0])) {
      const point = normalizePoint({ x: item[0], y: item[1] });
      resolved = expandBounds(resolved, point);
      continue;
    }

    const nested = boundsFromCoordinates(item);
    if (nested) {
      resolved = expandBounds(resolved, nested);
    }
  }

  return resolved;
}

function normalizeRingPoints(ring) {
  if (!Array.isArray(ring)) {
    return [];
  }

  return ring
    .map((item) => {
      if (!Array.isArray(item) || item.length < 2) {
        return null;
      }

      const x = asNumber(item[0]);
      const y = asNumber(item[1]);
      if (x === null || y === null) {
        return null;
      }

      return { x, y };
    })
    .filter(Boolean);
}

function normalizePolygonRings(polygon) {
  if (!polygon || typeof polygon !== "object") {
    return [];
  }

  if (Array.isArray(polygon.rings)) {
    return polygon.rings.map(normalizeRingPoints).filter((ring) => ring.length >= 3);
  }

  if (Array.isArray(polygon.coordinates)) {
    return polygon.coordinates.map(normalizeRingPoints).filter((ring) => ring.length >= 3);
  }

  if (Array.isArray(polygon)) {
    return polygon.map(normalizeRingPoints).filter((ring) => ring.length >= 3);
  }

  return [];
}

function getBoundsCenter(bounds) {
  if (!bounds) {
    return null;
  }

  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };
}

function pointInRing(point, ring) {
  if (!point || !Array.isArray(ring) || ring.length < 3) {
    return false;
  }

  let inside = false;
  for (let currentIndex = 0, previousIndex = ring.length - 1; currentIndex < ring.length; previousIndex = currentIndex, currentIndex += 1) {
    const current = ring[currentIndex];
    const previous = ring[previousIndex];
    const intersects = ((current.y > point.y) !== (previous.y > point.y))
      && (point.x < ((previous.x - current.x) * (point.y - current.y)) / ((previous.y - current.y) || Number.EPSILON) + current.x);

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInPolygon(point, polygonRings) {
  if (!point || !Array.isArray(polygonRings) || polygonRings.length === 0) {
    return false;
  }

  if (!pointInRing(point, polygonRings[0])) {
    return false;
  }

  for (let index = 1; index < polygonRings.length; index += 1) {
    if (pointInRing(point, polygonRings[index])) {
      return false;
    }
  }

  return true;
}

function getFeatureBounds(feature) {
  if (!feature || typeof feature !== "object") {
    return null;
  }

  const directBounds = normalizeBounds(
    feature.bounds || feature.bbox || feature.extent || feature.envelope || feature.geometry
  );
  if (directBounds) {
    return directBounds;
  }

  const pointBounds = normalizePoint(feature.geometry || feature.location || feature.centroid || feature);
  if (pointBounds) {
    return pointBounds;
  }

  const geometry = feature.geometry || feature;
  if (geometry && Array.isArray(geometry.coordinates)) {
    return boundsFromCoordinates(geometry.coordinates);
  }

  return null;
}

function boundsIntersect(left, right) {
  if (!left || !right) {
    return false;
  }

  return !(left.maxX < right.minX || left.minX > right.maxX || left.maxY < right.minY || left.minY > right.maxY);
}

function resolveDistrictIntersection(districtAreas, featureBounds) {
  if (!Array.isArray(districtAreas) || districtAreas.length === 0 || !featureBounds) {
    return null;
  }

  const featureCenter = getBoundsCenter(featureBounds);

  for (const districtArea of districtAreas) {
    const areaBounds = normalizeBounds(districtArea.bounds || districtArea.bbox || districtArea.extent);
    const polygonRings = normalizePolygonRings(districtArea.polygon || districtArea.geometry || districtArea.rings || districtArea.coordinates);

    if (polygonRings.length > 0) {
      if (!featureCenter || !pointInPolygon(featureCenter, polygonRings)) {
        continue;
      }
    } else {
      if (!areaBounds) {
        continue;
      }

      if (!boundsIntersect(areaBounds, featureBounds)) {
        continue;
      }
    }

    return {
      district: districtArea.district || "",
      eventId: districtArea.eventId || "",
      eventName: districtArea.eventName || "",
      areaName: districtArea.name || null,
      bounds: areaBounds || boundsFromCoordinates((polygonRings || []).map((ring) => ring.map((point) => [point.x, point.y]))),
      correlationSource: polygonRings.length > 0 ? "configured_district_polygon" : "configured_district_bounds"
    };
  }

  return null;
}

module.exports = {
  getFeatureBounds,
  getBoundsCenter,
  resolveDistrictIntersection
};