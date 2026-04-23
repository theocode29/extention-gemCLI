import fs from "fs-extra";
import path from "path";
export class MissionStateManager {
    rootDir;
    missionJsonFile = ".gemini-mission.json";
    missionMdFile = ".gemini-mission.md";
    constructor(rootDir) {
        this.rootDir = rootDir;
    }
    getMissionJsonPath() {
        return path.join(this.rootDir, this.missionJsonFile);
    }
    getMissionMdPath() {
        return path.join(this.rootDir, this.missionMdFile);
    }
    nowIso() {
        return new Date().toISOString();
    }
    buildDefaultMission() {
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
            validation: {
                headlessRequired: true,
                headlessPassed: false,
                contractPassed: false,
            },
            taskClass: {
                runtimeImpacting: true,
            },
            capabilityEvidence: {},
            checkpoints: {},
            research: {
                sources: [],
                constraints: [],
                chosenModules: [],
                rejectedModules: [],
                useCaseClass: "general",
                evidenceMap: {},
                moduleCandidates: [],
                physicsModel: "",
                validated: false,
                lastUpdatedAt: now,
            },
            debate: {
                decisionLog: [],
            },
            loopGuard: {
                maxSteps: 80,
                currentSteps: 0,
                repeatedSignatureCount: 0,
                lastSignature: "",
            },
            updatedAt: now,
            createdAt: now,
        };
    }
    normalizeMission(data) {
        const now = this.nowIso();
        const defaultResearch = {
            sources: [],
            constraints: [],
            chosenModules: [],
            rejectedModules: [],
            useCaseClass: "general",
            evidenceMap: {},
            moduleCandidates: [],
            physicsModel: "",
            validated: false,
            lastUpdatedAt: now,
        };
        return {
            ...data,
            gates: data.gates ?? {
                planApproved: false,
                assetsReady: false,
                finalApproved: false,
            },
            validation: data.validation ?? {
                headlessRequired: true,
                headlessPassed: false,
                contractPassed: false,
            },
            taskClass: data.taskClass ?? {
                runtimeImpacting: true,
            },
            capabilityEvidence: data.capabilityEvidence ?? {},
            research: {
                ...defaultResearch,
                ...(data.research ?? {}),
            },
            debate: data.debate ?? { decisionLog: [] },
            loopGuard: data.loopGuard ?? {
                maxSteps: 80,
                currentSteps: 0,
                repeatedSignatureCount: 0,
                lastSignature: "",
            },
        };
    }
    async loadMission() {
        const p = this.getMissionJsonPath();
        if (!(await fs.pathExists(p))) {
            const base = this.buildDefaultMission();
            await this.saveMission(base);
            return base;
        }
        try {
            const data = this.normalizeMission((await fs.readJson(p)));
            return data;
        }
        catch {
            const base = this.buildDefaultMission();
            await this.saveMission(base);
            return base;
        }
    }
    async saveMission(mission) {
        mission.updatedAt = this.nowIso();
        await fs.writeJson(this.getMissionJsonPath(), mission, { spaces: 2 });
        await fs.writeFile(this.getMissionMdPath(), this.toMarkdown(mission), "utf-8");
    }
    async createOrReplacePlan(input) {
        const now = this.nowIso();
        const mission = {
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
            validation: {
                headlessRequired: true,
                headlessPassed: false,
                contractPassed: false,
            },
            taskClass: {
                runtimeImpacting: true,
            },
            capabilityEvidence: {},
            checkpoints: {},
            research: {
                sources: [],
                constraints: [],
                chosenModules: [],
                rejectedModules: [],
                useCaseClass: "general",
                evidenceMap: {},
                moduleCandidates: [],
                physicsModel: "",
                validated: false,
                lastUpdatedAt: now,
            },
            debate: {
                decisionLog: [],
            },
            loopGuard: {
                maxSteps: 80,
                currentSteps: 0,
                repeatedSignatureCount: 0,
                lastSignature: "",
            },
            updatedAt: now,
            createdAt: now,
        };
        await this.saveMission(mission);
        return mission;
    }
    async updateMission(patch) {
        const mission = await this.loadMission();
        if (patch.objective !== undefined)
            mission.objective = patch.objective;
        if (patch.assumptions !== undefined)
            mission.assumptions = patch.assumptions;
        if (patch.decisions !== undefined)
            mission.decisions = patch.decisions;
        if (patch.backlog !== undefined) {
            const byId = new Map(mission.backlog.map((item) => [item.id, item]));
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
        if (patch.blockers !== undefined)
            mission.blockers = patch.blockers;
        if (patch.nextAction !== undefined)
            mission.nextAction = patch.nextAction;
        if (patch.status !== undefined)
            mission.status = patch.status;
        if (patch.requiresHuman !== undefined)
            mission.requiresHuman = patch.requiresHuman;
        if (patch.contractPassed !== undefined)
            mission.validation.contractPassed = patch.contractPassed;
        if (patch.headlessRequired !== undefined)
            mission.validation.headlessRequired = patch.headlessRequired;
        if (patch.headlessPassed !== undefined)
            mission.validation.headlessPassed = patch.headlessPassed;
        if (patch.runtimeImpacting !== undefined) {
            mission.taskClass.runtimeImpacting = patch.runtimeImpacting;
            if (patch.headlessRequired === undefined) {
                mission.validation.headlessRequired = patch.runtimeImpacting;
            }
        }
        await this.saveMission(mission);
        return mission;
    }
    async updateResearch(bundle) {
        const mission = await this.loadMission();
        if (bundle.sources !== undefined)
            mission.research.sources = bundle.sources;
        if (bundle.constraints !== undefined)
            mission.research.constraints = bundle.constraints;
        if (bundle.chosenModules !== undefined)
            mission.research.chosenModules = bundle.chosenModules;
        if (bundle.rejectedModules !== undefined)
            mission.research.rejectedModules = bundle.rejectedModules;
        if (bundle.useCaseClass !== undefined)
            mission.research.useCaseClass = bundle.useCaseClass;
        if (bundle.evidenceMap !== undefined)
            mission.research.evidenceMap = bundle.evidenceMap;
        if (bundle.moduleCandidates !== undefined)
            mission.research.moduleCandidates = bundle.moduleCandidates;
        if (bundle.physicsModel !== undefined)
            mission.research.physicsModel = bundle.physicsModel;
        if (bundle.validated !== undefined)
            mission.research.validated = bundle.validated;
        mission.research.lastUpdatedAt = this.nowIso();
        await this.saveMission(mission);
        return mission;
    }
    async setDebatePosition(pos) {
        const mission = await this.loadMission();
        if (pos.agent === "planner")
            mission.debate.planner = pos;
        if (pos.agent === "critic")
            mission.debate.critic = pos;
        mission.status = "debate_in_progress";
        await this.saveMission(mission);
        return mission;
    }
    async resolveDebate(result) {
        const mission = await this.loadMission();
        mission.debate.decisionLog.push({
            at: this.nowIso(),
            winner: result.winner,
            kept: result.kept,
            rejected: result.rejected,
            tradeoffs: result.tradeoffs,
            riskAcceptance: result.riskAcceptance,
            rationale: result.rationale,
        });
        mission.status = "awaiting_go";
        await this.saveMission(mission);
        return mission;
    }
    async advancePhase(input) {
        const mission = await this.loadMission();
        mission.phase = input.phase;
        if (input.status !== undefined) {
            mission.status = input.status;
        }
        else if (mission.status === "awaiting_go" && input.phase !== "phase2_plan") {
            mission.status = "in_progress";
        }
        if (input.nextAction !== undefined)
            mission.nextAction = input.nextAction;
        if (input.requiresHuman !== undefined)
            mission.requiresHuman = input.requiresHuman;
        await this.saveMission(mission);
        return mission;
    }
    async getCheckpoint(key) {
        const mission = await this.loadMission();
        return mission.checkpoints[key] ?? null;
    }
    async setCheckpoint(key, value) {
        const mission = await this.loadMission();
        mission.checkpoints[key] = {
            key,
            value,
            updatedAt: this.nowIso(),
        };
        await this.saveMission(mission);
        return mission;
    }
    async setGate(gate, value) {
        const mission = await this.loadMission();
        mission.gates[gate] = value;
        await this.saveMission(mission);
        return mission;
    }
    async registerLoopSignature(signature) {
        const mission = await this.loadMission();
        mission.loopGuard.currentSteps += 1;
        if (mission.loopGuard.lastSignature === signature) {
            mission.loopGuard.repeatedSignatureCount += 1;
        }
        else {
            mission.loopGuard.lastSignature = signature;
            mission.loopGuard.repeatedSignatureCount = 0;
        }
        await this.saveMission(mission);
        return mission;
    }
    async setCapabilityEvidence(capability, evidence) {
        const mission = await this.loadMission();
        mission.capabilityEvidence[capability] = evidence;
        await this.saveMission(mission);
        return mission;
    }
    toMarkdown(mission) {
        const backlogLines = mission.backlog.length === 0
            ? "- (vide)"
            : mission.backlog.map((item) => `- [${item.done ? "x" : " "}] ${item.id}: ${item.title}`);
        const blockers = mission.blockers.length === 0 ? "- Aucun" : mission.blockers.map((b) => `- ${b}`);
        const assumptions = mission.assumptions.length === 0 ? "- Aucune" : mission.assumptions.map((a) => `- ${a}`);
        const decisions = mission.decisions.length === 0 ? "- Aucune" : mission.decisions.map((d) => `- ${d}`);
        const checkpoints = Object.values(mission.checkpoints);
        const checkpointLines = checkpoints.length === 0
            ? "- Aucun"
            : checkpoints.map((cp) => `- ${cp.key}: ${cp.value} (${cp.updatedAt})`);
        const capabilityEvidenceLines = Object.keys(mission.capabilityEvidence).length === 0
            ? "- Aucune"
            : Object.entries(mission.capabilityEvidence).map(([cap, ev]) => `- ${cap}: sources=[${ev.sources.join(", ")}], selected=[${ev.selectedModules.join(", ")}], rejected=[${ev.rejectedModules.join(", ")}]`);
        const researchSources = mission.research.sources.length === 0
            ? "- Aucune"
            : mission.research.sources.map((s) => `- [${s.kind}] ${s.title} -> ${s.urlOrPath}\n  ${s.summary}`);
        const debateLines = mission.debate.decisionLog.length === 0
            ? "- Aucun arbitrage"
            : mission.debate.decisionLog.map((d) => `- ${d.at} winner=${d.winner}; kept=[${d.kept.join(", ")}]; rejected=[${d.rejected.join(", ")}]; tradeoffs=[${d.tradeoffs.join(", ")}]; risk_acceptance=${d.riskAcceptance}`);
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
            "## Validation",
            `- headlessRequired: ${mission.validation.headlessRequired}`,
            `- headlessPassed: ${mission.validation.headlessPassed}`,
            `- contractPassed: ${mission.validation.contractPassed}`,
            `- runtimeImpacting: ${mission.taskClass.runtimeImpacting}`,
            "",
            "## Research",
            `- validated: ${mission.research.validated}`,
            `- useCaseClass: ${mission.research.useCaseClass}`,
            ...researchSources,
            "",
            "## Capability Evidence",
            ...capabilityEvidenceLines,
            "",
            "## Debate",
            ...debateLines,
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
            "## Loop Guard",
            `- steps: ${mission.loopGuard.currentSteps}/${mission.loopGuard.maxSteps}`,
            `- repeatedSignatureCount: ${mission.loopGuard.repeatedSignatureCount}`,
            "",
            "## Checkpoints",
            ...checkpointLines,
            "",
        ].join("\n");
    }
}
