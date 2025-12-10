# PM2 Dev Mode Recovery Utility

## Description:
Generates shell commands to accurately recreate PM2 processes based on a dump file.

Unlike `pm2 resurrect` or `pm2 update`, this tries to recreate pm2 processes **WITHOUT** carrying over old environments (env setting or nodeJS absolute paths). 

This is useful to recreate the pm2 processes, like after switching NVM version.

## Usage:
- `npx pm2-recover [OPTIONS]`
- `node pm2-recover.js [OPTIONS]` (running directly)

## Options:
- `-f`, `--dumpFile` `<path>`: (Optional) Specify a custom PM2 dump file path. Defaults to `~/.pm2/dump.pm2`.
- `-o`, `--outFile` `<path>`: (Optional) Write generated commands to a file instead of stdout.
- `-h`, `--help`: (Optional) Prints a help message.

## Features:
- Preserves process status: Processes with status `stopped` are started then immediately stopped.
- Preserves watch mode: The `--watch` flag is added if defined in the original configuration.
- Ignore old node paths: Switches old absolute Node paths to generic commands for environment flexibility.

## Example:

- `npx pm2-recover -f /path/to/custom-pm2-dump.json`: custom dump.pm2 path
- `npx pm2-recover -o recovery-script.sh`: writes the output to a file
- `npx pm2-recover | bash`: directly try to execute the output by piping to bash. Make sure you've inspected the output beforehand.

For switching nvm managed node version, ensure when you run the generated script, you're using the desired node version as `pm2` keeps track of absolute path to the node executable.
