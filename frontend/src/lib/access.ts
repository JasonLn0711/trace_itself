import type { User } from '../types';

export type AppFeature = 'project_tracer' | 'asr' | 'llm';

export function isAdmin(user: User | null | undefined) {
  return user?.role === 'admin';
}

export function canUseFeature(user: User | null | undefined, feature: AppFeature) {
  return Boolean(user?.capabilities?.[feature]);
}

export function canUseAudioWorkspace(user: User | null | undefined) {
  return canUseFeature(user, 'asr');
}

export function canUseMeetingNotes(user: User | null | undefined) {
  return canUseFeature(user, 'asr') && canUseFeature(user, 'llm');
}

export function preferredRouteForUser(user: User | null | undefined) {
  if (canUseFeature(user, 'project_tracer')) {
    return '/';
  }
  if (canUseAudioWorkspace(user)) {
    return '/meetings';
  }
  return '/updates';
}

export function canAccessPath(user: User | null | undefined, path: string) {
  if (path === '/' || path.startsWith('/projects') || path.startsWith('/tasks') || path.startsWith('/daily-logs')) {
    return canUseFeature(user, 'project_tracer');
  }
  if (path.startsWith('/users') || path.startsWith('/activity')) {
    return isAdmin(user);
  }
  if (path.startsWith('/asr')) {
    return canUseAudioWorkspace(user);
  }
  if (path.startsWith('/meetings')) {
    return canUseAudioWorkspace(user);
  }
  return true;
}

export function resolvePostLoginPath(user: User | null | undefined, nextPath: string) {
  if (canAccessPath(user, nextPath)) {
    return nextPath;
  }
  return preferredRouteForUser(user);
}
