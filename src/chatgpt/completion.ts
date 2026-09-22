export interface CompletionSample {
  assistantCount: number
  copyActionCount: number
  running: boolean
  text: string
}

export class CompletionTracker {
  private candidate: { signature: string; since: number } | undefined

  constructor(
    private readonly baselineAssistantCount: number,
    private readonly baselineCopyActionCount: number,
    private readonly stableMs = 2_000,
  ) {}

  update(sample: CompletionSample, now = Date.now()): boolean {
    const hasNewAssistant = sample.assistantCount > this.baselineAssistantCount
    const hasCompletionAction = sample.copyActionCount > this.baselineCopyActionCount
    const complete = hasNewAssistant
      && hasCompletionAction
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
