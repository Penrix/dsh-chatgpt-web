export interface CompletionSample {
  assistantCount: number
  running: boolean
  text: string
}

export class CompletionTracker {
  private candidate: { signature: string; since: number } | undefined

  constructor(
    private readonly baselineAssistantCount: number,
    private readonly stableMs = 2_000,
  ) {}

  update(sample: CompletionSample, now = Date.now()): boolean {
    const hasNewAssistant = sample.assistantCount > this.baselineAssistantCount
    const complete = hasNewAssistant
      && !sample.running
      && sample.text.trim().length > 0

    if (!complete) {
      this.candidate = undefined
      return false
    }

    const signature = sample.text
    if (this.candidate?.signature !== signature) {
      this.candidate = { signature, since: now }
      return false
    }

    return now - this.candidate.since >= this.stableMs
  }
}
