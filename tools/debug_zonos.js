
const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 7860,
  timeout: 2000,
};

function checkPath(path) {
  return new Promise((resolve) => {
    const req = http.request({ ...options, path, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[${res.statusCode}] ${path}`);
        if (res.statusCode === 200 && path === '/info') {
             console.log('INFO RESPONSE:', data.substring(0, 500));
        }
        if (res.statusCode === 200 && path === '/config') {
             // Try to parse components to find the predict fn_index
             try {
                const config = JSON.parse(data);
                console.log('CONFIG FOUND. Dependencies:', config.dependencies.length);
                config.dependencies.forEach(dep => {
                    console.log(`- ID: ${dep.id}, Target: ${dep.targets}, Input: ${dep.inputs.length} items, Output: ${dep.outputs.length} items, ApiName: ${dep.api_name}`);
                });
             } catch (e) { console.log('Config parse error:', e.message); }
        }
        resolve(res.statusCode);
      });
    });
    
    req.on('error', (e) => {
      console.log(`[ERR] ${path}: ${e.message}`);
      resolve(null);
    });
    
    req.end();
  });
}

async function run() {
  console.log('Checking Zonos API...');
  await checkPath('/');
  await checkPath('/info');
  await checkPath('/config');
  await checkPath('/api/predict');
  await checkPath('/run/predict');
  await checkPath('/queue/join');
  await checkPath('/gradio_api/info');
}

run();
