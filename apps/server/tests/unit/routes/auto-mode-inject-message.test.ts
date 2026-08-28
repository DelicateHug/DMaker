import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createInjectMessageHandler } from '@/routes/auto-mode.js';
import type { AutoModeService } from '@/services/auto-mode-service.js';
import { createMockExpressContext } from '../../utils/mocks.js';

/**
 * Two different things wear one button here — steering a live session and
 * starting a whole new run — so every case below checks WHICH one happened as
 * well as whether it succeeded. A toast that says "sent" for a follow-up would
 * be a lie about a fresh CLI process.
 */
describe('auto-mode inject-message route', () => {
  let autoModeService: AutoModeService;
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();

    autoModeService = {
      injectMessage: vi.fn(),
      followUpFeature: vi.fn().mockResolvedValue(undefined),
    } as unknown as AutoModeService;

    const context = createMockExpressContext();
    req = context.req;
    res = context.res;
  });

  const handle = async () => {
    const handler = createInjectMessageHandler(autoModeService);
    await handler(req, res);
  };

  it('rejects a request with no message', async () => {
    req.body = { projectPath: '/test/project', featureId: 'f-1' };

    await handle();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(autoModeService.injectMessage).not.toHaveBeenCalled();
  });

  it('rejects a message that is only whitespace', async () => {
    req.body = { projectPath: '/test/project', featureId: 'f-1', message: '   \n ' };

    await handle();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(autoModeService.injectMessage).not.toHaveBeenCalled();
  });

  it('rejects a request with no featureId', async () => {
    req.body = { projectPath: '/test/project', message: 'hello' };

    await handle();

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('reports an injected message as injected', async () => {
    vi.mocked(autoModeService.injectMessage).mockResolvedValue({
      status: 'delivered',
      interrupted: false,
    });
    req.body = { projectPath: '/test/project', featureId: 'f-1', message: '  do this too  ' };

    await handle();

    expect(autoModeService.injectMessage).toHaveBeenCalledWith('f-1', 'do this too', {
      interrupt: false,
    });
    expect(autoModeService.followUpFeature).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, mode: 'injected', status: 'delivered' })
    );
  });

  it('passes the interrupt flag through only when it is true', async () => {
    vi.mocked(autoModeService.injectMessage).mockResolvedValue({
      status: 'delivered',
      interrupted: true,
    });
    req.body = {
      projectPath: '/test/project',
      featureId: 'f-1',
      message: 'stop and read this',
      interrupt: true,
    };

    await handle();

    expect(autoModeService.injectMessage).toHaveBeenCalledWith('f-1', 'stop and read this', {
      interrupt: true,
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ interrupted: true }));
  });

  it('falls back to a follow-up run when nothing is running, and says so', async () => {
    vi.mocked(autoModeService.injectMessage).mockResolvedValue({
      status: 'not_running',
      interrupted: false,
    });
    req.body = { projectPath: '/test/project', featureId: 'f-1', message: 'have another go' };

    await handle();

    expect(autoModeService.followUpFeature).toHaveBeenCalledWith(
      '/test/project',
      'f-1',
      'have another go'
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, mode: 'follow-up', status: 'not_running' })
    );
  });

  it('does not let a failing follow-up become an unhandled rejection', async () => {
    vi.mocked(autoModeService.injectMessage).mockResolvedValue({
      status: 'not_running',
      interrupted: false,
    });
    vi.mocked(autoModeService.followUpFeature).mockRejectedValue(new Error('no worktree'));
    req.body = { projectPath: '/test/project', featureId: 'f-1', message: 'have another go' };

    await handle();
    // The run reports itself through events; the request only starts it.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ mode: 'follow-up' }));
  });

  it('refuses rather than pretending when the run cannot take messages', async () => {
    vi.mocked(autoModeService.injectMessage).mockResolvedValue({
      status: 'unsupported_provider',
      interrupted: false,
    });
    req.body = { projectPath: '/test/project', featureId: 'f-1', message: 'hello' };

    await handle();

    // A follow-up is not available either: followUpFeature refuses while the
    // feature is running.
    expect(autoModeService.followUpFeature).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        mode: 'none',
        status: 'unsupported_provider',
        error: expect.stringContaining('only the main Claude agent'),
      })
    );
  });

  it('says the run has finished its last turn when the channel has closed', async () => {
    vi.mocked(autoModeService.injectMessage).mockResolvedValue({
      status: 'run_finished',
      interrupted: false,
    });
    req.body = { projectPath: '/test/project', featureId: 'f-1', message: 'hello' };

    await handle();

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        status: 'run_finished',
        error: expect.stringContaining('already finished'),
      })
    );
  });

  it('turns a thrown error into a 500', async () => {
    vi.mocked(autoModeService.injectMessage).mockRejectedValue(new Error('boom'));
    req.body = { projectPath: '/test/project', featureId: 'f-1', message: 'hello' };

    await handle();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'boom' });
  });
});
