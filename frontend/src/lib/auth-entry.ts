export type PublicAuthProviderId = 'google' | 'github' | 'email';

export type PublicAuthProvider = {
  id: PublicAuthProviderId;
  label: string;
  detail: string;
  state: 'available' | 'planned';
};

export const PUBLIC_AUTH_PROVIDERS: PublicAuthProvider[] = [
  {
    id: 'google',
    label: 'Continue with Google',
    detail: 'Planned for the public multi-user rollout.',
    state: 'planned'
  },
  {
    id: 'github',
    label: 'Continue with GitHub',
    detail: 'Planned for engineering-friendly account access.',
    state: 'planned'
  },
  {
    id: 'email',
    label: 'Continue with Email',
    detail: 'Available now for private testing accounts.',
    state: 'available'
  }
];

export function authProviderMessage(providerId: PublicAuthProviderId) {
  switch (providerId) {
    case 'google':
      return 'Google sign-in will be enabled when the public auth rollout begins.';
    case 'github':
      return 'GitHub sign-in is planned for future public and developer-facing access.';
    case 'email':
    default:
      return '';
  }
}
