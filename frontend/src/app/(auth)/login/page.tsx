import type { Metadata } from 'next';
import { LoginPage } from '../../../features/LoginPage';

export const metadata: Metadata = {
  title: 'Sign In | trace_itself',
  description: 'Sign in to trace_itself, a personal execution intelligence system for long-horizon learning and project operations.'
};

export default function LoginRoute() {
  return <LoginPage />;
}
