import { appendFileSync } from 'node:fs';
try {
    appendFileSync('/home/graham/workspace/experiments/oracle/tmp/test-write.log', 'Hello from test-write\n');
    console.log('Write successful');
} catch (e) {
    console.error('Write failed', e);
}
