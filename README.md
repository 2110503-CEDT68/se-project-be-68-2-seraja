# SERaja Backend API

Express + MongoDB backend for the SERaja campground booking platform. Provides authentication, campground management, bookings (with check-in/out and CSV export), and per-booking reviews.

## Live Deployment

- API base: <https://seraja-backend-production-d4a4.up.railway.app>
- Swagger UI: <https://seraja-backend-production-d4a4.up.railway.app/api-docs>
- API prefix: `/api/v1`

## Tech Stack

- Node.js + Express (CommonJS)
- MongoDB + Mongoose
- JWT authentication (Bearer token, optional cookie)
- Swagger UI (`/api-docs`) served from `openapi.yaml`
- Jest for unit/integration tests
- Hosted on Railway

## Project Structure

```text
.
├─ __tests__/         # Jest test suites
├─ config/            # DB connection, env config
├─ controllers/       # auth, campgrounds, bookings (incl. reviews)
├─ docs/diagrams/     # ERD and other architecture diagrams
├─ middleware/        # auth (protect / authorize)
├─ models/            # Mongoose models: User, Campground, Booking
├─ routes/            # Express routers
├─ seeds/             # seeder.js / deleteData.js
├─ openapi.yaml       # OpenAPI 3 spec (source of /api-docs)
└─ server.js          # App entry point
```

## Environment Variables

Create `config/config.env`:

```env
NODE_ENV=development
PORT=5000
MONGO_URI=<your-mongodb-uri>
JWT_SECRET=<your-jwt-secret>
JWT_EXPIRE=30d
JWT_COOKIE_EXPIRE=30
```

## Installation and Run

```bash
npm install
npm run dev
```

Production mode:

```bash
npm start
```

The server listens on `PORT` (default `5000`). On startup it prints `Server running in <NODE_ENV> mode on port <PORT>`.

## Available Scripts

| Script | Description |
| --- | --- |
| `npm start` | Start the server with Node (production mode). |
| `npm run dev` | Start the server with nodemon (auto-reload on changes). |
| `npm test` | Run the Jest test suite once (prints coverage summary). |
| `npm run test:watch` | Re-run tests automatically on file changes. |
| `npm run test:coverage` | Run tests and emit a full HTML coverage report. |
| `npm run test:ci` | CI-friendly run: `--ci --coverage --runInBand`. |
| `npm run format` | Format the codebase with Prettier. |
| `npm run format:check` | Verify formatting without writing changes (CI-friendly). |
| `npm run gen:types` | Generate TypeScript types from `openapi.yaml` to `types/generated.ts`. |
| `npm run seed` | Seed demo data into MongoDB. |
| `npm run seed:delete` | Wipe all collections. |

## API Documentation

- Local Swagger UI: `GET http://localhost:5000/api-docs`
- Production Swagger UI: <https://seraja-backend-production-d4a4.up.railway.app/api-docs>
- OpenAPI source: [`openapi.yaml`](./openapi.yaml)

## Authentication

`POST /api/v1/auth/register` and `POST /api/v1/auth/login` return a JWT.

Send the token on protected routes via the `Authorization` header:

```http
Authorization: Bearer <token>
```

Roles in the system:

- `user` — books campgrounds and writes reviews.
- `campOwner` — manages bookings for owned campgrounds (check-in / check-out).
- `admin` — full access; can soft-delete reviews and block re-reviewing.

## Endpoints

### Auth — `/api/v1/auth`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/register` | public | Create an account. |
| POST | `/login` | public | Get JWT. |
| GET | `/me` | protected | Current user profile. |
| GET | `/logout` | protected | Clear auth cookie. |

### Campgrounds — `/api/v1/campgrounds`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | public | List campgrounds (filter / sort / select). |
| GET | `/:id` | public | Get one campground. |
| POST | `/` | admin | Create a campground. |
| PUT | `/:id` | admin / campOwner | Update a campground. |
| DELETE | `/:id` | admin | Delete a campground. |
| GET | `/:id/reviews` | public | List active reviews for a campground (with avg rating). |

### Bookings — `/api/v1/bookings`

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | protected | List bookings (scoped by role). |
| GET | `/:id` | protected | Get one booking. |
| PUT | `/:id` | user / campOwner / admin | Update booking. |
| DELETE | `/:id` | user / campOwner / admin | Delete booking. |
| PUT | `/:id/cancel` | user / campOwner / admin | Cancel booking. |
| PUT | `/:id/checkin` | campOwner | Mark booking as checked-in. |
| PUT | `/:id/checkout` | campOwner | Mark booking as checked-out. |
| GET | `/export` | campOwner / admin | Export bookings as CSV. |
| GET | `/today-checkouts` | campOwner / admin | Bookings checking out today. |

Nested under campgrounds:

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/campgrounds/:campgroundId/bookings` | protected | List bookings for a campground. |
| POST | `/api/v1/campgrounds/:campgroundId/bookings` | user / campOwner / admin | Create a booking. |

### Reviews (per booking)

Reviews are stored on the `Booking` document and managed through the booking routes.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| PUT | `/api/v1/bookings/:id/review` | user | Create a review (only after check-out). |
| PUT | `/api/v1/bookings/:id/review/update` | user | Update an existing review. |
| DELETE | `/api/v1/bookings/:id/review` | user / admin | Soft-delete a review. |

Behavior:

- A user can only review their own booking, and only when status is `checked-out`.
- `review_rating` must be an integer 1–5; `review_comment` is optional.
- After a review is created, booking status becomes `reviewed`.
- A user-initiated delete clears the review and lets the user re-review.
- An admin-initiated delete sets the status to `can-not-review`, permanently blocking further reviews on that booking.

### Notes on Bookings

- A stay must be 1–3 nights.
- Guest bookings require both `guestName` and `guestTel`, and only `campOwner` or `admin` can create them.
- The flat `POST /api/v1/bookings` route exists in code but is legacy; create bookings via the nested campground route.

## Query Features

List endpoints support the standard filtering helpers:

- Field selection: `?select=name,province`
- Sorting: `?sort=checkInDate,-createdAt`
- Pagination: `?page=2&limit=20`
- Operator filters: `?capacity[gte]=10`, `?price[lt]=2000`

## Testing

The project uses [Jest](https://jestjs.io/) for unit testing. Tests live in `__tests__/` and mirror the `controllers/` structure. All Mongoose models are mocked with `jest.mock(...)`, so **no MongoDB instance and no `config/config.env` file are required to run the suite**.

### Run the tests

```bash
# Run the full suite once (prints a coverage summary)
npm test

# Re-run on file changes
npm run test:watch

# Run with a full HTML coverage report
npm run test:coverage

# CI-friendly run (no watch, deterministic ordering)
npm run test:ci
```

### Run tests one by one

Pass any standard Jest CLI flag through `npx jest`. The path can be a full path, a partial path, or even a regex — Jest treats the positional argument as a pattern matched against test file paths.

```bash
# 1. A single test file (full path)
npx jest __tests__/controllers/bookings.test.js

# 2. Match by partial filename (no path needed)
npx jest bookings
npx jest campgrounds

# 3. Filter by test name with -t (matches it/test/describe titles, regex)
npx jest -t "getCampgroundReview"
npx jest -t "returns 404"

# 4. Combine: one file + one test name
npx jest __tests__/controllers/campgrounds.test.js -t "deleteCampground"
npx jest bookings -t "should get all reviews"

# 5. Verbose — print every individual it/test as it runs
npx jest --verbose

# 6. Stop at the first failing test (handy while debugging)
npx jest --bail

# 7. Disable coverage for a faster single-test run
npx jest bookings --coverage=false
```

> Tip: in watch mode (`npm run test:watch`), press `p` to filter by filename, `t` to filter by test name, and `Enter` to re-run.

### Coverage

`npm run test:coverage` (or `npm test`, since coverage is on by default) writes a report to `coverage/`:

- Terminal summary — printed at the end of the run.
- HTML report — open [`coverage/lcov-report/index.html`](coverage/lcov-report/index.html) in a browser to drill into uncovered lines.
- LCOV file — `coverage/lcov.info` (for tools like Codecov / SonarQube).

### Coverage thresholds

Configured in `package.json` under the `jest` key:

```json
"coverageThreshold": {
  "./controllers/bookings.js": {
    "statements": 100,
    "branches": 100,
    "functions": 100,
    "lines": 100
  },
  "./controllers/campgrounds.js": {
    "statements": 100,
    "branches": 100,
    "functions": 100,
    "lines": 100
  }
}
```

If coverage on either file drops below 100% in any dimension, the test run will fail — this gate is enforced both locally and in CI.

### Adding a new test

1. Create `__tests__/<area>/<name>.test.js` (mirroring the source layout).
2. Mock external collaborators (Mongoose models, third-party SDKs) with `jest.mock(...)` at the top of the file.
3. Use `beforeEach(() => jest.clearAllMocks())` to keep tests isolated.
4. If you add a new file under `controllers/` that should be coverage-gated, extend `collectCoverageFrom` and `coverageThreshold` in `package.json`.

## Seed Data

```bash
npm run seed         # populate
npm run seed:delete  # wipe all collections
```

Seed contents:

- 2 admins
- 1 camp owner (owns all campgrounds)
- 10 regular users
- 10 campgrounds
- 26 bookings spread across `confirmed`, `checked-in`, `checked-out`, `cancelled`, `reviewed`, and `can-not-review` statuses (including a batch of 10 reviews on a single campground for review-listing demos)

Sample seeded accounts:

| Role | Email | Password |
| --- | --- | --- |
| admin | `admin1@example.com` | `admin123` |
| admin | `admin2@example.com` | `admin123` |
| campOwner | `james.owner@example.com` | `password123` |
| user | `james.one@example.com` | `password123` |
| user | `james.two@example.com` | `password123` |
| user | … through `james.ten@example.com` | `password123` |

## Security Middleware

Configured in `server.js`:

- `helmet` — secure HTTP headers
- `express-mongo-sanitize` — strips `$` / `.` operators from inputs
- `express-xss-sanitizer` — sanitizes XSS in request bodies
- `hpp` — prevents HTTP parameter pollution
- `cors` — cross-origin support
- `cookie-parser` — parses auth cookies

`express-rate-limit` is wired in but currently commented out.

## Deployment

The API is deployed on [Railway](https://railway.app). The production base URL is:

<https://seraja-backend-production-d4a4.up.railway.app>

To deploy your own instance, set the same environment variables (`MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRE`, `JWT_COOKIE_EXPIRE`, `NODE_ENV=production`) in your hosting provider and point it at `npm start`.

## Repository

- Source: <https://github.com/2110503-CEDT68/se-project-be-68-2-seraja>
- Issues: <https://github.com/2110503-CEDT68/se-project-be-68-2-seraja/issues>
