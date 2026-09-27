export function createDreamGate() {
  let armed = false
  let targetSessionId
  let collisionQueued = false

  return {
    arm(sessionId) {
      armed = true
      targetSessionId = String(sessionId)
    },

    assertNoEarlyDream({ isDream, sessionId }) {
      if (!isDream) return
      if (!armed) {
        const error = new Error('Automatic dream provider request occurred before the dedicated dream stage was armed.')
        error.code = 'M2_EARLY_DREAM'
        throw error
      }
      if (String(sessionId) !== targetSessionId) {
        const error = new Error('Automatic dream provider request targeted an unexpected session.')
        error.code = 'M2_WRONG_DREAM_AGENT'
        throw error
      }
    },

    shouldQueueCollision({ isDream, sessionId }) {
      if (!armed || !isDream) return false
      if (String(sessionId) !== targetSessionId) return false
      if (collisionQueued) return false
      collisionQueued = true
      return true
    },

    snapshot() {
      return {
        armed,
        targetSessionId,
        collisionQueued,
      }
    },
  }
}
