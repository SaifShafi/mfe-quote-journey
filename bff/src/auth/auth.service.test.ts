import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from './auth.service'

describe('AuthService', () => {
  let auth: AuthService

  beforeEach(() => {
    auth = new AuthService()
  })

  describe('startSession', () => {
    it('issues an access token that verifies', () => {
      const { accessToken } = auth.startSession()
      expect(() => auth.verifyAccessToken(`Bearer ${accessToken}`)).not.toThrow()
    })

    it('issues a refresh token that can be used to refresh', () => {
      const { refreshToken } = auth.startSession()
      expect(() => auth.refresh(refreshToken)).not.toThrow()
    })
  })

  describe('verifyAccessToken', () => {
    it('rejects a missing header', () => {
      expect(() => auth.verifyAccessToken(undefined)).toThrow()
    })

    it('rejects a header that is not a bearer token', () => {
      expect(() => auth.verifyAccessToken('Basic abc123')).toThrow()
    })

    it('rejects a malformed token', () => {
      expect(() => auth.verifyAccessToken('Bearer not-a-jwt')).toThrow()
    })

    // The guard test for the whole reason an access token is short-lived: a
    // leaked one stops working on its own, without anyone revoking it.
    it('rejects an access token once its ttl has elapsed', () => {
      vi.useFakeTimers()
      const { accessToken } = auth.startSession()
      vi.advanceTimersByTime(11_000)
      expect(() => auth.verifyAccessToken(`Bearer ${accessToken}`)).toThrow()
      vi.useRealTimers()
    })
  })

  describe('refresh', () => {
    it('rejects a missing refresh token', () => {
      expect(() => auth.refresh(undefined)).toThrow()
    })

    it('rejects an unknown refresh token', () => {
      expect(() => auth.refresh('not-a-real-token')).toThrow()
    })

    it('returns a usable access token', () => {
      const { refreshToken } = auth.startSession()
      const { accessToken } = auth.refresh(refreshToken)
      expect(() => auth.verifyAccessToken(`Bearer ${accessToken}`)).not.toThrow()
    })

    // Rotation is the guard against a stolen refresh token being replayed
    // forever: using it once must retire it, for whoever uses it.
    it('rotates the refresh token, so the one just used cannot be reused', () => {
      const { refreshToken } = auth.startSession()
      auth.refresh(refreshToken)
      expect(() => auth.refresh(refreshToken)).toThrow()
    })

    it('rejects a refresh token once its ttl has elapsed', () => {
      vi.useFakeTimers()
      const { refreshToken } = auth.startSession()
      vi.advanceTimersByTime(60 * 60 * 1000 + 1)
      expect(() => auth.refresh(refreshToken)).toThrow()
      vi.useRealTimers()
    })
  })
})
