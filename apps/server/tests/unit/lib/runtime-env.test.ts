import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getEnvName,
  getPeerUrl,
  getRole,
  getRunnerUrl,
  getRuntimeInfo,
  getSelfProjectPath,
  isReadOnly,
  isRunner,
  isSelfUpdateEnabled,
  RESTART_EXIT_CODE,
} from '@/lib/runtime-env.js';

const MANAGED_VARS = [
  'DMAKER_ROLE',
  'DMAKER_ENV',
  'DMAKER_READ_ONLY',
  'DMAKER_PEER_URL',
  'DMAKER_SELF_URL',
  'DMAKER_RUNNER_URL',
  'DMAKER_SELF_PROJECT',
  'DMAKER_LAUNCHER_MANAGED',
  'HOSTNAME',
];

describe('runtime-env.ts', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const name of MANAGED_VARS) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of MANAGED_VARS) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  describe('getEnvName', () => {
    it('honours an explicit DMAKER_ENV', () => {
      process.env.DMAKER_ENV = 'prod';
      expect(getEnvName()).toBe('prod');
      process.env.DMAKER_ENV = 'dev';
      expect(getEnvName()).toBe('dev');
    });

    it('ignores a value that is neither dev nor prod', () => {
      process.env.DMAKER_ENV = 'staging';
      // Falls back to the source/dist split — under vitest that is source, so dev.
      expect(getEnvName()).toBe('dev');
    });
  });

  describe('getRole', () => {
    it('defaults to app', () => {
      expect(getRole()).toBe('app');
      expect(isRunner()).toBe(false);
    });

    it('recognises the runner role', () => {
      process.env.DMAKER_ROLE = 'runner';
      expect(getRole()).toBe('runner');
      expect(isRunner()).toBe(true);
    });
  });

  describe('isReadOnly', () => {
    it('is off unless asked for', () => {
      expect(isReadOnly()).toBe(false);
    });

    it('accepts true and 1', () => {
      process.env.DMAKER_READ_ONLY = 'true';
      expect(isReadOnly()).toBe(true);
      process.env.DMAKER_READ_ONLY = '1';
      expect(isReadOnly()).toBe(true);
    });

    it('treats anything else as off', () => {
      process.env.DMAKER_READ_ONLY = 'false';
      expect(isReadOnly()).toBe(false);
      process.env.DMAKER_READ_ONLY = '';
      expect(isReadOnly()).toBe(false);
    });

    // Executing is the runner's entire job; a stray flag must not disarm it.
    it('never applies to a runner', () => {
      process.env.DMAKER_ROLE = 'runner';
      process.env.DMAKER_READ_ONLY = 'true';
      expect(isReadOnly()).toBe(false);
    });
  });

  describe('getPeerUrl', () => {
    it('uses the launcher-supplied URL when there is one', () => {
      process.env.DMAKER_PEER_URL = 'http://localhost:3007/';
      expect(getPeerUrl()).toBe('http://localhost:3007');
    });

    it('points dev at the prod UI port by default', () => {
      process.env.DMAKER_ENV = 'dev';
      expect(getPeerUrl()).toBe('http://localhost:3007');
    });

    it('points prod at the dev UI port by default', () => {
      process.env.DMAKER_ENV = 'prod';
      expect(getPeerUrl()).toBe('http://localhost:3017');
    });
  });

  describe('getRunnerUrl', () => {
    it('is null when execution should stay in process', () => {
      expect(getRunnerUrl()).toBeNull();
    });

    it('resolves the "auto" shorthand to the default runner port', () => {
      process.env.DMAKER_RUNNER_URL = 'auto';
      expect(getRunnerUrl()).toBe('http://127.0.0.1:3029');
    });

    it('trims a trailing slash off an explicit URL', () => {
      process.env.DMAKER_RUNNER_URL = 'http://127.0.0.1:4000/';
      expect(getRunnerUrl()).toBe('http://127.0.0.1:4000');
    });

    // A runner delegating to itself would be an infinite loop.
    it('is always null for a runner', () => {
      process.env.DMAKER_ROLE = 'runner';
      process.env.DMAKER_RUNNER_URL = 'http://127.0.0.1:3029';
      expect(getRunnerUrl()).toBeNull();
    });
  });

  describe('getSelfProjectPath', () => {
    it('is null when the launcher did not set one', () => {
      expect(getSelfProjectPath()).toBeNull();
    });

    it('returns an absolute path', () => {
      process.env.DMAKER_SELF_PROJECT = process.cwd();
      expect(getSelfProjectPath()).toBe(process.cwd());
    });
  });

  describe('isSelfUpdateEnabled', () => {
    const enable = () => {
      process.env.DMAKER_ENV = 'prod';
      process.env.DMAKER_SELF_PROJECT = process.cwd();
      process.env.DMAKER_LAUNCHER_MANAGED = 'true';
    };

    it('is on for a launcher-managed prod server that knows its checkout', () => {
      enable();
      expect(isSelfUpdateEnabled()).toBe(true);
    });

    it('is off on dev', () => {
      enable();
      process.env.DMAKER_ENV = 'dev';
      expect(isSelfUpdateEnabled()).toBe(false);
    });

    it('is off when read-only', () => {
      enable();
      process.env.DMAKER_READ_ONLY = 'true';
      expect(isSelfUpdateEnabled()).toBe(false);
    });

    // Without a supervisor, exiting for a restart would just kill prod.
    it('is off when nothing is supervising the process', () => {
      enable();
      delete process.env.DMAKER_LAUNCHER_MANAGED;
      expect(isSelfUpdateEnabled()).toBe(false);
    });

    it('is off when the checkout path is unknown', () => {
      enable();
      delete process.env.DMAKER_SELF_PROJECT;
      expect(isSelfUpdateEnabled()).toBe(false);
    });

    it('is off for the runner', () => {
      enable();
      process.env.DMAKER_ROLE = 'runner';
      expect(isSelfUpdateEnabled()).toBe(false);
    });
  });

  describe('getRuntimeInfo', () => {
    it('reports the pair as a whole', () => {
      process.env.DMAKER_ENV = 'dev';
      process.env.DMAKER_READ_ONLY = 'true';
      process.env.DMAKER_LAUNCHER_MANAGED = 'true';

      const info = getRuntimeInfo();
      expect(info.env).toBe('dev');
      expect(info.peerEnv).toBe('prod');
      expect(info.readOnly).toBe(true);
      expect(info.launcherManaged).toBe(true);
      expect(info.selfUpdateEnabled).toBe(false);
    });
  });

  it('uses a restart exit code the launcher can tell apart from a crash', () => {
    expect(RESTART_EXIT_CODE).toBe(75);
    expect(RESTART_EXIT_CODE).not.toBe(0);
    expect(RESTART_EXIT_CODE).not.toBe(1);
  });
});
