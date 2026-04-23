import fs from "fs-extra";
import path from "path";

export type ExecutionPhase =
  | "phase0_audit"
  | "phase1_cadrage"
  | "phase2_plan"
  | "phase3_execution"
  | "phase4_validation"
  | "phase5_livraison";

export type MissionStatus =
  | "draft"
  | "awaiting_go"
  | "in_progress"
  | "waiting_human"
  | "blocked"
  | "completed"
  | "conditional_delivery";

export interface ActionItem {
  id: string;
  title: string;
  done: boolean;
}

export interface Checkpoint {
  key: string;
  value: string;
  updatedAt: string;
}

export interface MissionState {
  missionId: string;
  objective: string;
  assumptions: string[];
  decisions: string[];
  phase: ExecutionPhase;
  status: MissionStatus;
  backlog: ActionItem[];
  blockers: string[];
  nextAction: string;
  requiresHuman: boolean;
  gates: {
    planApproved: boolean;
    assetsReady: boolean;
    finalApproved: boolean;
  };
  checkpoints: Record<string, Checkpoint>;
  updatedAt: string;
  createdAt: string;
}

export class MissionStateManager {
  private readonly missionJsonFile = ".gemini-mission.json";
  private readonly missionMdFile = ".gemini-mission.md";

  constructor(private readonly rootDir: string) {}

  private getMissionJsonPath(): string {
    return path.join(this.rootDir, this.missionJsonFile);
  }

  private getMissionMdPath(): string {
    return path.join(this.rootDir, this.missionMdFile);
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  private buildDefaultMission(): MissionState {
    const now = this.nowIso();
    return {
      missionId: `mission-${Date.now()}`,
      objective: "",
      assumptions: [],
      decisions: [],
      phase: "phase0_audit",
      status: "draft",
      backlog: [],
      blockers: [],
      nextAction: "Analyser la demande utilisateur.",
      requiresHuman: false,
      gates: {
        planApproved: false,
        assetsReady: false,
        finalApproved: false,
      },
      checkpoints: {},
      updatedAt: now,
      createdAt: now,
    };
  }

  async loadMission(): Promise<MissionState> {
    const p = this.getMissionJsonPath();
    if (!(await fs.pathExists(p))) {
      const base = this.buildDefaultMission();
      await this.saveMission(base);
      return base;
    }
    try {
      const data = (await fs.readJson(p)) as MissionState;
      return data;
    } catch {
      const base = this.buildDefaultMission();
      await this.saveMission(base);
      return base;
    }
  }

  async saveMission(mission: MissionState): Promise<void> {
    mission.updatedAt = this.nowIso();
    await fs.writeJson(this.getMissionJsonPath(), mission, { spaces: 2 });
    await fs.writeFile(this.getMissionMdPath(), this.toMarkdown(mission), "utf-8");
  }

  async createOrReplacePlan(input: {
    objective: string;
    assumptions?: string[];
    decisions?: string[];
    backlog?: Array<{ id?: string; title: string; done?: boolean }>;
    nextAction?: string;
  }): Promise<MissionState> {
    const now = this.nowIso();
    const mission: MissionState = {
      missionId: `mission-${Date.now()}`,
      objective: input.objective,
      assumptions: input.assumptions ?? [],
      decisions: input.decisions ?? [],
      phase: "phase2_plan",
      status: "awaiting_go",
      backlog: (input.backlog ?? []).map((item, idx) => ({
        id: item.id ?? `task-${idx + 1}`,
        title: item.title,
        done: item.done ?? false,
      })),
      blockers: [],
      nextAction: input.nextAction ?? "Attendre validation GO utilisateur.",
      requiresHuman: true,
      gates: {
        planApproved: false,
        assetsReady: false,
        finalApproved: false,
      },
      checkpoints: {},
      updatedAt: now,
      createdAt: now,
    };
    await this.saveMission(mission);
    return mission;
  }

  async updateMission(patch: {
    objective?: string;
    assumptions?: string[];
    decisions?: string[];
    backlog?: Array<{ id: string; title?: string; done?: boolean }>;
    blockers?: string[];
    nextAction?: string;
    status?: MissionStatus;
    requiresHuman?: boolean;
  }): Promise<MissionState> {
    const mission = await this.loadMission();
    if (patch.objective !== undefined) {
      mission.objective = patch.objective;
    }
    if (patch.assumptions !== undefined) {
      mission.assumptions = patch.assumptions;
    }
    if (patch.decisions !== undefined) {
      mission.decisions = patch.decisions;
    }
    if (patch.backlog !== undefined) {
      const byId = new Map<string, ActionItem>(
        mission.backlog.map((item) => [item.id, item])
      );
      for (const incoming of patch.backlog) {
        const existing = byId.get(incoming.id);
        if (!existing) {
          byId.set(incoming.id, {
            id: incoming.id,
            title: incoming.title ?? incoming.id,
            done: incoming.done ?? false,
          });
          continue;
        }
        byId.set(incoming.id, {
          id: existing.id,
          title: incoming.title ?? existing.title,
          done: incoming.done ?? existing.done,
        });
      }
      mission.backlog = Array.from(byId.values());
    }
    if (patch.blockers !== undefined) {
      mission.blockers = patch.blockers;
    }
    if (patch.nextAction !== undefined) {
      mission.nextAction = patch.nextAction;
    }
    if (patch.status !== undefined) {
      mission.status = patch.status;
    }
    if (patch.requiresHuman !== undefined) {
      mission.requiresHuman = patch.requiresHuman;
    }
    await this.saveMission(mission);
    return mission;
  }

  async advancePhase(input: {
    phase: ExecutionPhase;
    status?: MissionStatus;
    nextAction?: string;
    requiresHuman?: boolean;
  }): Promise<MissionState> {
    const mission = await this.loadMission();
    mission.phase = input.phase;
    if (input.status !== undefined) {
      mission.status = input.status;
    } else if (mission.status === "awaiting_go" && input.phase !== "phase2_plan") {
      mission.status = "in_progress";
    }
    if (input.nextAction !== undefined) {
      mission.nextAction = input.nextAction;
    }
    if (input.requiresHuman !== undefined) {
      mission.requiresHuman = input.requiresHuman;
    }
    await this.saveMission(mission);
    return mission;
  }

  async getCheckpoint(key: string): Promise<Checkpoint | null> {
    const mission = await this.loadMission();
    return mission.checkpoints[key] ?? null;
  }

  async setCheckpoint(key: string, value: string): Promise<MissionState> {
    const mission = await this.loadMission();
    mission.checkpoints[key] = {
      key,
      value,
      updatedAt: this.nowIso(),
    };
    await this.saveMission(mission);
    return mission;
  }

  async setGate(
    gate: "planApproved" | "assetsReady" | "finalApproved",
    value: boolean
  ): Promise<MissionState> {
    const mission = await this.loadMission();
    mission.gates[gate] = value;
    await this.saveMission(mission);
    return mission;
  }

  toMarkdown(mission: MissionState): string {
    const backlogLines =
      mission.backlog.length === 0
        ? "- (vide)"
        : mission.backlog.map((item) => `- [${item.done ? "x" : " "}] ${item.id}: ${item.title}`);
    const blockers =
      mission.blockers.length === 0 ? "- Aucun" : mission.blockers.map((b) => `- ${b}`);
    const assumptions =
      mission.assumptions.length === 0
        ? "- Aucune"
        : mission.assumptions.map((a) => `- ${a}`);
    const decisions =
      mission.decisions.length === 0 ? "- Aucune" : mission.decisions.map((d) => `- ${d}`);
    const checkpoints = Object.values(mission.checkpoints);
    const checkpointLines =
      checkpoints.length === 0
        ? "- Aucun"
        : checkpoints.map((cp) => `- ${cp.key}: ${cp.value} (${cp.updatedAt})`);

    return [
      "# Gemini Mission Memory",
      "",
      `- Mission ID: ${mission.missionId}`,
      `- Phase: ${mission.phase}`,
      `- Status: ${mission.status}`,
      `- Requires Human: ${mission.requiresHuman ? "yes" : "no"}`,
      `- Updated At: ${mission.updatedAt}`,
      "",
      "## Objective",
      mission.objective || "(non défini)",
      "",
      "## Next Action",
      mission.nextAction || "(non défini)",
      "",
      "## Gates",
      `- planApproved: ${mission.gates.planApproved}`,
      `- assetsReady: ${mission.gates.assetsReady}`,
      `- finalApproved: ${mission.gates.finalApproved}`,
      "",
      "## Assumptions",
      ...assumptions,
      "",
      "## Decisions",
      ...decisions,
      "",
      "## Backlog",
      ...backlogLines,
      "",
      "## Blockers",
      ...blockers,
      "",
      "## Checkpoints",
      ...checkpointLines,
      "",
    ].join("\n");
  }
}
