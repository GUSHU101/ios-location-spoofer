import test from "node:test";
import assert from "node:assert/strict";
import handler from "../src/index.js";

const admin = "a".repeat(48), read = "b".repeat(48);
const origin = "https://picker.example.test";
function makeEnv(initial) {
  let stored = initial;
  const kv = {
    async get() { return stored; },
    async put(key, value) {
      assert.equal(key, "loc");
      stored = value;
    }
  };
  return { TOKEN:admin, READ_TOKEN:read, LOC_KV:kv };
}
function req(path, token, method="GET", data=undefined) {
  return new Request(origin+path+(token?"?token="+token:""),{
    method,
    ...(data?{headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}:{})
  });
}
const sample = { enabled:true,latitude:39.9042,longitude:116.4074,altitude:45,horizontalAccuracy:10,verticalAccuracy:25 };
test("Worker split tokens permit read-only access but not writes", async()=>{
  const env=makeEnv(JSON.stringify(sample));
  const readResult=await handler.fetch(req("/loc.json",read),env);
  assert.equal(readResult.status,200);
  assert.deepEqual(await readResult.json(),sample);
  assert.equal((await handler.fetch(req("/set",read,"POST",{lat:40,lng:-74}),env)).status,403);
  assert.equal((await handler.fetch(req("/enable",read,"POST",{enabled:false}),env)).status,403);
  assert.equal((await handler.fetch(req("/",read),env)).status,403);
  const adminSave=await handler.fetch(req("/set",admin,"POST",{lat:40.7,lng:-73.9}),env);
  assert.equal(adminSave.status,200);
  const actual=await (await handler.fetch(req("/loc.json",read),env)).json();
  assert.equal(actual.latitude,40.7);
  assert.equal(actual.longitude,-73.9);
});
test("Worker keeps legacy deployments usable when READ_TOKEN is absent",async()=>{
  const env=makeEnv(JSON.stringify(sample));
  delete env.READ_TOKEN;
  assert.equal((await handler.fetch(req("/loc.json",admin),env)).status,200);
  assert.equal((await handler.fetch(req("/loc.json",read),env)).status,403);
  assert.equal((await handler.fetch(req("/set",admin,"POST",{lat:0,lng:0}),env)).status,200);
});
test("KV corruption or unavailability returns HTTP 503 and preserves previous data",async()=>{
  for(const corrupted of [
    "{not-json", "null", "{\"latitude\":null,\"longitude\":0}",
    "{\"latitude\":91,\"longitude\":0}",
    "{\"latitude\":0,\"longitude\":0,\"enabled\":\"false\"}",
    "{\"latitude\":0,\"longitude\":0,\"horizontalAccuracy\":-10}"
  ]) {
    const env=makeEnv(corrupted);
    const result=await handler.fetch(req("/loc.json",read),env);
    assert.equal(result.status,503,"corrupt="+corrupted);
    assert.deepEqual(await result.json(),{error:"saved location unavailable"});
    assert.equal((await handler.fetch(req("/set",admin,"POST",{lat:30,lng:40}),env)).status,503);
    assert.equal((await handler.fetch(req("/enable",admin,"POST",{enabled:false}),env)).status,503);
  }
  const env=makeEnv(JSON.stringify(sample));
  env.LOC_KV.get=async()=>{throw Error("unavailable")};
  assert.equal((await handler.fetch(req("/loc.json",read),env)).status,503);
});
test("new namespace starts with documented initial coordinates and checks toggle input types",async()=>{
  const env=makeEnv(null);
  const location=await handler.fetch(req("/loc.json",read),env);
  assert.equal(location.status,200);
  assert.equal((await location.json()).latitude,37.3349);
  const wrong=await handler.fetch(req("/enable",admin,"POST",{enabled:"false"}),env);
  assert.equal(wrong.status,400);
});
