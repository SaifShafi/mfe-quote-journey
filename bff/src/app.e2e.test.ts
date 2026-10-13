import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from './app.module'

/**
 * The end-to-end half: real HTTP requests against a real Nest application,
 * through the same cookie-parser middleware main.ts installs. Unit tests
 * above exercise AuthService and JourneyService directly; this file is what
 * catches a wiring mistake between them; a guard on the wrong controller, a
 * cookie path typo, a header set on the wrong response. Neither kind of test
 * catches what the other does.
 */
describe('bff (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('rejects /journey with no access token', async () => {
    await request(app.getHttpServer()).get('/journey').expect(401)
  })

  it('rejects /downstream/vehicle with no access token', async () => {
    await request(app.getHttpServer()).get('/downstream/vehicle').expect(401)
  })

  it('starts a session with an access token and an httpOnly refresh cookie', async () => {
    const res = await request(app.getHttpServer()).post('/auth/session').expect(201)

    expect(res.body.accessToken).toEqual(expect.any(String))
    const cookie = res.headers['set-cookie']?.[0] ?? ''
    expect(cookie).toContain('refresh_token=')
    expect(cookie.toLowerCase()).toContain('httponly')
    // Scoped to the refresh endpoint, not sent with every request to this origin.
    expect(cookie).toContain('Path=/auth/refresh')
  })

  it('serves the aggregated journey once a session exists, miss then hit', async () => {
    const session = await request(app.getHttpServer()).post('/auth/session')
    const { accessToken } = session.body

    const first = await request(app.getHttpServer())
      .get('/journey')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    expect(first.headers['x-cache']).toBe('MISS')
    expect(first.body).toEqual({
      vehicle: { registration: 'AB12 CDE', year: '2019', mileage: '8000' },
      policy: {
        reference: 'QJ-4417-02',
        cover: 'Comprehensive',
        renewal: '14 March 2027',
        excess: '250',
      },
    })

    const second = await request(app.getHttpServer())
      .get('/journey')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
    expect(second.headers['x-cache']).toBe('HIT')
    expect(second.body).toEqual(first.body)
  })

  it('refreshes a session using only the cookie, no access token needed', async () => {
    const agent = request.agent(app.getHttpServer())
    await agent.post('/auth/session').expect(201)

    // No Authorization header on this call. The cookie the agent is holding
    // is the only credential, which is the whole point of the refresh route.
    const refreshed = await agent.post('/auth/refresh').expect(201)
    expect(refreshed.body.accessToken).toEqual(expect.any(String))

    await agent
      .get('/journey')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .expect(200)
  })

  it('rejects /auth/refresh with no cookie at all', async () => {
    await request(app.getHttpServer()).post('/auth/refresh').expect(401)
  })

  it('rejects a refresh token that has already been used once', async () => {
    const session = await request(app.getHttpServer()).post('/auth/session')
    const originalCookie = session.headers['set-cookie']?.[0]?.split(';')[0]

    // First use rotates the token and succeeds.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', originalCookie)
      .expect(201)

    // Replaying the same, now-consumed cookie must fail: rotation retired it.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', originalCookie)
      .expect(401)
  })
})
