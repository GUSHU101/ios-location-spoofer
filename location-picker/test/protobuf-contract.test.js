"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../../location-spoofer.js");

function u16(value) { return Uint8Array.from([(value >>> 8) & 255, value & 255]); }
function u32(value) { return Uint8Array.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]); }
function pascal(bytes) { return core.concatBytes([u16(bytes.length), bytes]); }
const target = {
  enabled: true, latitude: 40.7128, longitude: -74.006,
  altitude: 30, horizontalAccuracy: 20, verticalAccuracy: 25
};
function fixturePayload() {
  const loc = core.concatBytes([
    core.makeVarintField(1, 3733490000),
    core.makeVarintField(2, -12200902000)
  ]);
  const wifi = core.makeLengthDelimitedField(2, loc);
  return core.makeLengthDelimitedField(2, wifi);
}

test("ARPC rewrite retains non-ASCII locale bytes and arbitrary suffix exactly", () => {
  const payload = fixturePayload();
  const prefix = core.concatBytes([
    u16(1), pascal(Uint8Array.from([0x65, 0x6e, 0xff, 0x80])),
    pascal(Uint8Array.from([0x01, 0x02, 0xe9])),
    pascal(Uint8Array.from([0x69, 0x4f, 0x53])), u32(1)
  ]);
  const suffix = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
  const original = core.concatBytes([prefix, u32(payload.length), payload, suffix]);
  const result = core.spoofAppleResponse(original, target);
  assert.equal(result.kind, "arpc");
  assert.deepEqual(Array.from(result.response.slice(0,prefix.length)),Array.from(prefix));
  assert.deepEqual(Array.from(result.response.slice(-4)),Array.from(suffix));
  const extraction = core.extractAppleWLocPayload(result.response);
  assert.equal(extraction.kind, "arpc");
  assert.equal(extraction.payload.length,result.response.length-prefix.length-4-suffix.length);
  assert.equal(result.wifiCount,1);
});

test("protobuf unknown wire fields survive round trip if not marked for removal", () => {
  const unknown = core.makeLengthDelimitedField(500, Uint8Array.from([0xff,0x00,0x01]));
  const payload = core.concatBytes([fixturePayload(),unknown]);
  const original = core.buildAppleWLocResponse(payload);
  const output = core.spoofAppleResponse(original,target);
  const resultFields = core.parseFields(core.extractAppleWLocPayload(output.response).payload);
  const field = resultFields.find(f=>f.fieldNumber===500);
  assert.ok(field);
  assert.deepEqual(Array.from(field.raw),Array.from(unknown));
});

test("protobuf varints reject uint64 overflow and truncated sequences", () => {
  assert.throws(() => core.decodeVarint(Uint8Array.from([...Array(9).fill(0xff),0x02]),0),/exceeds 64 bits/);
  assert.throws(() => core.decodeVarint(Uint8Array.from(Array(11).fill(0x80)),0),/exceeds 64 bits/);
  assert.throws(() => core.decodeVarint(Uint8Array.from([0x80]),0),/unterminated/);
  const valid=core.decodeVarint(Uint8Array.from([...Array(9).fill(0xff),0x01]),0);
  assert.equal(valid.value,(1n<<64n)-1n);
});

test("protobuf field wire lengths are bounded to the actually available data", () => {
  assert.throws(() => core.parseFields(Uint8Array.from([0x12,0x7f,0x41])),/exceeds buffer/);
  assert.throws(() => core.parseFields(Uint8Array.from([0x12,...Array(9).fill(0xff),0x01])),/exceeds buffer/);
  assert.throws(() => core.parseFields(Uint8Array.from([0x00,0x01])),/field number/);
  // A field number over 2^29-1 is invalid even if the varint is well-formed.
  const tooLargeField = Uint8Array.from([0x80,0x80,0x80,0x80,0x10,0x01]);
  assert.throws(() => core.parseFields(tooLargeField),/field number/);
});
