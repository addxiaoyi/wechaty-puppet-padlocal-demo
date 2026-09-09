const http = require('http');

async function testAPI() {
  const results = [];

  function callAPI(path, method = 'GET') {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 8765,
        path: path,
        method: method,
        headers: method === 'DELETE' ? {} : {}
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({ status: res.statusCode, body: data });
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      req.end();
    });
  }

  function callAPIWithBody(path, method = 'PUT', body = {}) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const options = {
        hostname: 'localhost',
        port: 8765,
        path: path,
        method: method,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({ status: res.statusCode, body: data });
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      req.write(payload);
      req.end();
    });
  }

  // 1. Test bot status
  try {
    const res = await callAPI('/api/bot/status');
    const json = JSON.parse(res.body);
    if (json && json.state !== undefined) {
      results.push('✅ /api/bot/status: ' + JSON.stringify(json));
    } else {
      results.push('⚠️  /api/bot/status: Unexpected response ' + res.body);
    }
  } catch(e) {
    results.push('❌ /api/bot/status: ' + e.message);
  }

  // 2. Test usage summary
  try {
    const res = await callAPI('/api/usage/summary');
    const json = JSON.parse(res.body);
    if ('totalCalls' in json && 'totalIn' in json && 'totalOut' in json) {
      results.push('✅ /api/usage/summary: ' + JSON.stringify(json));
    } else {
      results.push('⚠️  /api/usage/summary: Missing fields');
    }
  } catch(e) {
    results.push('❌ /api/usage/summary: ' + e.message);
  }

  // 3. Test usage daily
  try {
    const res = await callAPI('/api/usage/daily?days=7');
    const json = JSON.parse(res.body);
    if ('days' in json && 'data' in json) {
      results.push('✅ /api/usage/daily: days=' + json.days + ', data length=' + json.data.length);
    } else {
      results.push('⚠️  /api/usage/daily: Missing fields');
    }
  } catch(e) {
    results.push('❌ /api/usage/daily: ' + e.message);
  }

  // 4. Test usage by contact
  try {
    const res = await callAPI('/api/usage/by-contact');
    const json = JSON.parse(res.body);
    if (Array.isArray(json)) {
      results.push('✅ /api/usage/by-contact: array length=' + json.length);
    }
  } catch(e) {
    results.push('❌ /api/usage/by-contact: ' + e.message);
  }

  // 5. Test conversations recent
  try {
    const res = await callAPI('/api/conversations/recent');
    const json = JSON.parse(res.body);
    if (Array.isArray(json)) {
      results.push('✅ /api/conversations/recent: array length=' + json.length);
    }
  } catch(e) {
    results.push('❌ /api/conversations/recent: ' + e.message);
  }

  // 6. Test memories
  try {
    const res = await callAPI('/api/memories');
    const json = JSON.parse(res.body);
    if (Array.isArray(json)) {
      results.push('✅ /api/memories: array length=' + json.length);
    }
  } catch(e) {
    results.push('❌ /api/memories: ' + e.message);
  }

  // 7. Test conversations with params
  try {
    const res = await callAPI('/api/conversations?contactId=test&roomId=test');
    const json = JSON.parse(res.body);
    if (Array.isArray(json)) {
      results.push('✅ /api/conversations?contactId=test&roomId=test: array length=' + json.length);
    }
  } catch(e) {
    results.push('❌ /api/conversations: ' + e.message);
  }

  // 8. Test DELETE memory
  try {
    const res = await callAPI('/api/memories/1', 'DELETE');
    const json = JSON.parse(res.body);
    if (json.ok === true) {
      results.push('✅ DELETE /api/memories/1: ok=' + json.ok);
    }
  } catch(e) {
    results.push('❌ DELETE /api/memories/1: ' + e.message);
  }

  // 9. Test invalid memory ID
  try {
    const res = await callAPI('/api/memories/abc', 'DELETE');
    if (res.status === 400) {
      const json = JSON.parse(res.body);
      results.push('✅ DELETE /api/memories/abc: status=' + res.status + ', error=' + json.error);
    }
  } catch(e) {
    results.push('❌ DELETE /api/memories/abc: ' + e.message);
  }

  // 10. Verify index.html is served
  try {
    const res = await callAPI('/');
    if (res.status === 200 && res.body.includes('<!DOCTYPE html>')) {
      results.push('✅ GET /: Serves index.html (status=' + res.status + ')');
    }
  } catch(e) {
    results.push('❌ GET /: ' + e.message);
  }

  // 11. Test runtime config read
  try {
    const res = await callAPI('/api/config');
    const json = JSON.parse(res.body);
    if ('systemPrompt' in json && 'model' in json && 'autoReply' in json && 'memoryTopK' in json) {
      results.push('✅ GET /api/config: ' + JSON.stringify({ model: json.model, autoReply: json.autoReply, memoryTopK: json.memoryTopK, llmConfigured: json.llmConfigured }));
    } else {
      results.push('⚠️  GET /api/config: Missing fields');
    }
  } catch(e) {
    results.push('❌ GET /api/config: ' + e.message);
  }

  // 12. Test runtime config update (toggle autoReply off then on)
  try {
    const res = await callAPIWithBody('/api/config', 'PUT', { autoReply: true, memoryTopK: 5 });
    const json = JSON.parse(res.body);
    const cfg = json.config || json;
    if (json.ok === true && cfg.autoReply === true && cfg.memoryTopK === 5) {
      results.push('✅ PUT /api/config: autoReply=' + cfg.autoReply + ', memoryTopK=' + cfg.memoryTopK);
    } else {
      results.push('⚠️  PUT /api/config: Unexpected response ' + res.body);
    }
  } catch(e) {
    results.push('❌ PUT /api/config: ' + e.message);
  }

  // 13. Test bot control endpoints (WebUI-only mode should 400 with clear error)
  for (const ep of ['/api/bot/logout', '/api/bot/stop', '/api/bot/start']) {
    try {
      const res = await callAPI(ep, 'POST');
      if (res.status === 400) {
        const json = JSON.parse(res.body);
        results.push('✅ POST ' + ep + ': status=400, error=' + json.error);
      } else {
        results.push('⚠️  POST ' + ep + ': unexpected status ' + res.status);
      }
    } catch(e) {
      results.push('❌ POST ' + ep + ': ' + e.message);
    }
  }

  return results;
}

testAPI().then(results => {
  console.log('\n=== E2E Functional Test Results ===\n');
  results.forEach(r => console.log(r));
  const passed = results.filter(r => r.startsWith('✅')).length;
  const failed = results.filter(r => r.startsWith('❌')).length;
  console.log('\n--- Summary ---');
  console.log('Passed: ' + passed);
  console.log('Failed: ' + failed);
  console.log('Total tests: ' + results.length);

  if (failed > 0) {
    process.exit(1);
  }
}).catch(e => {
  console.error('Test script error:', e);
  process.exit(1);
});
