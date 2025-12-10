import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { spawn } from 'bun'
import path from 'path'
import fs from 'fs'
import os from 'os'

const SCRIPT_PATH = path.join(import.meta.dir, 'pm2-recover.js')
const TEST_TMP_DIR = path.join(os.tmpdir(), 'pm2-recover-tests-' + Date.now())

// Helper to execute the script and capture output
async function runRecoverScript(args = []) {
    // Spawn the node process running our script
    const proc = spawn(['node', SCRIPT_PATH, ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
        cwd: import.meta.dir, // Run from the project root
        env: { ...process.env }, // Pass environment
    })

    // Capture output
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    return { stdout, stderr, exitCode }
}

describe('pm2-recover.js CLI', () => {
    beforeAll(() => {
        // Setup temp directory for test files
        fs.mkdirSync(TEST_TMP_DIR, { recursive: true })
    })

    afterAll(() => {
        // Cleanup temp directory
        fs.rmSync(TEST_TMP_DIR, { recursive: true, force: true })
    })

    test('1. input file not exist: must raise an error', async () => {
        const nonExistentFile = path.join(TEST_TMP_DIR, 'does-not-exist.json')
        const { exitCode, stderr } = await runRecoverScript([
            '-f',
            nonExistentFile,
        ])

        expect(exitCode).toBe(1)
        expect(stderr).toContain('File not found')
    })

    test('2. input file not being valid JSON: must raise an error', async () => {
        const invalidJsonFile = path.join(TEST_TMP_DIR, 'invalid.json')
        fs.writeFileSync(invalidJsonFile, '{ this is not json }')

        const { exitCode, stderr } = await runRecoverScript([
            '-f',
            invalidJsonFile,
        ])

        expect(exitCode).toBe(1)
        expect(stderr).toContain('Error processing file')
    })

    test('3. input file valid JSON but missing keys: must raise an error', async () => {
        const missingKeysFile = path.join(TEST_TMP_DIR, 'missing-keys.json')
        // Missing 'pm_cwd', 'pm_exec_path'
        const incompleteData = [{ name: 'app1' }]
        fs.writeFileSync(missingKeysFile, JSON.stringify(incompleteData))

        const { exitCode, stderr } = await runRecoverScript([
            '-f',
            missingKeysFile,
        ])

        expect(exitCode).toBe(1)
        expect(stderr).toContain('missing required key')
    })

    test('4. Pattern A: Shell-wrapped commands (args[0] == "-c")', async () => {
        const file = path.join(TEST_TMP_DIR, 'pattern-a.json')
        const data = [
            {
                name: 'shell-app',
                pm_cwd: '/var/www/html',
                pm_exec_path: '/usr/bin/npm', // Ignored in this pattern
                status: 'online',
                args: ['-c', 'npm run start:prod'],
                watch: false,
            },
        ]
        fs.writeFileSync(file, JSON.stringify(data))

        const { exitCode, stdout } = await runRecoverScript(['-f', file])

        expect(exitCode).toBe(0)
        expect(stdout).toContain('cd "/var/www/html"')
        expect(stdout).toContain('pm2 start --name shell-app')
        // Should contain the quoted command string directly
        expect(stdout).toContain("'npm run start:prod'")
    })

    test('5. Pattern B: NVM managed node paths', async () => {
        const file = path.join(TEST_TMP_DIR, 'pattern-b.json')
        // Construct a path that triggers the NVM check: .../nvm/versions/node/...
        const nvmExecPath = path.join(
            '/home/user/.nvm/versions/node/v18.0.0/bin/node'
        )
        const data = [
            {
                name: 'nvm-app',
                pm_cwd: '/home/user/backend',
                pm_exec_path: nvmExecPath,
                status: 'online',
                args: ['node', 'dist/server.js'],
                watch: false,
            },
        ]
        fs.writeFileSync(file, JSON.stringify(data))

        const { exitCode, stdout } = await runRecoverScript(['-f', file])

        expect(exitCode).toBe(0)
        expect(stdout).toContain('cd "/home/user/backend"')
        // Should use 'node' (args[0]) instead of absolute path
        expect(stdout).toContain("'node' -- 'dist/server.js'")
    })

    test('6. Pattern C: Direct execution / Relative paths', async () => {
        const file = path.join(TEST_TMP_DIR, 'pattern-c.json')
        const data = [
            {
                name: 'direct-app',
                pm_cwd: '/home/user/app',
                pm_exec_path: '/home/user/app/index.js',
                status: 'stopped', // Check stopped status too
                args: ['--port', '3000'],
                watch: true,
            },
        ]
        fs.writeFileSync(file, JSON.stringify(data))

        const { exitCode, stdout } = await runRecoverScript(['-f', file])

        expect(exitCode).toBe(0)
        expect(stdout).toContain('cd "/home/user/app"')
        expect(stdout).toContain('--watch')
        // Check relative path syntax (./index.js or .\index.js)
        const expectedCmd = `'.${path.sep}index.js'`
        expect(stdout).toContain(expectedCmd)
        expect(stdout).toContain("'--port' '3000'")
        // Check stopped status handling
        expect(stdout).toContain('pm2 stop direct-app')
    })
})
