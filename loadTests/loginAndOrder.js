import { sleep, check, group, fail } from 'k6'
import http from 'k6/http'
import jsonpath from 'https://jslib.k6.io/jsonpath/1.0.2/index.js'

// Credentials are read from environment variables so they are not committed to the repo.
// In Grafana Cloud k6: Settings -> Environment variables -> add PIZZA_EMAIL and PIZZA_PASSWORD.
// Locally: k6 run -e PIZZA_EMAIL=... -e PIZZA_PASSWORD=... loadTests/loginAndOrder.js
const EMAIL = __ENV.PIZZA_EMAIL
const PASSWORD = __ENV.PIZZA_PASSWORD

const FRONTEND = 'https://pizza.jasonpizza-service.click'
const SERVICE = 'https://pizza-service.jasonpizza-service.click'
const FACTORY = 'https://pizza-factory.cs329.click'

export const options = {
  cloud: {
    distribution: { 'amazon:us:ashburn': { loadZone: 'amazon:us:ashburn', percent: 100 } },
    apm: [],
  },
  thresholds: {},
  scenarios: {
    Scenario_1: {
      executor: 'ramping-vus',
      gracefulStop: '30s',
      stages: [
        { target: 20, duration: '1m' },
        { target: 20, duration: '3m30s' },
        { target: 0, duration: '1m' },
      ],
      gracefulRampDown: '30s',
      exec: 'scenario_1',
    },
  },
}

const commonHeaders = {
  accept: '*/*',
  'accept-encoding': 'gzip, deflate, br, zstd',
  'accept-language': 'en-US,en;q=0.9',
  'content-type': 'application/json',
  origin: FRONTEND,
  priority: 'u=1, i',
  'sec-ch-ua': '"Chromium";v="158", "Not.A/Brand";v="24", "Google Chrome";v="158"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
}

export function scenario_1() {
  let response

  const vars = {}

  group(`page_1 - ${FRONTEND}/`, function () {
    // Home page
    response = http.get(`${FRONTEND}/`, {
      headers: {
        'Upgrade-Insecure-Requests': '1',
        'sec-ch-ua': '"Chromium";v="158", "Not.A/Brand";v="24", "Google Chrome";v="158"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
    })
    sleep(2.9)

    // Login
    response = http.put(`${SERVICE}/api/auth`, JSON.stringify({ email: EMAIL, password: PASSWORD }), {
      headers: commonHeaders,
    })
    if (!check(response, { 'login status equals 200': (r) => r.status === 200 })) {
      console.log(response.body)
      fail('Login was *not* 200')
    }

    vars['token1'] = jsonpath.query(response.json(), '$.token')[0]

    const authHeaders = { ...commonHeaders, authorization: `Bearer ${vars['token1']}` }
    sleep(13.7)

    // Menu
    response = http.get(`${SERVICE}/api/order/menu`, { headers: authHeaders })

    // Franchises / stores
    response = http.get(`${SERVICE}/api/franchise?page=0&limit=20&name=*`, { headers: authHeaders })
    sleep(12.5)

    // Current user
    response = http.get(`${SERVICE}/api/user/me`, { headers: authHeaders })
    sleep(2.9)

    // Purchase
    response = http.post(
      `${SERVICE}/api/order`,
      '{"items":[{"menuId":1,"description":"Veggie","price":0.0038}],"storeId":"1","franchiseId":1}',
      { headers: authHeaders }
    )
    if (!check(response, { 'purchase status equals 200': (r) => r.status === 200 })) {
      console.log(response.body)
      fail('Purchase was *not* 200')
    }

    // Pull the pizza JWT out of the purchase response instead of hard-coding it
    vars['pizzaJwt'] = jsonpath.query(response.json(), '$.jwt')[0]
    sleep(2.6)

    // Verify pizza
    response = http.post(`${FACTORY}/api/order/verify`, JSON.stringify({ jwt: vars['pizzaJwt'] }), {
      headers: { ...authHeaders, 'sec-fetch-site': 'cross-site' },
    })
    check(response, { 'verify status equals 200': (r) => r.status === 200 })
  })

  sleep(2.3)
}
