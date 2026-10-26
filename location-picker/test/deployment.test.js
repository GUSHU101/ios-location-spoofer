const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");

test("Coolify compose generates scoped secrets and a routed public origin", () => {
  const compose = fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8");

  assert.match(compose, /TOKEN: \$\{SERVICE_HEX_64_LOCATIONPICKERADMIN\}/);
  assert.match(compose, /READ_TOKEN: \$\{SERVICE_HEX_64_LOCATIONPICKERREAD\}/);
  assert.match(compose, /SERVICE_URL_LOCATION_PICKER_8080: \//);
  assert.match(compose, /PUBLIC_ORIGIN: \$\{SERVICE_URL_LOCATION_PICKER_8080\}/);
  assert.match(compose, /expose:\s*\n\s*- "8080"/);
  assert.doesNotMatch(compose, /^\s+ports:/m);
  assert.equal(fs.existsSync(path.join(root, ".env.example")), false);
});

test("container runs unprivileged with persistent data and health checks", () => {
  const dockerfile = fs.readFileSync(path.join(root, "location-picker", "Dockerfile"), "utf8");
  const compose = fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8");

  assert.match(dockerfile, /^USER node$/m);
  assert.match(dockerfile, /^HEALTHCHECK /m);
  assert.match(compose, /location-picker-data:\/data/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /no-new-privileges:true/);
});
