import { redirect } from 'next/navigation';

export default function Page() {
  // This ONLY runs when you visit localhost:3000/
  redirect('/dashboard');
}