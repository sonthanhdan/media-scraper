import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    spike: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 5000 },
        { duration: "20s", target: 5000 },
        { duration: "10s", target: 0 },
      ],
      gracefulRampDown: "30s",
      gracefulStop: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<5000"],
  },
};

export default function () {
  const url = __ENV.API_URL || "http://localhost:8080/api/scrape";
  const payload = JSON.stringify({ urls: ["https://en.wikipedia.org/wiki/Web_scraping"] });

  const res = http.post(url, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: "30s", // ✅ timeout đặt ở đây
  });

  check(res, { "status is 200": (r) => r.status === 200 });
  sleep(0.05);
}
