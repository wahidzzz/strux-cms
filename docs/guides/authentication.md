# Authentication

Strux uses **JWT (JSON Web Tokens)** for API authentication. All write operations require a valid token.

## Registration

Create a new user account:

```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "username": "johndoe"
}
```

**Response** (201 Created):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "usr-001",
    "email": "user@example.com",
    "username": "johndoe",
    "role": "admin"
  }
}
```

> The first registered user automatically receives the **admin** role.

## Login

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response** (200 OK):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "usr-001",
    "email": "user@example.com",
    "username": "johndoe",
    "role": "admin"
  }
}
```

## Using Tokens

Include the JWT token in the `Authorization` header:

```bash
GET /api/articles
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

## Token Refresh

When the access token expires, use the refresh token:

```bash
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

## Session Management

Sessions are stored within user JSON files in `.cms/users/`. Expired sessions are automatically cleaned up.

## Roles

| Role | Permissions |
|------|------------|
| `admin` | Full access: CRUD, schema management, user management |
| `editor` | Create, read, update content. Cannot delete or manage users |
| `public` | Read-only access to published content |

## Security Notes

- Passwords are hashed with **bcrypt** (12 salt rounds)
- JWT tokens use the `JWT_SECRET` from `.env`
- Refresh tokens have a longer expiry and are stored server-side
- Always use HTTPS in production
- Never commit `.env` to version control
