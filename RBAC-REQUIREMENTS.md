# Role-Based Access Control (RBAC) Requirements

## Overview
Implement user management and role-based access control for the AI Pipeline system.

## User Roles

### Admin
- Can view **all tasks** from all developers
- Can manage users (approve, change roles, deactivate)
- Can perform all task operations (create, view, clarify, retry, cancel)
- First user to register OR users matching `ADMIN_GITHUB_USERNAMES` env var become admin

### Developer
- Can only view and action on **their own tasks** (where `createdBy` matches their username)
- Can create new tasks
- Can clarify, retry, and cancel their own tasks only
- Cannot access admin panel or manage users

## User States

| State | Description |
|-------|-------------|
| `pending` | Newly registered, awaiting admin approval |
| `active` | Approved and can use the system |
| `inactive` | Deactivated by admin, cannot login |

## Onboarding Flow

1. User clicks "Login with GitHub"
2. GitHub OAuth validates user
3. System checks repo access (using user's GitHub token):
   - Checks membership in orgs listed in `ALLOWED_REPOS` (e.g., `mothership/`)
   - Checks collaborator access to specific repos (e.g., `owner/repo`)
4. System checks if user exists in database:
   - **New user**: Create with appropriate status:
     - `active` if: first user, admin username, OR has repo access
     - `pending` if: no repo access (needs admin approval)
   - **Existing user**: Check status
     - `active` → Allow login
     - `pending` + has repo access → Auto-activate and allow login
     - `pending` + no repo access → Show "Awaiting approval" message
     - `inactive` → Deny login
5. Users without repo access wait for admin approval in Admin panel

### Auto-Activation Rules

A user is **automatically activated** if ANY of these are true:
1. They are the first user to register
2. Their username is in `ADMIN_GITHUB_USERNAMES`
3. They have access to repos/orgs in `ALLOWED_REPOS`

This means team members who already have GitHub access don't need manual approval.

## Data Model

### User Schema
```typescript
{
  githubId: string;        // GitHub user ID (unique)
  username: string;        // GitHub username (unique)
  displayName: string;     // Full name
  email: string;           // Email address
  avatarUrl: string;       // Profile picture URL
  role: 'admin' | 'developer';
  status: 'pending' | 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date;
}
```

### Task Schema Update
- `createdBy` field already exists - will be used for ownership

## API Endpoints

### Auth (Updated)
- `GET /api/auth/me` - Returns user info including role and status

### Users (New - Admin only)
- `GET /api/users` - List all users (with filters)
- `GET /api/users/:id` - Get single user
- `PATCH /api/users/:id` - Update user (role, status)
- `GET /api/users/pending` - List pending users

### Tasks (Updated)
- `GET /api/tasks` - Filtered by ownership (devs see own, admins see all)
- `GET /api/tasks/:id` - Check ownership before returning
- `POST /api/tasks/:id/clarify` - Check ownership
- `POST /api/tasks/:id/retry` - Check ownership
- `DELETE /api/tasks/:id` - Check ownership

## Frontend Changes

### Navbar
- Show "Admin" link for admin users
- Show user role badge

### Admin Panel (`/admin/users`)
- List all users with status badges
- Approve/reject pending users
- Change user roles
- Deactivate users

### Dashboard
- Developers see only their tasks
- Admins see all tasks with "Created By" column

### Task Detail
- Return 403 if developer tries to access another's task

## Environment Variables

```env
# Comma-separated list of GitHub usernames who should be auto-admin
ADMIN_GITHUB_USERNAMES=krishna,john
```

## Security Considerations

1. All role checks happen server-side
2. Frontend role checks are for UX only
3. Guards protect all endpoints
4. Ownership verification on every task operation
5. Admins in env var bypass pending status

## Implementation Files

### Backend
- `src/common/schemas/user.schema.ts` - User model
- `src/users/users.module.ts` - Users module
- `src/users/users.service.ts` - User CRUD
- `src/users/users.controller.ts` - Admin endpoints
- `src/auth/roles.guard.ts` - Role-based guard
- `src/auth/roles.decorator.ts` - @Roles() decorator
- `src/tasks/ownership.guard.ts` - Task ownership guard
- Update `auth.service.ts` - Persist users
- Update `tasks.controller.ts` - Add guards
- Update `tasks.service.ts` - Filter by owner

### Frontend
- `web/src/types/index.ts` - Update User type
- `web/src/pages/AdminUsers.tsx` - User management page
- `web/src/components/Navbar.tsx` - Add admin link
- `web/src/App.tsx` - Add admin route
- `web/src/lib/api.ts` - Add user endpoints
