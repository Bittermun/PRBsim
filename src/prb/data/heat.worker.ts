import { simulateHeat, type HeatParameters } from './heat.ts';

// A module worker is terminated by the session when cancelled; it never blocks the UI.
const heatWorker = self as unknown as {
    onmessage: ((event: MessageEvent<{ type: string; id: number; parameters: HeatParameters }>) => void) | null;
    postMessage: (message: unknown) => void;
};
heatWorker.onmessage = (event): void => {
    const request = event.data;
    if (request?.type !== 'run') return;
    try {
        heatWorker.postMessage({ type: 'result', id: request.id, result: simulateHeat(request.parameters) });
    } catch (error) {
        heatWorker.postMessage({ type: 'error', id: request.id, message: error instanceof Error ? error.message : 'Heat model failed.' });
    }
};
