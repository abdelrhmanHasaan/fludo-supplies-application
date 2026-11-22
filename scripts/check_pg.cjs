const { execSync } = require('child_process');
const net = require('net');

try {
  const out = execSync('wmic process where "name=\'postgres.exe\'" get ProcessId,CommandLine', { encoding: 'utf8' });
  console.log('WMIC output:\n', out);
} catch (e) {
  console.error('wmic error:', e.message);
}

// Check common ports
[5432, 5433, 5434, 5435].forEach(port => {
  const s = net.createConnection(port, '127.0.0.1');
  s.on('connect', () => {
    console.log(`Port ${port} is OPEN and accepting connections!`);
    s.destroy();
  });
  s.on('error', () => {});
});
