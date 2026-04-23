export class CircuitBreaker {
  private attempts: Record<string, number> = {};
  private readonly MAX_ATTEMPTS = 3;

  /**
   * Enregistre une tentative et retourne true si le disjoncteur est activé (trop d'échecs).
   * @param key Identifiant de l'opération (ex: "spyglass_fix")
   */
  recordAttempt(key: string): { attempt: number; triggered: boolean } {
    if (!this.attempts[key]) {
      this.attempts[key] = 0;
    }
    this.attempts[key]++;

    return {
      attempt: this.attempts[key],
      triggered: this.attempts[key] > this.MAX_ATTEMPTS,
    };
  }

  /**
   * Réinitialise le compteur pour une opération donnée.
   */
  reset(key: string) {
    this.attempts[key] = 0;
  }

  /**
   * Réinitialise tous les compteurs.
   */
  resetAll() {
    this.attempts = {};
  }

  /**
   * Vérifie si le disjoncteur est actuellement activé sans incrémenter le compteur.
   */
  isTriggered(key: string): boolean {
    return (this.attempts[key] || 0) > this.MAX_ATTEMPTS;
  }

  getAttemptCount(key: string): number {
    return this.attempts[key] || 0;
  }
}
