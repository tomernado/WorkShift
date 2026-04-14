import { Profile } from '../types';
interface Props { profile: Profile; }
export default function ManagerDashboard({ profile }: Props) {
  return <div>Manager: {profile.name}</div>;
}
