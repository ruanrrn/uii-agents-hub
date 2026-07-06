import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TASK_STATUS,
  extractDiagnostic,
  mapStatus,
  resolveResultLabel,
} from "../src/imaging-task-api.mjs";

const LABEL = "CT_BRAIN";

test("mapStatus maps numeric AI Task status to task states", () => {
  assert.equal(mapStatus(4), TASK_STATUS.COMPLETED);
  assert.equal(mapStatus(3), TASK_STATUS.FAILED);
  assert.equal(mapStatus(1), TASK_STATUS.RUNNING);
  assert.equal(mapStatus(0), TASK_STATUS.RUNNING);
  assert.equal(mapStatus(undefined), TASK_STATUS.RUNNING);
});

test("resolveResultLabel recovers label and type from the result", () => {
  assert.deepEqual(resolveResultLabel({ ai_result: { CT_BRAIN: {} } }), {
    label: "CT_BRAIN",
    type: "ich",
  });
  assert.deepEqual(resolveResultLabel({ ai_result: { CT_RIB: {} } }), {
    label: "CT_RIB",
    type: "rib",
  });
});

test("resolveResultLabel prefers a recognized label over unknown keys", () => {
  const resolved = resolveResultLabel({
    ai_result: { SOMETHING_ELSE: {}, CT_BRAIN: {} },
  });
  assert.equal(resolved.label, "CT_BRAIN");
  assert.equal(resolved.type, "ich");
});

test("resolveResultLabel falls back to first key with empty type when unknown", () => {
  const resolved = resolveResultLabel({ ai_result: { CT_UNKNOWN: {} } });
  assert.equal(resolved.label, "CT_UNKNOWN");
  assert.equal(resolved.type, "");
});

test("resolveResultLabel throws when there are no labels", () => {
  assert.throws(() => resolveResultLabel({ ai_result: {} }), /没有任何算法标签/);
  assert.throws(() => resolveResultLabel({}), /没有任何算法标签/);
});

test("extractDiagnostic parses findings, conclusions, emergencies and viewUrl", () => {
  const result = {
    ai_result: {
      [LABEL]: {
        viewUrl: "http://viewer/index?StudyUID=1",
        seriesList: [
          {
            imageFindings: "左侧基底节区高密度影",
            conclusion: "脑出血",
            emergency: [
              {
                hasEmergency: true,
                aiContents: { content: "<b>脑出血</b>危急值" },
              },
              {
                hasEmergency: false,
                aiContents: { content: "不应出现" },
              },
            ],
          },
        ],
      },
    },
  };

  const diagnostic = extractDiagnostic(result, LABEL);
  assert.deepEqual(diagnostic.findings, ["左侧基底节区高密度影"]);
  assert.deepEqual(diagnostic.conclusions, ["脑出血"]);
  assert.deepEqual(diagnostic.emergencies, ["脑出血危急值"]); // tags stripped
  assert.equal(diagnostic.viewUrl, "http://viewer/index?StudyUID=1");
});

test("extractDiagnostic reads from algorithmResult.data container when present", () => {
  const result = {
    ai_result: {
      [LABEL]: {
        data: {
          viewUrl: "http://viewer/from-data",
          seriesList: [{ imageFindings: "所见A", conclusion: "结论A" }],
        },
      },
    },
  };

  const diagnostic = extractDiagnostic(result, LABEL);
  assert.deepEqual(diagnostic.findings, ["所见A"]);
  assert.deepEqual(diagnostic.conclusions, ["结论A"]);
  assert.equal(diagnostic.viewUrl, "http://viewer/from-data");
});

test("extractDiagnostic deduplicates and drops empty values across series", () => {
  const result = {
    ai_result: {
      [LABEL]: {
        seriesList: [
          { imageFindings: "重复所见", conclusion: "" },
          { imageFindings: "重复所见", conclusion: "结论" },
          { imageFindings: "  ", conclusion: "结论" },
        ],
      },
    },
  };

  const diagnostic = extractDiagnostic(result, LABEL);
  assert.deepEqual(diagnostic.findings, ["重复所见"]);
  assert.deepEqual(diagnostic.conclusions, ["结论"]);
  assert.deepEqual(diagnostic.emergencies, []);
});

test("extractDiagnostic uses emergencyItem when aiContents.content is absent", () => {
  const result = {
    ai_result: {
      [LABEL]: {
        seriesList: [
          {
            emergency: [{ hasEmergency: true, emergencyItem: "中线移位" }],
          },
        ],
      },
    },
  };

  const diagnostic = extractDiagnostic(result, LABEL);
  assert.deepEqual(diagnostic.emergencies, ["中线移位"]);
});

test("extractDiagnostic handles missing seriesList gracefully", () => {
  const result = { ai_result: { [LABEL]: { viewUrl: "http://v" } } };
  const diagnostic = extractDiagnostic(result, LABEL);
  assert.deepEqual(diagnostic.findings, []);
  assert.deepEqual(diagnostic.conclusions, []);
  assert.deepEqual(diagnostic.emergencies, []);
  assert.equal(diagnostic.viewUrl, "http://v");
});

test("extractDiagnostic throws with available labels when label is missing", () => {
  const result = { ai_result: { CT_RIB: {} } };
  assert.throws(() => extractDiagnostic(result, LABEL), /CT_BRAIN/);
  assert.throws(() => extractDiagnostic(result, LABEL), /CT_RIB/);
});

test("extractDiagnostic reports 无 when ai_result is empty", () => {
  assert.throws(() => extractDiagnostic({}, LABEL), /无/);
});
