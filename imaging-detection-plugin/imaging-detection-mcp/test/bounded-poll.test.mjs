import assert from "node:assert/strict";
import { test } from "node:test";

import { TASK_STATUS, runBoundedPoll } from "../src/imaging-task-api.mjs";

// A deterministic fake clock: now() reads a mutable value, sleepFn advances it.
function fakeClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    sleepFn: async (ms) => {
      current += ms;
    },
  };
}

test("runBoundedPoll queries once and returns immediately when already completed", async () => {
  let calls = 0;
  const clock = fakeClock();
  const result = await runBoundedPoll({
    queryOnce: async () => {
      calls += 1;
      return { taskId: "t", status: TASK_STATUS.COMPLETED };
    },
    waitMs: 60000,
    pollIntervalMs: 5000,
    now: clock.now,
    sleepFn: clock.sleepFn,
  });

  assert.equal(calls, 1);
  assert.equal(result.status, TASK_STATUS.COMPLETED);
});

test("runBoundedPoll with waitMs=0 does a single check and returns running", async () => {
  let calls = 0;
  const clock = fakeClock();
  const result = await runBoundedPoll({
    queryOnce: async () => {
      calls += 1;
      return { taskId: "t", status: TASK_STATUS.RUNNING };
    },
    waitMs: 0,
    pollIntervalMs: 5000,
    now: clock.now,
    sleepFn: clock.sleepFn,
  });

  assert.equal(calls, 1);
  assert.equal(result.status, TASK_STATUS.RUNNING);
});

test("runBoundedPoll keeps polling until the task completes within budget", async () => {
  let calls = 0;
  const clock = fakeClock();
  const result = await runBoundedPoll({
    queryOnce: async () => {
      calls += 1;
      // Running for the first two polls, then completes on the third.
      return calls < 3
        ? { taskId: "t", status: TASK_STATUS.RUNNING }
        : { taskId: "t", status: TASK_STATUS.COMPLETED, viewUrl: "http://v" };
    },
    waitMs: 60000,
    pollIntervalMs: 5000,
    now: clock.now,
    sleepFn: clock.sleepFn,
  });

  assert.equal(calls, 3);
  assert.equal(result.status, TASK_STATUS.COMPLETED);
  assert.equal(result.viewUrl, "http://v");
});

test("runBoundedPoll returns running when the wait budget is exhausted", async () => {
  let calls = 0;
  const clock = fakeClock();
  const result = await runBoundedPoll({
    queryOnce: async () => {
      calls += 1;
      return { taskId: "t", status: TASK_STATUS.RUNNING };
    },
    waitMs: 12000, // budget only allows a couple of 5s polls
    pollIntervalMs: 5000,
    now: clock.now,
    sleepFn: clock.sleepFn,
  });

  // Queries at t=0, 5000, 10000; at t=10000 remaining=2000>0 sleeps 2000 to
  // t=12000, queries again, remaining=0 -> returns running. => 4 calls.
  assert.equal(result.status, TASK_STATUS.RUNNING);
  assert.equal(calls, 4);
});

test("runBoundedPoll never sleeps past the deadline (last sleep is clamped)", async () => {
  const sleeps = [];
  const clock = fakeClock();
  await runBoundedPoll({
    queryOnce: async () => ({ taskId: "t", status: TASK_STATUS.RUNNING }),
    waitMs: 7000,
    pollIntervalMs: 5000,
    now: clock.now,
    sleepFn: async (ms) => {
      sleeps.push(ms);
      await clock.sleepFn(ms);
    },
  });

  // First sleep is a full interval (5000), second is clamped to remaining (2000).
  assert.deepEqual(sleeps, [5000, 2000]);
});

test("runBoundedPoll returns immediately on failure without further polling", async () => {
  let calls = 0;
  const clock = fakeClock();
  const result = await runBoundedPoll({
    queryOnce: async () => {
      calls += 1;
      return { taskId: "t", status: TASK_STATUS.FAILED, message: "boom" };
    },
    waitMs: 60000,
    pollIntervalMs: 5000,
    now: clock.now,
    sleepFn: clock.sleepFn,
  });

  assert.equal(calls, 1);
  assert.equal(result.status, TASK_STATUS.FAILED);
});
