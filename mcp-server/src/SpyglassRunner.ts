import { spawn } from "child_process";
import path from "path";

export interface SpyglassError {
  file: string;
  line: number;
  character: number;
  message: string;
  severity: "error" | "warning" | "hint" | "info";
  code?: string;
}

export interface SpyglassResult {
  status: "PASS" | "FAIL" | "FATAL";
  errors: SpyglassError[];
  message: string;
  isStagnant: boolean;
}

export class SpyglassRunner {
  private lastErrorFingerprint: string | null = null;
  private readonly MAX_DISPLAYED_ERRORS = 5;

  constructor(private rootDir: string) {}

  /**
   * Lance Spyglass et traite les résultats selon les exigences de robustesse.
   */
  async run(targetPath: string): Promise<SpyglassResult> {
    return new Promise((resolve) => {
      const fullTargetPath = path.resolve(this.rootDir, targetPath);
      
      // On utilise --format json pour un parsing strict
      // Note: Si le CLI ne supporte pas --format json, une adaptation vers le parsing 
      // de stream structuré (NDJSON) ou un parsing de texte robuste serait requise.
      const cp = spawn("npx", ["@spyglassmc/mcdoc-cli", "check", fullTargetPath, "--format", "json"], {
        cwd: this.rootDir,
        shell: true,
      });

      let stdout = "";
      let stderr = "";

      cp.stdout.on("data", (data) => (stdout += data.toString()));
      cp.stderr.on("data", (data) => (stderr += data.toString()));

      cp.on("close", (code) => {
        // 1. Gestion des erreurs fatales (Crash de l'outil, RAM, JDK...)
        if (code !== 0 && code !== 1 && stderr.length > 0) {
          return resolve({
            status: "FATAL",
            errors: [],
            message: `CRASH FATAL DE L'OUTIL (Code ${code}): ${stderr}`,
            isStagnant: false,
          });
        }

        try {
          // 2. Parsing strict du JSON
          let allErrors: SpyglassError[] = [];
          if (stdout.trim()) {
            allErrors = JSON.parse(stdout);
          } else if (code === 1) {
             // Si code 1 mais pas de stdout, peut-être une erreur non-JSON dans stderr
             return resolve({
                status: "FATAL",
                errors: [],
                message: `ERREUR D'EXÉCUTION: ${stderr}`,
                isStagnant: false,
             });
          }

          // Filtrer pour ne garder que les erreurs réelles
          const criticalErrors = allErrors.filter(e => e.severity === "error");
          
          if (criticalErrors.length === 0) {
            this.lastErrorFingerprint = null;
            return resolve({
              status: "PASS",
              errors: [],
              message: "Validation Spyglass réussie.",
              isStagnant: false,
            });
          }

          // 3. Analyseur de stagnation (Lutte contre le LLM têtu)
          // On crée une empreinte des 5 premières erreurs pour comparer avec l'itération précédente
          const currentFingerprint = JSON.stringify(criticalErrors.slice(0, 5).map(e => ({ f: e.file, m: e.message, l: e.line })));
          const isStagnant = currentFingerprint === this.lastErrorFingerprint;
          this.lastErrorFingerprint = currentFingerprint;

          // 4. Limiteur d'erreurs (Chunking/Triage)
          // On ne renvoie que les 5 premières erreurs pour éviter l'asphyxie du contexte
          const chunkedErrors = criticalErrors.slice(0, this.MAX_DISPLAYED_ERRORS);
          const remainingCount = criticalErrors.length - this.MAX_DISPLAYED_ERRORS;

          let finalMessage = isStagnant 
            ? "⚠️ ATTENTION : C'est EXACTEMENT la même erreur qu'à l'itération précédente. Ta stratégie de correction a échoué. Change d'approche ou utilise un module Bookshelf différent."
            : `Échec de validation (${criticalErrors.length} erreurs détectées).`;

          if (remainingCount > 0) {
            finalMessage += ` (Affichage des ${this.MAX_DISPLAYED_ERRORS} premières erreurs, ${remainingCount} autres erreurs masquées).`;
          }

          resolve({
            status: "FAIL",
            errors: chunkedErrors,
            message: finalMessage,
            isStagnant,
          });

        } catch (parseError: any) {
          resolve({
            status: "FATAL",
            errors: [],
            message: `ERREUR DE PARSING DES RÉSULTATS SPYGLASS: ${parseError.message}\nRaw Output: ${stdout.slice(0, 500)}`,
            isStagnant: false,
          });
        }
      });
    });
  }
}
