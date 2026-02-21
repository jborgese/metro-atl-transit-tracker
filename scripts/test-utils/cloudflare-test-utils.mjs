import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const NPX_BIN = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function withDefaults(cwd, env) {
  return {
    cwd,
    env: { ...process.env, ...env },
  };
}

export async function runProcess(command, args, options = {}) {
  const { cwd = process.cwd(), env, expectFailure = false, timeoutMs = 120_000 } = options;
  const config = withDefaults(cwd, env);

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: config.cwd,
      env: config.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timeout = null;

    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeoutMs);
    }

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      reject(error);
    });

    child.on('exit', (code, signal) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      const exitCode = code ?? -1;
      const output = {
        command: [command, ...args].join(' '),
        exitCode,
        signal,
        stdout,
        stderr,
      };

      if (timedOut) {
        reject(
          new Error(
            `Command timed out after ${timeoutMs}ms: ${output.command}\n${stdout}\n${stderr}`
          )
        );
        return;
      }

      if (!expectFailure && exitCode !== 0) {
        reject(
          new Error(
            `Command failed (${exitCode}): ${output.command}\n${stdout}\n${stderr}`
          )
        );
        return;
      }

      if (expectFailure && exitCode === 0) {
        reject(
          new Error(
            `Command was expected to fail but succeeded: ${output.command}\n${stdout}\n${stderr}`
          )
        );
        return;
      }

      resolve(output);
    });
  });
}

export async function runNpm(args, options = {}) {
  return await runProcess(NPM_BIN, args, options);
}

export async function runWrangler(args, options = {}) {
  return await runProcess(NPX_BIN, ['wrangler', ...args], options);
}

export async function waitForHttpReady(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 500;
  const started = Date.now();
  let lastError = null;

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = new Error(`received status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }

  throw new Error(`Timed out waiting for ${url}: ${String(lastError)}`);
}

export async function requestJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();

  let data = null;
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    text,
    data,
    headers: response.headers,
  };
}

export function startWranglerDev(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env;
  const port = String(options.port ?? 8787);
  const ip = options.ip ?? '127.0.0.1';
  const wranglerArgs = ['wrangler', 'dev', '--local', '--ip', ip, '--port', port];

  if (options.envName) {
    wranglerArgs.push('--env', options.envName);
  }

  const vars = options.vars ?? {};
  for (const [key, value] of Object.entries(vars)) {
    wranglerArgs.push('--var', `${key}:${value}`);
  }

  const config = withDefaults(cwd, env);
  const useProcessGroup = process.platform !== 'win32';
  const child = spawn(NPX_BIN, wranglerArgs, {
    cwd: config.cwd,
    env: config.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    detached: useProcessGroup,
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += String(chunk);
  });

  async function stop() {
    if (child.exitCode !== null) {
      return;
    }

    if (process.platform === 'win32' && typeof child.pid === 'number') {
      try {
        await runProcess('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          cwd: config.cwd,
          env: config.env,
          timeoutMs: 10_000,
        });
      } catch {
        // Ignore if the process already exited.
      }

      await new Promise((resolve) => {
        if (child.exitCode !== null) {
          resolve();
          return;
        }
        child.once('exit', resolve);
        setTimeout(resolve, 2_000);
      });
      return;
    }

    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) {
          return;
        }
        done = true;
        resolve();
      };

      const pid = typeof child.pid === 'number' ? child.pid : null;
      child.once('exit', finish);

      try {
        if (useProcessGroup && pid !== null) {
          process.kill(-pid, 'SIGTERM');
        } else {
          child.kill('SIGTERM');
        }
      } catch {
        // Ignore if the process already exited.
      }

      setTimeout(() => {
        if (child.exitCode !== null) {
          return;
        }
        try {
          if (useProcessGroup && pid !== null) {
            process.kill(-pid, 'SIGKILL');
          } else {
            child.kill('SIGKILL');
          }
        } catch {
          // Ignore if the process already exited.
        }
      }, 3_000);

      // Avoid hanging forever if process signaling is not supported by the runtime.
      setTimeout(finish, 8_000);
    });
  }

  return {
    child,
    port: Number(port),
    getOutput() {
      return output;
    },
    stop,
  };
}
