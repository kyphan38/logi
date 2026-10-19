import SubTabs from '@/components/SubTabs';

const TABS = [
  { href: '/targets', label: 'Week' },
  { href: '/reminders', label: 'Dates' },
];

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubTabs tabs={TABS} label="Plan" />
      {children}
    </>
  );
}
