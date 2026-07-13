import { Role } from "@repo/shared-types";

/**
 * Permissions are coarse-grained capabilities the Admin CMS gates on. Event-scoped
 * roles (EVENT_ADMIN) additionally require an ownership check on the target event —
 * see `isEventScoped` and the API's event-scope helper.
 */
export const Permission = {
  EVENT_CREATE: "event:create",
  EVENT_READ: "event:read",
  EVENT_UPDATE: "event:update",
  EVENT_DELETE: "event:delete",
  EVENT_PUBLISH: "event:publish",
  PARTICIPANT_READ: "participant:read",
  PARTICIPANT_SHORTLIST: "participant:shortlist",
  ATTENDANCE_MANAGE: "attendance:manage",
  CERTIFICATE_MANAGE: "certificate:manage",
  SPEEDDATING_MANAGE: "speeddating:manage",
  ANALYTICS_READ: "analytics:read",
  SETTINGS_MANAGE: "settings:manage",
  USER_MANAGE: "user:manage",
  MARKETING_MANAGE: "marketing:manage",
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const ALL: Permission[] = Object.values(Permission);

/** Role → permissions matrix. Single source of truth shared by API and admin UI. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.SUPER_ADMIN]: ALL,
  [Role.EVENT_ADMIN]: [
    Permission.EVENT_CREATE,
    Permission.EVENT_READ,
    Permission.EVENT_UPDATE,
    Permission.EVENT_DELETE,
    Permission.EVENT_PUBLISH,
    Permission.PARTICIPANT_READ,
    Permission.PARTICIPANT_SHORTLIST,
    Permission.ATTENDANCE_MANAGE,
    Permission.CERTIFICATE_MANAGE,
    Permission.SPEEDDATING_MANAGE,
    Permission.ANALYTICS_READ,
    Permission.USER_MANAGE,
    Permission.MARKETING_MANAGE,
  ],
  [Role.HR_TA]: [
    Permission.EVENT_READ,
    Permission.PARTICIPANT_READ,
    Permission.PARTICIPANT_SHORTLIST,
    Permission.SPEEDDATING_MANAGE,
    Permission.USER_MANAGE,
    Permission.MARKETING_MANAGE,
  ],
  [Role.VIEWER]: [Permission.EVENT_READ, Permission.PARTICIPANT_READ, Permission.ANALYTICS_READ],
  [Role.PARTICIPANT]: [],
};

/** Roles that may access the Admin CMS at all. */
export const ADMIN_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.EVENT_ADMIN,
  Role.HR_TA,
  Role.VIEWER,
];

/** Whether a role can enter the Admin CMS. */
export function isAdminRole(role: Role): boolean {
  return ADMIN_ROLES.includes(role);
}

/** Whether a role holds a given permission (ignores event-scoping). */
export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Whether a role's grants are limited to events it owns/is assigned to.
 * SUPER_ADMIN sees everything; EVENT_ADMIN is scoped; HR_TA/VIEWER are read models
 * that the API scopes per feature.
 */
export function isEventScoped(role: Role): boolean {
  return role === Role.EVENT_ADMIN;
}
