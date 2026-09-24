import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Writable} from 'node:stream';
import proxy from '../api/index.mjs';

class MockResponse extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this.headersSent = false;
    this.headers = new Map();
    this.chunks = [];
  }
  _write(chunk, encoding, callback) {
    this.headersSent = true;
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
  status(code) { this.statusCode = code; return this; }
  setHeader(name, value) { this.headers.set(name.toLowerCase(), value); return this; }
  json(value) {
    this.setHeader('content-type', 'application/json');
    this.end(JSON.stringify(value));
    return this;
  }
  get text() { return Buffer.concat(this.chunks).toString(); }
}

test('proxy forwards route, query, credentials and response cookie', async () => {
  const oldBackend = process.env.BACKEND_URL;
  const oldFetch = globalThis.fetch;
  process.env.BACKEND_URL = 'https://backend.example.com';
  let request;
  globalThis.fetch = async (url, options) => {
    request = {url: String(url), options};
    return new Response('{"ok":true}', {
      status: 201,
      headers: {'content-type': 'application/json', 'set-cookie': 'ibm_session=abc; HttpOnly; Secure; SameSite=Strict'},
    });
  };
  try {
    const res = new MockResponse();
    await proxy({
      url: '/api/index.mjs?__proxy_path=entities%2Fcustomers&office_id=3',
      method: 'POST',
      headers: {host: 'frontend.example.com', origin: 'https://frontend.example.com', cookie: 'ibm_session=abc', 'content-type': 'application/json'},
      body: {customer_name: 'Test'},
    }, res);
    assert.equal(request.url, 'https://backend.example.com/api/entities/customers?office_id=3');
    assert.equal(request.options.headers.get('cookie'), 'ibm_session=abc');
    assert.equal(request.options.headers.get('origin'), 'https://frontend.example.com');
    assert.equal(request.options.headers.get('host'), null);
    assert.equal(request.options.body, '{"customer_name":"Test"}');
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.headers.get('set-cookie'), ['ibm_session=abc; HttpOnly; Secure; SameSite=Strict']);
    assert.equal(res.text, '{"ok":true}');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldBackend === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = oldBackend;
  }
});

test('proxy fails closed without a backend URL', async () => {
  const oldBackend = process.env.BACKEND_URL;
  delete process.env.BACKEND_URL;
  try {
    const res = new MockResponse();
    await proxy({url: '/api/index.mjs?__proxy_path=health', method: 'GET', headers: {}}, res);
    assert.equal(res.statusCode, 503);
    assert.match(res.text, /BACKEND_URL/);
  } finally {
    if (oldBackend !== undefined) process.env.BACKEND_URL = oldBackend;
  }
});

test('proxy rejects a path that escapes the API', async () => {
  const oldBackend = process.env.BACKEND_URL;
  process.env.BACKEND_URL = 'https://backend.example.com';
  try {
    const res = new MockResponse();
    await proxy({url: '/api/index.mjs?__proxy_path=..%2Fhealth', method: 'GET', headers: {}}, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.text, /Invalid API path/);
  } finally {
    if (oldBackend === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = oldBackend;
  }
});
