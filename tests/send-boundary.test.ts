import { describe, expect, it } from 'vitest'
import { dispatchSendFailClosed } from '../src/chatgpt/turn.ts'

describe('post-Send uncertainty boundary', () => {
  it('marks delivery possible before awaiting a click that later rejects', async () => {
    const order: string[] = []
    await expect(dispatchSendFailClosed(
      async () => {
        order.push('click-started')
        throw new Error('transport lost after dispatch')
      },
      () => {
        order.push('delivery-possible')
      },
    )).rejects.toThrow(/transport lost/)

    expect(order).toEqual(['delivery-possible', 'click-started'])
  })
})
