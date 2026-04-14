import { Profile } from '../types';
interface Props { profile: Profile; }
export default function EmployeeDashboard({ profile }: Props) {
  return <div>Employee: {profile.name}</div>;
}
