"use strict";

function postWorkerMessage(type, requestId, payload) {
    self.postMessage({ type, requestId, ...(payload || {}) });
}

async function runWorkerSearch(message) {
    const requestId = String(message && message.requestId || "");
    const input = message && message.input || {};
    const startedAt = Date.now();

    try {
        postWorkerMessage("progress", requestId, {
            progress: {
                phase: "worker-start",
                done: 0,
                total: 1,
                elapsedMs: 0,
                message: "正在启动本地后台计算线程",
            },
        });

        const result = await WashSourceOptimizer.searchWashRoutes({
            initialState: input.initialState,
            targetIds: input.targetIds,
            talentData: TALENT_DATA,
            dlcMode: !!input.dlcMode,
            eligibleTalentIds: input.eligibleTalentIds,
            bagPills: input.bagPills,
            hasBagPills: !!input.hasBagPills,
            options: input.options,
            shouldCancel: () => false,
            onProgress: progress => postWorkerMessage("progress", requestId, {
                progress: { ...(progress || {}), elapsedMs: Date.now() - startedAt },
            }),
            onCandidate: candidate => postWorkerMessage("candidate", requestId, {
                result: candidate,
            }),
        });

        postWorkerMessage("result", requestId, { result });
    } catch (error) {
        postWorkerMessage("error", requestId, {
            error: error && error.message ? error.message : String(error || "后台搜索失败"),
        });
    }
}

// Keep the route planner fully local. These files contain no authorization or
// network calls; cancellation is handled by terminating this worker.
importScripts("sequence_rules.js", "data.js", "wash_route_engine.js", "wash_source_optimizer.js");

self.onmessage = async event => {
    const message = event && event.data || {};
    if (message.type === "start") await runWorkerSearch(message);
};
