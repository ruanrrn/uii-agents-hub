// src/data/capabilities.ts —— 唯一数据源
// 当前 ICH / Rib 已填充完整信息并可见，其余 Skill 留空，后续逐个补充后放出。
import type { Capability, SkillDetail } from '@/types/capability';

const empty = { zh: '', en: '' };

const blankI18n = (title: { zh: string; en: string }) => ({
  title,
  tagline: { ...empty },
  description: { ...empty },
  clinicalUse: { ...empty },
  overview: { ...empty }
});

const blankMcp = (serverKey: string) => ({
  serverKey,
  endpointUrl: `https://hub.uii-ai.example/mcp/${serverKey}`,
  tools: [],
  prompts: [],
  resources: []
});

const ichDetail: SkillDetail = {
  intro: {
    zh: '当急诊科医生需要评估患者头颅 CT 是否存在颅内出血时，自动完成 ICH 筛查与量化分析，输出结构化分诊结论，辅助医生快速识别危急病情',
    en: "When an ER physician needs to evaluate a patient's head CT for intracranial hemorrhage, this Skill automatically performs ICH screening and quantitative analysis, outputs a structured triage summary, and assists the physician in rapidly identifying critical conditions"
  },
  stats: [
    {
      label: { zh: 'AI 灵敏度', en: 'AI Sensitivity' },
      value: '92%',
      sub: { zh: 'ICH 阳性检出\nFDA 验证集', en: 'ICH positive detection\nFDA validation set' }
    },
    {
      label: { zh: 'AI 特异度', en: 'AI Specificity' },
      value: '95%',
      sub: { zh: 'ICH 阴性排除\nFDA 验证集', en: 'ICH negative exclusion\nFDA validation set' }
    },
    {
      label: { zh: '覆盖出血亚型', en: 'Hemorrhage subtypes' },
      value: '5',
      sub: { zh: 'IPH · IVH · SAH\nSDH · EDH', en: 'IPH · IVH · SAH\nSDH · EDH' }
    }
  ],
  capabilities: [
    {
      zh: '检测颅内出血阳性/阴性，输出总体积及 5 种亚型分量（IPH / IVH / SAH / SDH / EDH）',
      en: 'Detect ICH positive/negative, output total volume and 5 subtype volumes (IPH / IVH / SAH / SDH / EDH)'
    },
    {
      zh: '检出水肿并量化中线位移距离及方向',
      en: 'Detect edema and quantify midline shift distance and direction'
    },
    {
      zh: '按预设固化规则自动判定危急值，具体阈值可按医院实际应用情况调整',
      en: 'Automatically determine critical values by preset fixed rules, with specific thresholds adjustable per hospital settings'
    },
    {
      zh: '生成结构化分诊摘要',
      en: 'Generate structured triage summary'
    }
  ],
  workflow: [
    {
      nodeType: 'default',
      nodeLabel: '①',
      title: { zh: '医生自然语言请求', en: 'Physician natural language request' },
      desc: {
        zh: '急诊医生向 Agent 描述评估需求时，或 PACS 收到新扫描完成事件后自动触发',
        en: 'ER physician describes assessment needs to Agent, or PACS triggers automatically upon new scan completion'
      }
    },
    {
      nodeType: 'default',
      nodeLabel: '②',
      title: { zh: 'Agent 前置检查确认', en: 'Agent pre-flight check' },
      desc: {
        zh: '确认影像 MCP 工具可用',
        en: 'Confirm imaging MCP tools are available'
      }
    },
    {
      nodeType: 'warn',
      nodeLabel: '③',
      title: { zh: '去标识化', en: 'De-identification' },
      desc: {
        zh: '影像出院内网前必须完成，调用 PACS 去标识化工具处理 DICOM',
        en: 'Must be completed before images leave the intranet; call PACS de-identification tool to process DICOM'
      }
    },
    {
      nodeType: 'mcp',
      nodeLabel: 'MCP',
      title: { zh: '提交推理', en: 'Submit inference' },
      desc: {
        zh: '传入去标识后 DICOM URI，返回 taskId',
        en: 'Pass de-identified DICOM URI, returns taskId'
      }
    },
    {
      nodeType: 'mcp',
      nodeLabel: 'MCP',
      title: { zh: '轮询进度', en: 'Poll status' },
      desc: {
        zh: '循环查询直至 status = completed；失败则终止返回错误',
        en: 'Poll until status = completed; abort and return error on failure'
      }
    },
    {
      nodeType: 'mcp',
      nodeLabel: 'MCP',
      title: { zh: '获取结果', en: 'Get result' },
      desc: {
        zh: '获取推理结果，包括出血阳性/阴性判断、出血体积、各亚型分量、中线位移等内容',
        en: 'Returns structured inference results, including hemorrhage positive/negative determination, total volume, subtype volumes, midline shift, and more'
      }
    },
    {
      nodeType: 'default',
      nodeLabel: '⑦',
      title: { zh: '危急值判定', en: 'Critical value determination' },
      desc: {
        zh: '依据预设危急值规则进行判定，规则固化于 Skill 中不经 LLM 推断，具体阈值可按医院实际应用情况调整',
        en: 'Critical value rules are hardcoded in the Skill and not inferred by LLM; specific thresholds may be adjusted based on hospital settings'
      }
    },
    {
      nodeType: 'end',
      nodeLabel: '⑧',
      title: { zh: '输出结构化报告/Viewer链接', en: 'Output structured report / Viewer link' },
      desc: {
        zh: '返回给 Agent / 医生，含免责声明',
        en: 'Return to Agent / physician, with disclaimer'
      }
    }
  ],
  prerequisites: [
    {
      name: { zh: 'UII MCP Server', en: 'UII MCP Server' },
      desc: {
        zh: '联影智能 ICH 推理服务',
        en: 'UII ICH inference service'
      },
      iconType: 'mcp'
    },
    {
      name: { zh: 'PACS 基础工具', en: 'PACS Base Tools' },
      desc: {
        zh: '需支持 DICOM 调阅 · DICOM 去标识化两项操作',
        en: 'Must support DICOM retrieval and DICOM de-identification'
      },
      iconType: 'pacs'
    },
    {
      name: { zh: '合规要求', en: 'Compliance Requirements' },
      desc: {
        zh: '影像出院内网前须完成去标识化，Skill 内已将此步骤设为强制执行，Agent 不可绕过',
        en: 'Images must be de-identified before leaving the intranet; this step is enforced within the Skill and cannot be bypassed by the Agent'
      },
      iconType: 'compliance'
    }
  ],
  triggers: {
    phrases: [],
    note: {
      zh: '急诊医生向 Agent 描述评估需求时，或 PACS 收到新扫描完成事件后自动触发',
      en: 'The ER physician describes the assessment request to the Agent, or PACS triggers automatically when a new scan-complete event is received'
    }
  },
  quickStart: {
    hint: {
      zh: '复制下面这段话，粘贴给任一能读懂自然语言、可执行本地脚本的 AI 助手',
      en: 'Copy the text below and paste it to any AI assistant that can read natural language and execute local scripts'
    },
    code: {
      zh: '安装 ich-detection-skill：\n\n源码：\n  • Skill: https://github.com/ruanrrn/UII-Agent-Suite/tree/main/imaging-detection-plugin/ich-detection-skill\n  • MCP: https://github.com/ruanrrn/UII-Agent-Suite/tree/main/imaging-detection-mcp\n\n依赖：\n  • Node.js 18+\n  • imaging-detection-mcp（npm 全局安装，提供 create_imaging_task / get_imaging_task）\n  • 可被远端拉取的去标识化影像 7z URL',
      en: 'Install ich-detection-skill:\n\nSource:\n  • Skill: https://github.com/ruanrrn/UII-Agent-Suite/tree/main/imaging-detection-plugin/ich-detection-skill\n  • MCP: https://github.com/ruanrrn/UII-Agent-Suite/tree/main/imaging-detection-mcp\n\nDependencies:\n  • Node.js 18+\n  • imaging-detection-mcp (global npm install, provides create_imaging_task / get_imaging_task)\n  • Remotely accessible de-identified imaging 7z URL'
    },
    links: [
      {
        label: 'SKILL.md',
        href: 'https://github.com/ruanrrn/UII-Agent-Suite/tree/main/imaging-detection-plugin/ich-detection-skill/SKILL.md'
      },
      {
        label: 'References',
        href: 'https://github.com/ruanrrn/UII-Agent-Suite/tree/main/imaging-detection-plugin/ich-detection-skill/references'
      }
    ]
  }
};

const ribDetail: SkillDetail = {
  intro: {
    zh: '当放射科医生需要评估外伤患者胸部 CT 是否存在多发肋骨骨折时，完成肋骨骨折筛查与定位分析，输出结构化分诊结论及报告草稿，辅助医生快速识别高风险外伤病例',
    en: "When a radiologist needs to evaluate a trauma patient's chest CT for multiple rib fractures, this Skill performs rib fracture screening and localization analysis, outputs a structured triage conclusion and draft report, and helps the physician quickly identify high-risk trauma cases"
  },
  stats: [
    {
      label: { zh: 'AI 灵敏度', en: 'AI Sensitivity' },
      value: '92.7%',
      sub: { zh: 'FDA 验证集', en: 'FDA validation set' }
    },
    {
      label: { zh: 'AI 特异度', en: 'AI Specificity' },
      value: '84.7%',
      sub: { zh: 'FDA 验证集', en: 'FDA validation set' }
    },
    {
      label: { zh: '检测目标', en: 'Detection target' },
      value: { zh: '多发肋骨骨折', en: 'Multiple rib fractures' },
      sub: { zh: '同一患者肋骨骨折部位 ≥3 处', en: '≥3 fracture sites in the same patient' }
    }
  ],
  capabilities: [
    {
      zh: '检测胸部 CT 中疑似多发性急性肋骨骨折（≥3 处），涵盖移位性、非移位性、嵌插性及陈旧性四种骨折类型',
      en: 'Detect suspected multiple acute rib fractures (≥3 sites) on chest CT, covering displaced, nondisplaced, buckle, and old fracture types'
    },
    {
      zh: '输出每处骨折的精确位置（肋骨编号 + 左/右侧 + 前/后/腋中线方向）',
      en: 'Output the precise location of each fracture (rib number + left/right side + anterior/posterior/mid-axillary direction)'
    },
    {
      zh: '草拟结构化影像报告，包含骨折部位列表及影像所见文字描述',
      en: 'Draft a structured imaging report, including a list of fracture sites and a textual description of findings'
    },
    {
      zh: '生成分诊结论，辅助放射科医生及时识别高风险外伤患者',
      en: 'Generate a triage conclusion to help radiologists promptly identify high-risk trauma patients'
    }
  ],
  workflow: [
    {
      nodeType: 'default',
      nodeLabel: '①',
      title: { zh: '医生自然语言请求', en: 'Physician natural language request' },
      desc: {
        zh: '放射科医生向 Agent 描述肋骨骨折分诊评估需求时，或 PACS 收到新扫描完成事件后自动触发',
        en: 'Radiologist describes a rib fracture triage assessment request to the Agent, or PACS triggers automatically upon new scan completion'
      }
    },
    {
      nodeType: 'default',
      nodeLabel: '②',
      title: { zh: 'Agent 前置检查确认', en: 'Agent pre-flight check' },
      desc: {
        zh: '确认影像 MCP 工具可用',
        en: 'Confirm imaging MCP tools are available'
      }
    },
    {
      nodeType: 'warn',
      nodeLabel: '③',
      title: { zh: '去标识化', en: 'De-identification' },
      desc: {
        zh: '影像出院内网前必须完成，调用 PACS 去标识化工具处理 DICOM',
        en: 'Must be completed before images leave the intranet; call PACS de-identification tool to process DICOM'
      }
    },
    {
      nodeType: 'mcp',
      nodeLabel: 'MCP',
      title: { zh: '提交推理', en: 'Submit inference' },
      desc: {
        zh: '传入去标识后 DICOM URI，返回 taskId',
        en: 'Pass de-identified DICOM URI, returns taskId'
      }
    },
    {
      nodeType: 'mcp',
      nodeLabel: 'MCP',
      title: { zh: '轮询进度', en: 'Poll status' },
      desc: {
        zh: '循环查询直至 status = completed；失败则终止返回错误',
        en: 'Poll until status = completed; abort and return error on failure'
      }
    },
    {
      nodeType: 'mcp',
      nodeLabel: 'MCP',
      title: { zh: '获取结果', en: 'Get result' },
      desc: {
        zh: '获取推理结果，包括阳性/阴性判断、各处骨折位置及结构化报告字段等内容',
        en: 'Returns structured inference results, including positive/negative determination, fracture locations, structured report fields, and more'
      }
    },
    {
      nodeType: 'end',
      nodeLabel: '⑦',
      title: { zh: '输出结构化报告/Viewer链接', en: 'Output structured report / Viewer link' },
      desc: {
        zh: '返回给 Agent / 医生，含免责声明',
        en: 'Return to Agent / physician, with disclaimer'
      }
    }
  ],
  prerequisites: [
    {
      name: { zh: 'UII MCP Server', en: 'UII MCP Server' },
      desc: {
        zh: '联影智能肋骨骨折推理服务',
        en: 'UII rib fracture inference service'
      },
      iconType: 'mcp'
    },
    {
      name: { zh: 'PACS 基础工具', en: 'PACS Base Tools' },
      desc: {
        zh: '需支持 DICOM 调阅 · DICOM 去标识化两项操作',
        en: 'Must support DICOM retrieval and DICOM de-identification'
      },
      iconType: 'pacs'
    },
    {
      name: { zh: '合规要求', en: 'Compliance Requirements' },
      desc: {
        zh: '影像出院内网前须完成去标识化，Skill 内已将此步骤设为强制执行，Agent 不可绕过',
        en: 'Images must be de-identified before leaving the intranet; this step is enforced within the Skill and cannot be bypassed by the Agent'
      },
      iconType: 'compliance'
    }
  ],
  triggers: {
    phrases: [],
    note: {
      zh: '放射科医生向 Agent 描述肋骨骨折分诊评估需求时，或 PACS 收到新扫描完成事件后自动触发',
      en: 'The radiologist describes a rib fracture triage assessment request to the Agent, or PACS triggers automatically when a new scan-complete event is received'
    }
  },
  quickStart: {
    hint: {
      zh: '复制下面这段话，粘贴给任一能读懂自然语言、可执行本地脚本的 AI 助手',
      en: 'Copy the text below and paste it to any AI assistant that can read natural language and execute local scripts'
    },
    code: {
      zh: '安装 rib-detection-skill：\n\n源码：\n  • Skill: https://github.com/ruanrrn/UII-Agent-Suite/tree/main/imaging-detection-plugin/rib-detection-skill\n  • MCP: https://github.com/ruanrrn/UII-Agent-Suite/tree/main/imaging-detection-mcp\n\n依赖：\n  • Node.js 18+\n  • imaging-detection-mcp（npm 全局安装，提供 create_imaging_task / get_imaging_task）\n  • 可被远端拉取的去标识化影像 7z URL',
      en: 'Install rib-detection-skill:\n\nSource:\n  • Skill: https://github.com/ruanrrn/UII-Agent-Suite/tree/main/imaging-detection-plugin/rib-detection-skill\n  • MCP: https://github.com/ruanrrn/UII-Agent-Suite/tree/main/imaging-detection-mcp\n\nDependencies:\n  • Node.js 18+\n  • imaging-detection-mcp (global npm install, provides create_imaging_task / get_imaging_task)\n  • Remotely accessible de-identified imaging 7z URL'
    },
    links: [
      {
        label: 'SKILL.md',
        href: 'https://github.com/ruanrrn/UII-Agent-Suite/tree/main/imaging-detection-plugin/rib-detection-skill/SKILL.md'
      },
      {
        label: 'References',
        href: 'https://github.com/ruanrrn/UII-Agent-Suite/tree/main/imaging-detection-plugin/rib-detection-skill/references'
      }
    ]
  }
};

const vitallensDetail: SkillDetail = {
  intro: {
    zh: '用户以自然语言发起生命体征测量请求，Agent 识别意图后调用本 Skill，通过普通摄像头捕捉面部视频，完成心率与呼吸率的无接触检测，输出带置信度评分的测量数值',
    en: 'The user requests a vital-sign measurement in natural language. After the Agent recognizes the intent, it invokes this Skill to capture facial video through a standard camera, perform non-contact heart-rate and respiratory-rate detection, and return measurements with confidence scores'
  },
  stats: [
    {
      label: { zh: '检测指标', en: 'Detected metrics' },
      value: {
        zh: '心率、呼吸',
        en: 'HR & RR'
      },
      sub: {
        zh: '',
        en: ''
      }
    },
    {
      label: { zh: '输入', en: 'Input' },
      value: {
        zh: '摄像头视频',
        en: 'Camera video'
      },
      sub: {
        zh: '',
        en: ''
      }
    }
  ],
  capabilities: [
    {
      zh: '通过摄像头无接触检测心率（HR）与呼吸率（RR）',
      en: 'Detect heart rate (HR) and respiratory rate (RR) without contact through a camera'
    },
    {
      zh: '每项测量结果附带置信度评分',
      en: 'Attach a confidence score to each measurement result'
    }
  ],
  workflow: [
    {
      nodeType: 'default',
      nodeLabel: '①',
      title: { zh: '用户自然语言请求', en: 'User natural-language request' },
      desc: {
        zh: '用户向 Agent 表达测量心率、呼吸率或进行快速健康自测的意图',
        en: 'The user tells the Agent they want to measure heart rate, respiratory rate, or run a quick wellness check'
      }
    },
    {
      nodeType: 'warn',
      nodeLabel: '②',
      title: { zh: '环境条件检查', en: 'Environment check' },
      desc: {
        zh: '检查摄像头可用、光线充足，并提示用户保持正面朝向与相对静止',
        en: 'Check that the camera is available, lighting is sufficient, and the user is facing forward while staying relatively still'
      }
    },
    {
      nodeType: 'default',
      nodeLabel: '③',
      title: { zh: '采集面部视频', en: 'Capture facial video' },
      desc: {
        zh: '通过摄像头采集一段面部视频，作为无接触体征检测输入',
        en: 'Capture a short facial video through the camera as input for non-contact vital-sign detection'
      }
    },
    {
      nodeType: 'default',
      nodeLabel: '④',
      title: {
        zh: '调用 VitalLens API 进行 rPPG 分析',
        en: 'Call VitalLens API for rPPG analysis'
      },
      desc: {
        zh: '将面部视频提交给 VitalLens API，通过 rPPG 分析提取心率与呼吸率信号',
        en: 'Submit the facial video to the VitalLens API and use rPPG analysis to extract heart-rate and respiratory-rate signals'
      }
    },
    {
      nodeType: 'default',
      nodeLabel: '⑤',
      title: { zh: '接收测量结果', en: 'Receive measurement results' },
      desc: {
        zh: '接收心率、呼吸率测量结果及对应置信度评分',
        en: 'Receive heart-rate and respiratory-rate measurements with their confidence scores'
      }
    },
    {
      nodeType: 'end',
      nodeLabel: '⑥',
      title: {
        zh: '输出一次呼吸心率测量结果',
        en: 'Output one respiratory and heart-rate measurement'
      },
      desc: {
        zh: '以自然语言输出本次呼吸率与心率测量结果，并附带置信度评分',
        en: 'Output the respiratory-rate and heart-rate measurements in natural language with confidence scores'
      }
    }
  ],
  prerequisites: [
    {
      name: { zh: 'VitalLens API Key', en: 'VitalLens API Key' },
      desc: {
        zh: '需要配置 VITALLENS_API_KEY 环境变量',
        en: 'Requires the VITALLENS_API_KEY environment variable'
      },
      iconType: 'mcp'
    },
    {
      name: { zh: '摄像头访问权限', en: 'Camera access permission' },
      desc: {
        zh: '需要允许访问摄像头以采集面部视频',
        en: 'Requires camera access permission to capture facial video'
      },
      iconType: 'pacs'
    },
    {
      name: { zh: '拍摄环境', en: 'Capture environment' },
      desc: {
        zh: '稳定光源、正面朝向，并避免大幅移动',
        en: 'Stable lighting, front-facing posture, and avoiding large movements'
      },
      iconType: 'compliance'
    }
  ],
  triggers: {
    phrases: [],
    note: {
      zh: '当用户希望通过摄像头了解自己当前的心率或呼吸率时触发，包括主动询问实时体征、运动后想确认心率恢复状态，或想做一次快速健康自测等场景',
      en: 'Triggers when the user wants to understand their current heart rate or respiratory rate through a camera, including asking about real-time vitals, checking heart-rate recovery after exercise, or doing a quick wellness self-check'
    }
  },
  quickStart: {
    hint: {
      zh: '复制下面这段话，粘贴给任一能执行本地脚本的 AI 助手（如 Claude Code）',
      en: 'Copy the text below and paste it to any AI assistant that can run local scripts (e.g. Claude Code)'
    },
    code: {
      zh: '安装 vitallens_noncontact_vitals：\n\n源码：https://github.com/ruanrrn/UII-Agent-Suite/tree/main/vitallens\n\n依赖：\n  • VitalLens API Key（环境变量 VITALLENS_API_KEY）\n  • 摄像头访问权限',
      en: 'Install vitallens_noncontact_vitals:\n\nSource: https://github.com/ruanrrn/UII-Agent-Suite/tree/main/vitallens\n\nDependencies:\n  • VitalLens API Key (VITALLENS_API_KEY environment variable)\n  • Camera access permission'
    },
    links: [
      {
        label: 'SKILL.md',
        href: 'https://github.com/ruanrrn/UII-Agent-Suite/blob/main/vitallens/SKILL.md'
      },
      {
        label: { zh: 'VitalLens API 注册', en: 'VitalLens API sign-up' },
        href: 'https://www.rouast.com/api'
      }
    ]
  }
};

export const CAPABILITIES: Capability[] = [
  {
    id: 'easy-triage-rib',
    type: 'skill',
    modality: 'CT',
    icon: '/assets/Easy-Triage-System(RiB).png',
    visible: true,
    fda: {
      kNumber: 'K193271',
      decisionDate: '2021-01-15',
      productCode: 'QFM',
      productCodeName: 'Radiological Computer-Aided Prioritization Software for Lesions',
      applicant: 'Shanghai United Imaging Intelligence Co., Ltd.'
    },
    mcp: blankMcp('easy-triage-rib'),
    i18n: {
      title: {
        zh: '智能危急预警系统 - 肋骨骨折检测',
        en: 'Easy Triage System - Rib'
      },
      tagline: {
        zh: '外伤胸部肋骨骨折 AI 辅助筛查与分诊',
        en: 'AI-assisted rib fracture screening and triage for trauma'
      },
      description: {
        zh: '当放射科医生需要评估外伤患者胸部 CT 是否存在多发肋骨骨折时，完成肋骨骨折筛查与定位分析，输出结构化分诊结论及报告草稿，辅助医生快速识别高风险外伤病例',
        en: "When a radiologist needs to evaluate a trauma patient's chest CT for multiple rib fractures, this Skill performs rib fracture screening and localization analysis, outputs a structured triage conclusion and draft report, and helps the physician quickly identify high-risk trauma cases"
      },
      clinicalUse: { ...empty },
      overview: {
        zh: '外伤胸部肋骨骨折 AI 辅助筛查与分诊',
        en: 'AI-assisted rib fracture screening and triage for trauma'
      }
    },
    detail: ribDetail
  },
  {
    id: 'easy-triage-ich',
    type: 'skill',
    modality: 'CT',
    icon: '/assets/Triage-System-ICH.png',
    visible: true,
    fda: {
      kNumber: 'K242292',
      decisionDate: '2024-12-20',
      productCode: 'QAS',
      productCodeName: 'Radiology Computer Aided Triage And Notification Software',
      applicant: 'Shanghai United Imaging Intelligence Co., Ltd.'
    },
    mcp: blankMcp('easy-triage-ich'),
    i18n: {
      title: {
        zh: '智能危急预警系统 - 颅内出血检测',
        en: 'Easy Triage System - ICH'
      },
      tagline: {
        zh: '急诊颅内出血 AI 辅助筛查与分诊',
        en: 'AI-assisted ICH screening and triage for emergency'
      },
      description: {
        zh: '当急诊科医生需要评估患者头颅 CT 是否存在颅内出血时，自动完成 ICH 筛查与量化分析，输出结构化分诊结论，辅助医生快速识别危急病情',
        en: "When an ER physician needs to evaluate a patient's head CT for intracranial hemorrhage, this Skill automatically performs ICH screening and quantitative analysis, outputs a structured triage summary, and assists the physician in rapidly identifying critical conditions"
      },
      clinicalUse: { ...empty },
      overview: {
        zh: '急诊颅内出血 AI 辅助筛查与分诊',
        en: 'AI-assisted ICH screening and triage for emergency'
      }
    },
    detail: ichDetail
  },
  {
    id: 'bony-thorax-fractures',
    type: 'skill',
    modality: 'CT',
    icon: '/assets/Bony-Thorax-Fractures.png',
    visible: true,
    fda: null,
    mcp: blankMcp('bony-thorax-fractures'),
    i18n: blankI18n({
      zh: 'CT 胸部骨折智能分析系统',
      en: 'AI-Assisted Analysis System for Bony Thorax Fractures'
    })
  },
  {
    id: 'aortic-dissection',
    type: 'skill',
    modality: 'CT',
    icon: '/assets/Aortic-Dissection.png',
    visible: true,
    fda: null,
    mcp: blankMcp('aortic-dissection'),
    i18n: blankI18n({
      zh: 'CT 主动脉智能分析系统',
      en: 'AI-Assisted Analysis System for Aortic Dissection'
    })
  },
  {
    id: 'cerebral-carotid-vessels',
    type: 'skill',
    modality: 'CT',
    icon: '/assets/Cerebral-and-Carotid-Vessels.png',
    visible: true,
    fda: null,
    mcp: blankMcp('cerebral-carotid-vessels'),
    i18n: blankI18n({
      zh: 'CT头颈血管智能分析系统',
      en: 'AI-Assisted Analysis System for Cerebral and Carotid Vessels'
    })
  },
  {
    id: 'coronary-cta',
    type: 'skill',
    modality: 'CT',
    icon: '/assets/Coronary-CTA-Imaging.png',
    visible: true,
    fda: null,
    mcp: blankMcp('coronary-cta'),
    i18n: blankI18n({
      zh: 'CT 冠脉智能分析系统',
      en: 'AI-Assisted Analysis System for Coronary CTA Imaging'
    })
  },
  {
    id: 'lower-extremity-cta',
    type: 'skill',
    modality: 'CT',
    icon: '/assets/Lower-Extremity-CTA-Imaging.png',
    visible: true,
    fda: null,
    mcp: blankMcp('lower-extremity-cta'),
    i18n: blankI18n({
      zh: 'CT 下肢血管智能评估系统',
      en: 'AI-Assisted Analysis System for Lower Extremity CTA Imaging'
    })
  },
  {
    id: 'intracerebral-hemorrhage',
    type: 'skill',
    modality: 'CT',
    icon: '/assets/Intracerebral-Hemorrhage.png',
    visible: true,
    fda: null,
    mcp: blankMcp('intracerebral-hemorrhage'),
    i18n: blankI18n({
      zh: 'CT 颅内出血智能分析系统',
      en: 'AI-Assisted Analysis System for Intracerebral Hemorrhage'
    })
  },
  {
    id: 'vitallens-rppg',
    type: 'skill',
    modality: 'Cross',
    icon: '/assets/vitallens.svg',
    visible: true,
    fda: null,
    mcp: blankMcp('vitallens-rppg'),
    i18n: {
      title: { zh: 'VitalLens', en: 'VitalLens' },
      tagline: {
        zh: 'General Wellness · Non-Medical',
        en: 'General Wellness · Non-Medical'
      },
      description: {
        zh: '通过普通摄像头捕捉面部视频，完成心率与呼吸率的无接触检测，输出带置信度评分的测量数值',
        en: 'Capture facial video through a standard camera to perform non-contact heart-rate and respiratory-rate detection, returning measurements with confidence scores'
      },
      clinicalUse: { ...empty },
      overview: {
        zh: 'General Wellness · Non-Medical',
        en: 'General Wellness · Non-Medical'
      }
    },
    detail: vitallensDetail
  }
];
