const test=require('node:test');
const assert=require('node:assert/strict');
const {parseNumber,parseMoney}=require('../electron/importer.cjs');

test('parses German and English decimal formats',()=>{
  assert.equal(parseNumber('1.234,5'),1234.5);
  assert.equal(parseNumber('1,234.5'),1234.5);
  assert.equal(parseNumber('7,21'),7.21);
});

test('parses FM currency suffixes',()=>{
  assert.equal(parseMoney('€12,5K'),12500);
  assert.equal(parseMoney('1.2M'),1200000);
  assert.equal(parseMoney('750'),750);
});
