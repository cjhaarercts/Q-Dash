const test = require("node:test");
const assert = require("node:assert/strict");

const ENV_KEYS = [
  "ENVIRONMENT",
  "STATE_STORE_MODE",
  "ARC_GIS_RUNTIME_SECRET_ARN",
  "EVERBRIDGE_DRAFT_SECRET_ARN",
  "CORRELATION_TABLE_NAME",
  "PROCESSING_LEDGER_TABLE_NAME",
  "FEED_DEDUP_TABLE_NAME"
];

function setTestEnv() {
  process.env.ENVIRONMENT = "test";
  process.env.STATE_STORE_MODE = "memory";
  process.env.ARC_GIS_RUNTIME_SECRET_ARN = "arn:test:arcgis";
  process.env.EVERBRIDGE_DRAFT_SECRET_ARN = "arn:test:draft";
  process.env.CORRELATION_TABLE_NAME = "correlation";
  process.env.PROCESSING_LEDGER_TABLE_NAME = "ledger";
  process.env.FEED_DEDUP_TABLE_NAME = "feed-dedup";
}

function clearTestEnv() {
  ENV_KEYS.forEach((key) => {
    delete process.env[key];
  });
}

function clearModules(modulePaths) {
  modulePaths.forEach((modulePath) => {
    delete require.cache[require.resolve(modulePath)];
  });
}

test("hazard feed poller creates one draft and suppresses duplicate feed updates", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/http",
    "../src/handlers/everbridgeDraftCreator",
    "../src/handlers/hazardFeedPoller"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const http = require("../src/lib/http");
  const draftCreator = require("../src/handlers/everbridgeDraftCreator");
  let requestCalls = 0;
  let draftCalls = 0;

  secrets.resolveJsonSecret = async () => ({
    hazardFeeds: [
      {
        name: "nhc",
        url: "https://hazards.test/nhc",
        eventId: "2026-HUR-04",
        district: "D7",
        eventName: "Hurricane Alpha",
        minSeverity: "moderate"
      }
    ]
  });
  http.requestJson = async () => {
    requestCalls += 1;
    return {
      features: [
        {
          id: "HZ-1",
          properties: {
            title: "Storm Surge Warning",
            summary: "Coastal surge risk increasing.",
            severity: "severe",
            status: "active",
            updatedAt: "2026-08-07T15:00:00Z",
            expiresAt: "2026-08-09T00:00:00Z"
          }
        }
      ]
    };
  };
  draftCreator.executeDraftCreation = async (payload) => {
    draftCalls += 1;
    return {
      created: true,
      notificationId: `EB-HAZ-${draftCalls}`,
      status: "draft",
      approvalStatus: "pending-review",
      request: payload
    };
  };

  const { handler } = require("../src/handlers/hazardFeedPoller");
  const firstResponse = await handler({ feedName: "nhc" });
  const secondResponse = await handler({ feedName: "nhc" });
  const config = require("../src/lib/config").getConfig();
  const correlationRecord = await stateStore.getCorrelationRecord(
    config,
    "2026-HUR-04",
    "D7",
    "hazard-feed-state#nhc#HZ-1"
  );

  clearTestEnv();

  const firstParsed = JSON.parse(firstResponse.body);
  const secondParsed = JSON.parse(secondResponse.body);

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(firstParsed.updates[0].action, "draft-created");
  assert.equal(firstParsed.updates[0].correlationSource, "feed_defaults");
  assert.equal(firstParsed.metrics.correlationSourceCounts.feed_defaults, 1);
  assert.equal(firstParsed.metrics.actionCounts["draft-created"], 1);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(secondParsed.updates[0].reason, "duplicate-hazard-update");
  assert.equal(secondParsed.metrics.suppressionReasonCounts["duplicate-hazard-update"], 1);
  assert.equal(requestCalls, 2);
  assert.equal(draftCalls, 1);
  assert.equal(correlationRecord.everbridge_notification_id, "EB-HAZ-1");
  assert.equal(correlationRecord.hazard_severity, "severe");
});

test("hazard feed poller suppresses hazards below the severity threshold", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/http",
    "../src/handlers/everbridgeDraftCreator",
    "../src/handlers/hazardFeedPoller"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const http = require("../src/lib/http");
  const draftCreator = require("../src/handlers/everbridgeDraftCreator");
  let draftCalls = 0;

  secrets.resolveJsonSecret = async () => ({
    hazardFeeds: [
      {
        name: "nhc",
        url: "https://hazards.test/nhc",
        eventId: "2026-HUR-04",
        district: "D7",
        eventName: "Hurricane Alpha",
        minSeverity: "severe"
      }
    ]
  });
  http.requestJson = async () => ({
    features: [
      {
        id: "HZ-2",
        properties: {
          title: "Tropical Advisory",
          summary: "Conditions are being monitored.",
          severity: "moderate",
          status: "active",
          updatedAt: "2026-08-07T15:00:00Z",
          expiresAt: "2026-08-09T00:00:00Z"
        }
      }
    ]
  });
  draftCreator.executeDraftCreation = async () => {
    draftCalls += 1;
    return {
      created: true,
      notificationId: "EB-HAZ-SHOULD-NOT-HAPPEN",
      status: "draft",
      approvalStatus: "pending-review"
    };
  };

  const { handler } = require("../src/handlers/hazardFeedPoller");
  const response = await handler({ feedName: "nhc" });

  clearTestEnv();

  const parsed = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(parsed.updates[0].reason, "below-severity-threshold");
  assert.equal(parsed.metrics.suppressionReasonCounts["below-severity-threshold"], 1);
  assert.equal(draftCalls, 0);
});

test("hazard feed poller derives district and event from configured district areas", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/http",
    "../src/handlers/everbridgeDraftCreator",
    "../src/handlers/hazardFeedPoller"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const http = require("../src/lib/http");
  const draftCreator = require("../src/handlers/everbridgeDraftCreator");
  let draftPayload = null;

  secrets.resolveJsonSecret = async () => ({
    hazardFeeds: [
      {
        name: "river",
        url: "https://hazards.test/river",
        minSeverity: "moderate",
        districtAreas: [
          {
            name: "District 7 AOI",
            district: "D7",
            eventId: "2026-FLD-02",
            eventName: "River Flooding",
            bounds: {
              minX: -81,
              minY: 25,
              maxX: -79,
              maxY: 27
            }
          }
        ]
      }
    ]
  });
  http.requestJson = async () => ({
    features: [
      {
        id: "HZ-3",
        geometry: {
          xmin: -80.5,
          ymin: 25.5,
          xmax: -79.5,
          ymax: 26.5
        },
        properties: {
          title: "Flood Warning",
          summary: "River levels are rising.",
          severity: "severe",
          status: "active",
          updatedAt: "2026-08-07T16:00:00Z",
          expiresAt: "2026-08-09T00:00:00Z"
        }
      }
    ]
  });
  draftCreator.executeDraftCreation = async (payload) => {
    draftPayload = payload;
    return {
      created: true,
      notificationId: "EB-HAZ-GEO-1",
      status: "draft",
      approvalStatus: "pending-review"
    };
  };

  const { handler } = require("../src/handlers/hazardFeedPoller");
  const response = await handler({ feedName: "river" });

  clearTestEnv();

  const parsed = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(parsed.updates[0].district, "D7");
  assert.equal(parsed.updates[0].eventId, "2026-FLD-02");
  assert.equal(parsed.updates[0].correlationSource, "configured_district_bounds");
  assert.equal(parsed.updates[0].matchedAreaName, "District 7 AOI");
  assert.equal(draftPayload.eventId, "2026-FLD-02");
  assert.equal(draftPayload.district, "D7");
});

test("hazard feed poller suppresses hazards outside configured district areas", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/http",
    "../src/handlers/everbridgeDraftCreator",
    "../src/handlers/hazardFeedPoller"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const http = require("../src/lib/http");
  const draftCreator = require("../src/handlers/everbridgeDraftCreator");
  let draftCalls = 0;

  secrets.resolveJsonSecret = async () => ({
    hazardFeeds: [
      {
        name: "river",
        url: "https://hazards.test/river",
        minSeverity: "moderate",
        districtAreas: [
          {
            district: "D7",
            eventId: "2026-FLD-02",
            eventName: "River Flooding",
            bounds: {
              minX: -81,
              minY: 25,
              maxX: -79,
              maxY: 27
            }
          }
        ]
      }
    ]
  });
  http.requestJson = async () => ({
    features: [
      {
        id: "HZ-4",
        geometry: {
          xmin: -78,
          ymin: 28,
          xmax: -77,
          ymax: 29
        },
        properties: {
          title: "Remote Flood Warning",
          summary: "Outside the district area.",
          severity: "severe",
          status: "active",
          updatedAt: "2026-08-07T16:00:00Z",
          expiresAt: "2026-08-09T00:00:00Z"
        }
      }
    ]
  });
  draftCreator.executeDraftCreation = async () => {
    draftCalls += 1;
    return {
      created: true,
      notificationId: "EB-HAZ-OUTSIDE",
      status: "draft",
      approvalStatus: "pending-review"
    };
  };

  const { handler } = require("../src/handlers/hazardFeedPoller");
  const response = await handler({ feedName: "river" });

  clearTestEnv();

  const parsed = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(parsed.updates[0].reason, "outside-district-area");
  assert.equal(draftCalls, 0);
});

test("hazard feed poller supports polygon district areas for derived correlation", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/http",
    "../src/handlers/everbridgeDraftCreator",
    "../src/handlers/hazardFeedPoller"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const http = require("../src/lib/http");
  const draftCreator = require("../src/handlers/everbridgeDraftCreator");
  let draftCalls = 0;

  secrets.resolveJsonSecret = async () => ({
    hazardFeeds: [
      {
        name: "wildfire",
        url: "https://hazards.test/wildfire",
        minSeverity: "moderate",
        districtAreas: [
          {
            name: "District 9 Polygon",
            district: "D9",
            eventId: "2026-WF-03",
            eventName: "Wildfire Bravo",
            polygon: {
              rings: [
                [
                  [-81, 25],
                  [-79, 25],
                  [-79, 27],
                  [-81, 27],
                  [-81, 25]
                ]
              ]
            }
          }
        ]
      }
    ]
  });
  http.requestJson = async () => ({
    features: [
      {
        id: "HZ-5",
        geometry: {
          x: -80,
          y: 26
        },
        properties: {
          title: "Wildfire Warning",
          summary: "Smoke and fire spread increasing.",
          severity: "severe",
          status: "active",
          updatedAt: "2026-08-07T17:00:00Z",
          expiresAt: "2026-08-09T00:00:00Z"
        }
      }
    ]
  });
  draftCreator.executeDraftCreation = async () => {
    draftCalls += 1;
    return {
      created: true,
      notificationId: "EB-HAZ-POLY-1",
      status: "draft",
      approvalStatus: "pending-review"
    };
  };

  const { handler } = require("../src/handlers/hazardFeedPoller");
  const response = await handler({ feedName: "wildfire" });

  clearTestEnv();

  const parsed = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(parsed.updates[0].district, "D9");
  assert.equal(parsed.updates[0].eventId, "2026-WF-03");
  assert.equal(parsed.updates[0].correlationSource, "configured_district_polygon");
  assert.equal(draftCalls, 1);
});

test("hazard feed poller prefers polygon containment over broad bounding boxes", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/http",
    "../src/handlers/everbridgeDraftCreator",
    "../src/handlers/hazardFeedPoller"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const http = require("../src/lib/http");
  const draftCreator = require("../src/handlers/everbridgeDraftCreator");
  let draftCalls = 0;

  secrets.resolveJsonSecret = async () => ({
    hazardFeeds: [
      {
        name: "wildfire",
        url: "https://hazards.test/wildfire",
        minSeverity: "moderate",
        districtAreas: [
          {
            name: "District 9 Polygon",
            district: "D9",
            eventId: "2026-WF-03",
            eventName: "Wildfire Bravo",
            bounds: {
              minX: -81,
              minY: 25,
              maxX: -79,
              maxY: 27
            },
            polygon: {
              rings: [
                [
                  [-81, 25],
                  [-80.6, 25],
                  [-80.6, 25.4],
                  [-81, 25.4],
                  [-81, 25]
                ]
              ]
            }
          }
        ]
      }
    ]
  });
  http.requestJson = async () => ({
    features: [
      {
        id: "HZ-6",
        geometry: {
          xmin: -79.5,
          ymin: 26.5,
          xmax: -79.4,
          ymax: 26.6
        },
        properties: {
          title: "Remote Wildfire Warning",
          summary: "Inside the bbox but outside the polygon.",
          severity: "severe",
          status: "active",
          updatedAt: "2026-08-07T17:30:00Z",
          expiresAt: "2026-08-09T00:00:00Z"
        }
      }
    ]
  });
  draftCreator.executeDraftCreation = async () => {
    draftCalls += 1;
    return {
      created: true,
      notificationId: "EB-HAZ-POLY-OUTSIDE",
      status: "draft",
      approvalStatus: "pending-review"
    };
  };

  const { handler } = require("../src/handlers/hazardFeedPoller");
  const response = await handler({ feedName: "wildfire" });

  clearTestEnv();

  const parsed = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(parsed.updates[0].reason, "outside-district-area");
  assert.equal(draftCalls, 0);
});

test("hazard feed poller can derive district and event from ArcGIS district lookup", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/http",
    "../src/lib/arcgisClient",
    "../src/handlers/everbridgeDraftCreator",
    "../src/handlers/hazardFeedPoller"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const http = require("../src/lib/http");
  const arcGisClient = require("../src/lib/arcgisClient");
  const draftCreator = require("../src/handlers/everbridgeDraftCreator");
  let lookupCalls = 0;
  let draftPayload = null;

  secrets.resolveJsonSecret = async () => ({
    accessToken: "arcgis-token",
    hazardDistrictLookup: {
      layerUrl: "https://services.arcgis.com/example/FeatureServer/2",
      districtField: "district_code",
      eventIdField: "current_event_id",
      eventNameField: "current_event_name"
    },
    hazardFeeds: [
      {
        name: "cone",
        url: "https://hazards.test/cone",
        minSeverity: "moderate"
      }
    ]
  });
  http.requestJson = async () => ({
    features: [
      {
        id: "HZ-7",
        geometry: {
          x: -80.4,
          y: 26.1
        },
        properties: {
          title: "Cone Alert",
          summary: "Hazard track intersects the district.",
          severity: "severe",
          status: "active",
          updatedAt: "2026-08-07T18:00:00Z",
          expiresAt: "2026-08-09T00:00:00Z"
        }
      }
    ]
  });
  arcGisClient.queryFeatures = async () => {
    lookupCalls += 1;
    return {
      features: [
        {
          attributes: {
            district_code: "D11",
            current_event_id: "2026-HUR-07",
            current_event_name: "Hurricane Delta"
          }
        }
      ]
    };
  };
  draftCreator.executeDraftCreation = async (payload) => {
    draftPayload = payload;
    return {
      created: true,
      notificationId: "EB-HAZ-AGOL-1",
      status: "draft",
      approvalStatus: "pending-review"
    };
  };

  const { handler } = require("../src/handlers/hazardFeedPoller");
  const response = await handler({ feedName: "cone" });

  clearTestEnv();

  const parsed = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(parsed.updates[0].district, "D11");
  assert.equal(parsed.updates[0].eventId, "2026-HUR-07");
  assert.equal(parsed.updates[0].correlationSource, "arcgis_district_lookup_live");
  assert.equal(parsed.metrics.correlationSourceCounts.arcgis_district_lookup_live, 1);
  assert.equal(parsed.updates[0].matchedAreaName, "ArcGIS District Lookup");
  assert.equal(lookupCalls, 1);
  assert.equal(draftPayload.eventId, "2026-HUR-07");
});

test("hazard feed poller suppresses hazards when ArcGIS district lookup finds no match", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/http",
    "../src/lib/arcgisClient",
    "../src/handlers/everbridgeDraftCreator",
    "../src/handlers/hazardFeedPoller"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const http = require("../src/lib/http");
  const arcGisClient = require("../src/lib/arcgisClient");
  const draftCreator = require("../src/handlers/everbridgeDraftCreator");
  let draftCalls = 0;

  secrets.resolveJsonSecret = async () => ({
    accessToken: "arcgis-token",
    hazardDistrictLookup: {
      layerUrl: "https://services.arcgis.com/example/FeatureServer/2",
      districtField: "district_code",
      eventIdField: "current_event_id",
      eventNameField: "current_event_name"
    },
    hazardFeeds: [
      {
        name: "cone",
        url: "https://hazards.test/cone",
        minSeverity: "moderate"
      }
    ]
  });
  http.requestJson = async () => ({
    features: [
      {
        id: "HZ-8",
        geometry: {
          x: -75,
          y: 31
        },
        properties: {
          title: "Unmatched Cone Alert",
          summary: "No district match returned.",
          severity: "severe",
          status: "active",
          updatedAt: "2026-08-07T18:15:00Z",
          expiresAt: "2026-08-09T00:00:00Z"
        }
      }
    ]
  });
  arcGisClient.queryFeatures = async () => {
    return { features: [] };
  };
  draftCreator.executeDraftCreation = async () => {
    draftCalls += 1;
    return {
      created: true,
      notificationId: "EB-HAZ-SHOULD-NOT-HAPPEN",
      status: "draft",
      approvalStatus: "pending-review"
    };
  };

  const { handler } = require("../src/handlers/hazardFeedPoller");
  const response = await handler({ feedName: "cone" });

  clearTestEnv();

  const parsed = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(parsed.updates[0].reason, "missing-event-correlation");
  assert.equal(draftCalls, 0);
});

test("hazard feed poller caches ArcGIS district lookup hits within a poll run", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/http",
    "../src/lib/arcgisClient",
    "../src/handlers/everbridgeDraftCreator",
    "../src/handlers/hazardFeedPoller"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const http = require("../src/lib/http");
  const arcGisClient = require("../src/lib/arcgisClient");
  const draftCreator = require("../src/handlers/everbridgeDraftCreator");
  let lookupCalls = 0;
  let draftCalls = 0;

  secrets.resolveJsonSecret = async () => ({
    accessToken: "arcgis-token",
    hazardDistrictLookup: {
      layerUrl: "https://services.arcgis.com/example/FeatureServer/2",
      districtField: "district_code",
      eventIdField: "current_event_id",
      eventNameField: "current_event_name"
    },
    hazardFeeds: [
      {
        name: "cone",
        url: "https://hazards.test/cone",
        minSeverity: "moderate"
      }
    ]
  });
  http.requestJson = async () => ({
    features: [
      {
        id: "HZ-9",
        geometry: {
          x: -80.4002,
          y: 26.1002
        },
        properties: {
          title: "Cone Alert A",
          summary: "First correlated cone hazard.",
          severity: "severe",
          status: "active",
          updatedAt: "2026-08-07T18:30:00Z",
          expiresAt: "2026-08-09T00:00:00Z"
        }
      },
      {
        id: "HZ-10",
        geometry: {
          x: -80.4004,
          y: 26.1004
        },
        properties: {
          title: "Cone Alert B",
          summary: "Second correlated cone hazard in same lookup cell.",
          severity: "severe",
          status: "active",
          updatedAt: "2026-08-07T18:31:00Z",
          expiresAt: "2026-08-09T00:00:00Z"
        }
      }
    ]
  });
  arcGisClient.queryFeatures = async () => {
    lookupCalls += 1;
    return {
      features: [
        {
          attributes: {
            district_code: "D11",
            current_event_id: "2026-HUR-07",
            current_event_name: "Hurricane Delta"
          }
        }
      ]
    };
  };
  draftCreator.executeDraftCreation = async () => {
    draftCalls += 1;
    return {
      created: true,
      notificationId: `EB-HAZ-CACHE-${draftCalls}`,
      status: "draft",
      approvalStatus: "pending-review"
    };
  };

  const { handler } = require("../src/handlers/hazardFeedPoller");
  const response = await handler({ feedName: "cone" });

  clearTestEnv();

  const parsed = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(parsed.updates.length, 2);
  assert.equal(parsed.updates[0].district, "D11");
  assert.equal(parsed.updates[1].district, "D11");
  assert.equal(parsed.updates[0].correlationSource, "arcgis_district_lookup_live");
  assert.equal(parsed.updates[1].correlationSource, "arcgis_district_lookup_run_cache");
  assert.equal(parsed.metrics.correlationSourceCounts.arcgis_district_lookup_live, 1);
  assert.equal(parsed.metrics.correlationSourceCounts.arcgis_district_lookup_run_cache, 1);
  assert.equal(lookupCalls, 1);
  assert.equal(draftCalls, 2);
});

test("hazard feed poller caches ArcGIS district lookup misses within a poll run", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/http",
    "../src/lib/arcgisClient",
    "../src/handlers/everbridgeDraftCreator",
    "../src/handlers/hazardFeedPoller"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const http = require("../src/lib/http");
  const arcGisClient = require("../src/lib/arcgisClient");
  const draftCreator = require("../src/handlers/everbridgeDraftCreator");
  let lookupCalls = 0;
  let draftCalls = 0;

  secrets.resolveJsonSecret = async () => ({
    accessToken: "arcgis-token",
    hazardDistrictLookup: {
      layerUrl: "https://services.arcgis.com/example/FeatureServer/2",
      districtField: "district_code",
      eventIdField: "current_event_id",
      eventNameField: "current_event_name"
    },
    hazardFeeds: [
      {
        name: "cone",
        url: "https://hazards.test/cone",
        minSeverity: "moderate"
      }
    ]
  });
  http.requestJson = async () => ({
    features: [
      {
        id: "HZ-11",
        geometry: {
          x: -75.0002,
          y: 31.0002
        },
        properties: {
          title: "Cone Miss A",
          summary: "First unmatched cone hazard.",
          severity: "severe",
          status: "active",
          updatedAt: "2026-08-07T18:45:00Z",
          expiresAt: "2026-08-09T00:00:00Z"
        }
      },
      {
        id: "HZ-12",
        geometry: {
          x: -75.0004,
          y: 31.0004
        },
        properties: {
          title: "Cone Miss B",
          summary: "Second unmatched cone hazard in same lookup cell.",
          severity: "severe",
          status: "active",
          updatedAt: "2026-08-07T18:46:00Z",
          expiresAt: "2026-08-09T00:00:00Z"
        }
      }
    ]
  });
  arcGisClient.queryFeatures = async () => {
    lookupCalls += 1;
    return { features: [] };
  };
  draftCreator.executeDraftCreation = async () => {
    draftCalls += 1;
    return {
      created: true,
      notificationId: "EB-HAZ-SHOULD-NOT-HAPPEN",
      status: "draft",
      approvalStatus: "pending-review"
    };
  };

  const { handler } = require("../src/handlers/hazardFeedPoller");
  const response = await handler({ feedName: "cone" });

  clearTestEnv();

  const parsed = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(parsed.updates.length, 2);
  assert.equal(parsed.updates[0].reason, "missing-event-correlation");
  assert.equal(parsed.updates[1].reason, "missing-event-correlation");
  assert.equal(lookupCalls, 1);
  assert.equal(draftCalls, 0);
});

test("hazard feed poller reuses persisted ArcGIS district lookup hits across invocations", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/http",
    "../src/lib/arcgisClient",
    "../src/handlers/everbridgeDraftCreator",
    "../src/handlers/hazardFeedPoller"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const http = require("../src/lib/http");
  const arcGisClient = require("../src/lib/arcgisClient");
  const draftCreator = require("../src/handlers/everbridgeDraftCreator");
  let feedCall = 0;
  let lookupCalls = 0;
  let draftCalls = 0;

  secrets.resolveJsonSecret = async () => ({
    accessToken: "arcgis-token",
    hazardDistrictLookup: {
      layerUrl: "https://services.arcgis.com/example/FeatureServer/2",
      districtField: "district_code",
      eventIdField: "current_event_id",
      eventNameField: "current_event_name"
    },
    hazardFeeds: [
      {
        name: "cone",
        url: "https://hazards.test/cone",
        minSeverity: "moderate"
      }
    ]
  });
  http.requestJson = async () => {
    feedCall += 1;
    return {
      features: [
        {
          id: `HZ-PERSIST-${feedCall}`,
          geometry: {
            x: -80.4002,
            y: 26.1002
          },
          properties: {
            title: `Cone Persist ${feedCall}`,
            summary: "Same lookup cell across invocations.",
            severity: "severe",
            status: "active",
            updatedAt: `2026-08-07T19:0${feedCall}:00Z`,
            expiresAt: "2026-08-09T00:00:00Z"
          }
        }
      ]
    };
  };
  arcGisClient.queryFeatures = async () => {
    lookupCalls += 1;
    return {
      features: [
        {
          attributes: {
            district_code: "D11",
            current_event_id: "2026-HUR-07",
            current_event_name: "Hurricane Delta"
          }
        }
      ]
    };
  };
  draftCreator.executeDraftCreation = async () => {
    draftCalls += 1;
    return {
      created: true,
      notificationId: `EB-HAZ-PERSIST-${draftCalls}`,
      status: "draft",
      approvalStatus: "pending-review"
    };
  };

  const { handler } = require("../src/handlers/hazardFeedPoller");
  const firstResponse = await handler({ feedName: "cone" });
  const secondResponse = await handler({ feedName: "cone" });

  clearTestEnv();

  const firstParsed = JSON.parse(firstResponse.body);
  const secondParsed = JSON.parse(secondResponse.body);

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(firstParsed.updates[0].district, "D11");
  assert.equal(secondParsed.updates[0].district, "D11");
  assert.equal(firstParsed.updates[0].correlationSource, "arcgis_district_lookup_live");
  assert.equal(secondParsed.updates[0].correlationSource, "arcgis_district_lookup_persisted_cache");
  assert.equal(secondParsed.metrics.correlationSourceCounts.arcgis_district_lookup_persisted_cache, 1);
  assert.equal(lookupCalls, 1);
  assert.equal(draftCalls, 2);
});

test("hazard feed poller marks explicit feature correlation provenance", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/http",
    "../src/handlers/everbridgeDraftCreator",
    "../src/handlers/hazardFeedPoller"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const http = require("../src/lib/http");
  const draftCreator = require("../src/handlers/everbridgeDraftCreator");

  secrets.resolveJsonSecret = async () => ({
    hazardFeeds: [
      {
        name: "caps",
        url: "https://hazards.test/caps",
        minSeverity: "moderate"
      }
    ]
  });
  http.requestJson = async () => ({
    features: [
      {
        id: "HZ-13",
        properties: {
          title: "Explicit Correlation Alert",
          summary: "Feed item includes district and event fields.",
          severity: "severe",
          status: "active",
          eventId: "2026-CAP-01",
          district: "D3",
          eventName: "CAP Hazard",
          updatedAt: "2026-08-07T20:00:00Z",
          expiresAt: "2026-08-09T00:00:00Z"
        }
      }
    ]
  });
  draftCreator.executeDraftCreation = async () => ({
    created: true,
    notificationId: "EB-HAZ-FEED-1",
    status: "draft",
    approvalStatus: "pending-review"
  });

  const { handler } = require("../src/handlers/hazardFeedPoller");
  const response = await handler({ feedName: "caps" });

  clearTestEnv();

  const parsed = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(parsed.updates[0].correlationSource, "feed_feature");
  assert.equal(parsed.updates[0].district, "D3");
  assert.equal(parsed.updates[0].eventId, "2026-CAP-01");
});

test("hazard feed poller reuses persisted ArcGIS district lookup misses across invocations", async () => {
  setTestEnv();
  clearModules([
    "../src/lib/stateStore",
    "../src/lib/secrets",
    "../src/lib/http",
    "../src/lib/arcgisClient",
    "../src/handlers/everbridgeDraftCreator",
    "../src/handlers/hazardFeedPoller"
  ]);

  const stateStore = require("../src/lib/stateStore");
  stateStore.clearMemoryState();

  const secrets = require("../src/lib/secrets");
  const http = require("../src/lib/http");
  const arcGisClient = require("../src/lib/arcgisClient");
  const draftCreator = require("../src/handlers/everbridgeDraftCreator");
  let feedCall = 0;
  let lookupCalls = 0;
  let draftCalls = 0;

  secrets.resolveJsonSecret = async () => ({
    accessToken: "arcgis-token",
    hazardDistrictLookup: {
      layerUrl: "https://services.arcgis.com/example/FeatureServer/2",
      districtField: "district_code",
      eventIdField: "current_event_id",
      eventNameField: "current_event_name"
    },
    hazardFeeds: [
      {
        name: "cone",
        url: "https://hazards.test/cone",
        minSeverity: "moderate"
      }
    ]
  });
  http.requestJson = async () => {
    feedCall += 1;
    return {
      features: [
        {
          id: `HZ-MISS-${feedCall}`,
          geometry: {
            x: -75.0002,
            y: 31.0002
          },
          properties: {
            title: `Cone Miss ${feedCall}`,
            summary: "Same unmatched lookup cell across invocations.",
            severity: "severe",
            status: "active",
            updatedAt: `2026-08-07T19:1${feedCall}:00Z`,
            expiresAt: "2026-08-09T00:00:00Z"
          }
        }
      ]
    };
  };
  arcGisClient.queryFeatures = async () => {
    lookupCalls += 1;
    return { features: [] };
  };
  draftCreator.executeDraftCreation = async () => {
    draftCalls += 1;
    return {
      created: true,
      notificationId: "EB-HAZ-SHOULD-NOT-HAPPEN",
      status: "draft",
      approvalStatus: "pending-review"
    };
  };

  const { handler } = require("../src/handlers/hazardFeedPoller");
  const firstResponse = await handler({ feedName: "cone" });
  const secondResponse = await handler({ feedName: "cone" });

  clearTestEnv();

  const firstParsed = JSON.parse(firstResponse.body);
  const secondParsed = JSON.parse(secondResponse.body);

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(secondResponse.statusCode, 200);
  assert.equal(firstParsed.updates[0].reason, "missing-event-correlation");
  assert.equal(secondParsed.updates[0].reason, "missing-event-correlation");
  assert.equal(lookupCalls, 1);
  assert.equal(draftCalls, 0);
});