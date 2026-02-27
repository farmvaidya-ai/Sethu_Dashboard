const { exec } = require('child_process');
const os = require('os');

const scriptName = process.argv[2];

if (!scriptName) {
    console.error('Please provide a script name partial match.');
    process.exit(0);
}

console.log(`🔍 Checking for processes matching "${scriptName}"...`);

if (os.platform() !== 'win32') {
    // Linux/Mac/Unix
    exec(`ps ax -o pid,command | grep "${scriptName}" | grep -v grep`, (err, stdout) => {
        if (err || !stdout) {
            console.log(`ℹ️  No previous process found.`);
            return;
        }

        const lines = stdout.trim().split('\n');
        const pidsToKill = [];

        lines.forEach(line => {
            // "ps ax -o pid,command" outputs e.g. "12345 node scripts/sync-realtime.js"
            const parts = line.trim().split(/\s+/, 2); // Split by space, keeping rest of line
            const pid = parts[0];
            const command = line.substring(line.indexOf(parts[1]) || 0).toLowerCase();

            if (!/^\d+$/.test(pid)) return; // Skip invalid
            if (pid === process.pid.toString()) return; // Skip self

            // Skip the kill-process script and npm run sequences
            if (command.includes('kill-process') || command.includes('npm run')) return;

            pidsToKill.push(pid);
        });

        if (pidsToKill.length > 0) {
            console.log(`Found PIDs to kill: ${pidsToKill.join(', ')}.`);
            exec(`kill -9 ${pidsToKill.join(' ')}`, (killErr) => {
                if (!killErr) console.log(`✅ Killed existing processes matching "${scriptName}".`);
                else console.log('⚠️ Failed to kill processes.');
            });
        } else {
            console.log(`ℹ️  No previous process found.`);
        }
    });
} else {
    // Windows Implementation
    // Use CSV format to easily parse command line and PID
    const query = `wmic process where "name='node.exe' and commandline like '%${scriptName}%'" get commandline,processid /format:csv`;

    exec(query, (err, stdout) => {
        if (err) {
            // wmic returns error if no instances found, which is fine
            console.log(`ℹ️  No previous process found (or query check failed).`);
            return;
        }

        const lines = stdout.trim().split(/\r?\n/);
        const pidsToKill = [];

        lines.forEach(line => {
            const parts = line.split(',');
            // CSV format: Node,CommandLine,ProcessId
            const pid = parts[parts.length - 1].trim();

            if (!/^\d+$/.test(pid)) return; // Skip header

            const fullLine = line.toLowerCase();
            const currentPid = process.pid.toString();

            // Check if it's THIS process
            if (pid === currentPid) {
                console.log(`ℹ️  Skipping current process (PID: ${pid})`);
                return;
            }

            // Check if it's the kill-process script itself
            if (fullLine.includes('kill-process')) {
                console.log(`ℹ️  Skipping kill-process script (PID: ${pid})`);
                return;
            }

            pidsToKill.push(pid);
        });

        if (pidsToKill.length > 0) {
            console.log(`Found PIDs to kill: ${pidsToKill.join(', ')}.`);
            // Force kill
            exec(`taskkill /F /PID ${pidsToKill.join(' /PID ')}`, (killErr) => {
                if (!killErr) console.log('✅ Killed existing processes.');
                else console.log('⚠️ Failed to kill processes (might be already dead).');
            });
        } else {
            console.log(`ℹ️  No matching process found.`);
        }
    });
}
