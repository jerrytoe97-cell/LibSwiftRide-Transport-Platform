import http from "k6/http";
import { check, fail } from "k6";

const baseUrl = (__ENV.LOAD_TEST_BASE_URL || "").replace(/\/$/, "");
const accessToken = __ENV.LOAD_TEST_ACCESS_TOKEN || "";
const confirmedTarget = (__ENV.LOAD_TEST_CONFIRM_TARGET || "").replace(/\/$/, "");

if (__ENV.LOAD_TEST_ENVIRONMENT !== "staging") fail("LOAD_TEST_ENVIRONMENT must be exactly 'staging'");
if (!baseUrl || confirmedTarget !== baseUrl) fail("LOAD_TEST_CONFIRM_TARGET must exactly match LOAD_TEST_BASE_URL");
if (!accessToken) fail("LOAD_TEST_ACCESS_TOKEN is required for authenticated quote traffic");
if (!/^https:\/\//.test(baseUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)) {
  fail("The target must use HTTPS unless it is localhost");
}

export const options = {
  discardResponseBodies: true,
  scenarios: {
    readiness: {
      executor: "constant-arrival-rate",
      exec: "readiness",
      rate: 2,
      timeUnit: "1s",
      duration: "5m",
      preAllocatedVUs: 2,
      maxVUs: 10
    },
    quotes: {
      executor: "ramping-arrival-rate",
      exec: "quote",
      startRate: 1,
      timeUnit: "1s",
      preAllocatedVUs: 10,
      maxVUs: 75,
      stages: [
        { target: 5, duration: "1m" },
        { target: 15, duration: "2m" },
        { target: 5, duration: "1m" },
        { target: 0, duration: "1m" }
      ]
    }
  },
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    "http_req_duration{endpoint:readiness}": ["p(95)<250", "p(99)<750"],
    "http_req_duration{endpoint:quote}": ["p(95)<750", "p(99)<1500"],
    dropped_iterations: ["count==0"]
  }
};

export function readiness() {
  const response = http.get(`${baseUrl}/health/ready`, { tags: { endpoint: "readiness" }, timeout: "3s" });
  check(response, { "readiness returns 200": (result) => result.status === 200 });
}

export function quote() {
  const response = http.post(`${baseUrl}/api/v1/rides/quote`, JSON.stringify({
    pickup: { address: "Broad Street, Monrovia", latitude: 6.3156, longitude: -10.8074 },
    destination: { address: "SKD Complex, Paynesville", latitude: 6.3058, longitude: -10.7492 },
    rideType: "ECONOMY"
  }), {
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    tags: { endpoint: "quote" },
    timeout: "10s"
  });
  check(response, { "quote returns 200": (result) => result.status === 200 });
}
