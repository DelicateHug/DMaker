# Deploy Scripts

This folder contains deployment scripts that can be executed through DMaker's deploy functionality.

## Available Scripts

### Hello World Examples

These are example scripts that demonstrate the basic structure of deploy scripts:

- **hello-world.js** - Node.js version
- **hello-world.ps1** - PowerShell version (Windows)
- **hello-world.py** - Python version
- **hello-world.sh** - Bash version (Linux/macOS)

## Supported Script Types

The deploy service supports the following script types:

| Extension | Type       | Runtime                 |
| --------- | ---------- | ----------------------- |
| `.js`     | Node.js    | `node`                  |
| `.ts`     | TypeScript | `npx tsx`               |
| `.py`     | Python     | `python`                |
| `.ps1`    | PowerShell | `powershell.exe`/`pwsh` |
| `.sh`     | Bash       | `bash`                  |
| `.bat`    | Batch      | `cmd.exe`               |
| `.cmd`    | Batch      | `cmd.exe`               |

## How Deploy Scripts Work

1. **Discovery**: The deploy service automatically discovers all scripts in this folder
2. **Execution**: Scripts run in the project root directory (not in `.dmaker/deploy`)
3. **Output Capture**: All stdout/stderr is captured and streamed to the UI
4. **Timeout**: Scripts have a default 5-minute timeout
5. **History**: All script runs are tracked in memory

## Script Best Practices

### Exit Codes

Always exit with appropriate codes:

```javascript
// Success
process.exit(0);

// Failure
process.exit(1);
```

### Environment Variables

Scripts inherit all environment variables from the Node.js process:

```javascript
const apiKey = process.env.API_KEY;
const environment = process.env.NODE_ENV || 'development';
```

### Working Directory

Scripts always execute from the project root:

```javascript
// Current directory is the project root, not .dmaker/deploy
console.log(process.cwd()); // /path/to/your/project
```

### Output

Use console output for progress updates:

```javascript
console.log('Building application...');
console.log('Running tests...');
console.log('Deploying to production...');
```

## Example Real-World Deploy Script

Here's a more realistic example for deploying to a cloud platform:

```javascript
#!/usr/bin/env node

const { execSync } = require('child_process');

console.log('🚀 Starting deployment...');

try {
  // Build the application
  console.log('📦 Building application...');
  execSync('npm run build', { stdio: 'inherit' });

  // Run tests
  console.log('🧪 Running tests...');
  execSync('npm test', { stdio: 'inherit' });

  // Deploy to cloud platform
  console.log('☁️  Deploying to cloud...');
  execSync('aws s3 sync ./dist s3://my-bucket', { stdio: 'inherit' });

  // Invalidate CDN cache
  console.log('🔄 Invalidating CDN cache...');
  execSync('aws cloudfront create-invalidation --distribution-id XXXX --paths "/*"', {
    stdio: 'inherit',
  });

  console.log('✅ Deployment completed successfully!');
  process.exit(0);
} catch (error) {
  console.error('❌ Deployment failed:', error.message);
  process.exit(1);
}
```

## Creating Your Own Scripts

1. Create a new file in this directory with a supported extension
2. Make it executable (on Unix systems): `chmod +x your-script.sh`
3. Add your deployment logic
4. Test it locally before using in production

## Security Notes

- **Never commit sensitive credentials** to deploy scripts
- Use environment variables for API keys and secrets
- Ensure scripts validate inputs and handle errors gracefully
- Be cautious with destructive operations (deletions, force pushes, etc.)

## Troubleshooting

### Script not appearing in UI

- Check that the file extension is supported
- Ensure the file is directly in `.dmaker/deploy/` (not in a subdirectory)
- Verify the file has proper permissions

### Script times out

- Default timeout is 5 minutes (300,000ms)
- Long-running deployments may need to be broken into smaller steps
- Consider adding progress output to show the script is still running

### Script fails with permission error

- On Unix systems, make scripts executable: `chmod +x script.sh`
- On Windows, ensure PowerShell execution policy allows scripts
- Check that required tools (node, python, aws-cli, etc.) are installed
